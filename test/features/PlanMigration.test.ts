import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import {
  SavingBankUpgradeable,
  ERC20Mock,
  PrincipalVaultUpgradeable,
  InterestVaultUpgradeable,
  SavingBankNFT,
  NFTMetadataUpgradeable,
} from "../../typechain";

describe("SavingBank - Plan Migration Feature", function () {
  let admin: SignerWithAddress;
  let operator: SignerWithAddress;
  let user: SignerWithAddress;
  let feeReceiver: SignerWithAddress;
  let timelock: SignerWithAddress;

  let savingBank: SavingBankUpgradeable;
  let token: ERC20Mock;
  let principalVault: PrincipalVaultUpgradeable;
  let interestVault: InterestVaultUpgradeable;
  let nft: SavingBankNFT;
  let nftMetadata: NFTMetadataUpgradeable;

  // Plan constants
  const PLAN1_TENOR_DAYS = 30;
  const PLAN1_APR_BPS = 500; // 5%
  const PLAN2_TENOR_DAYS = 90;
  const PLAN2_APR_BPS = 1000; // 10%
  const MIN_DEPOSIT = ethers.parseUnits("100", 18);
  const MAX_DEPOSIT = ethers.parseUnits("1000000", 18);
  const PENALTY_BPS = 500; // 5%
  const DEPOSIT_AMOUNT = ethers.parseUnits("1000", 18);

  async function deploySavingBankFixture() {
    [admin, operator, user, feeReceiver, timelock] = await ethers.getSigners();

    // Deploy Mock Token
    const ERC20MockFactory = await ethers.getContractFactory("ERC20Mock");
    token = (await ERC20MockFactory.deploy()) as ERC20Mock;
    await token.waitForDeployment();

    // Deploy PrincipalVault
    const PrincipalVaultFactory = await ethers.getContractFactory(
      "PrincipalVaultUpgradeable",
    );
    const principalProxy = await upgrades.deployProxy(
      PrincipalVaultFactory,
      [await token.getAddress(), admin.address, operator.address],
      { initializer: "initialize", kind: "uups" },
    );
    await principalProxy.waitForDeployment();
    principalVault = principalProxy as unknown as PrincipalVaultUpgradeable;

    // Deploy InterestVault
    const InterestVaultFactory = await ethers.getContractFactory(
      "InterestVaultUpgradeable",
    );
    const interestProxy = await upgrades.deployProxy(
      InterestVaultFactory,
      [await token.getAddress(), admin.address, operator.address],
      { initializer: "initialize", kind: "uups" },
    );
    await interestProxy.waitForDeployment();
    interestVault = interestProxy as unknown as InterestVaultUpgradeable;

    // Deploy NFT Metadata
    const NFTMetadataFactory = await ethers.getContractFactory(
      "NFTMetadataUpgradeable",
    );
    const metadataProxy = await upgrades.deployProxy(
      NFTMetadataFactory,
      [admin.address, admin.address, "ipfs://"],
      { initializer: "initialize", kind: "uups" },
    );
    await metadataProxy.waitForDeployment();
    nftMetadata = metadataProxy as unknown as NFTMetadataUpgradeable;

    // Deploy NFT
    const SavingBankNFTFactory = await ethers.getContractFactory(
      "SavingBankNFT",
    );
    nft = (await SavingBankNFTFactory.deploy(
      admin.address,
      operator.address,
      await nftMetadata.getAddress(),
    )) as SavingBankNFT;
    await nft.waitForDeployment();
    await nftMetadata.connect(admin).setNFTContract(await nft.getAddress());

    // Deploy SavingBank
    const SavingBankFactory = await ethers.getContractFactory(
      "SavingBankUpgradeable",
    );
    const savingBankProxy = await upgrades.deployProxy(
      SavingBankFactory,
      [
        await token.getAddress(),
        await principalVault.getAddress(),
        await interestVault.getAddress(),
        await nft.getAddress(),
        feeReceiver.address,
        admin.address,
        operator.address,
        timelock.address,
      ],
      { initializer: "initialize", kind: "uups" },
    );
    await savingBankProxy.waitForDeployment();
    savingBank = savingBankProxy as unknown as SavingBankUpgradeable;

    // Setup permissions
    const OPERATOR_ROLE = await principalVault.OPERATOR_ROLE();
    await principalVault
      .connect(admin)
      .grantRole(OPERATOR_ROLE, await savingBank.getAddress());
    await interestVault
      .connect(admin)
      .grantRole(OPERATOR_ROLE, await savingBank.getAddress());
    await nft.connect(admin).setSavingBank(await savingBank.getAddress());

    // Create 2 plans
    await savingBank
      .connect(operator)
      .createPlan(
        PLAN1_TENOR_DAYS,
        PLAN1_APR_BPS,
        MIN_DEPOSIT,
        MAX_DEPOSIT,
        PENALTY_BPS,
      );

    await savingBank
      .connect(operator)
      .createPlan(
        PLAN2_TENOR_DAYS,
        PLAN2_APR_BPS,
        MIN_DEPOSIT,
        MAX_DEPOSIT,
        PENALTY_BPS,
      );

    // Mint tokens
    await token.mint(user.address, DEPOSIT_AMOUNT * 10n);
    await token.mint(admin.address, ethers.parseUnits("100000", 18));

    // Fund InterestVault
    const fundAmount = ethers.parseUnits("100000", 18);
    await token
      .connect(admin)
      .approve(await interestVault.getAddress(), fundAmount);
    await interestVault.connect(admin).depositFund(fundAmount);

    // Approve PrincipalVault
    await token
      .connect(user)
      .approve(await principalVault.getAddress(), DEPOSIT_AMOUNT * 10n);

    return {
      savingBank,
      token,
      principalVault,
      interestVault,
      nft,
      nftMetadata,
      admin,
      operator,
      user,
      feeReceiver,
      timelock,
    };
  }

  describe("3.3.1 - Basic Plan Migration", function () {
    it("Should migrate plan successfully", async function () {
      const { savingBank, user } = await loadFixture(deploySavingBankFixture);

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);

      await time.increase(10 * 24 * 60 * 60); // 10 days

      await savingBank.connect(user).migratePlan(1, 2);

      const oldDeposit = await savingBank.depositCertificates(1);
      const newDeposit = await savingBank.depositCertificates(2);

      expect(oldDeposit.status).to.equal(3); // Renewed
      expect(newDeposit.status).to.equal(0); // Active
      expect(newDeposit.planId).to.equal(2);
    });

    it("Should emit PlanMigrated event", async function () {
      const { savingBank, user } = await loadFixture(deploySavingBankFixture);

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);
      await time.increase(10 * 24 * 60 * 60);

      // FIX 1: Remove expect.anything()
      await expect(savingBank.connect(user).migratePlan(1, 2))
        .to.emit(savingBank, "PlanMigrated");
    });
  });

  describe("3.3.2 - Interest Calculation", function () {
    it("Should calculate accrued interest correctly", async function () {
      const { savingBank, user } = await loadFixture(deploySavingBankFixture);

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);
      await time.increase(10 * 24 * 60 * 60);

      const preview = await savingBank.getMigrationPreview(1, 2);
      
      // Interest = principal * APR * time / (365 days * 10000)
      const expectedInterest =
        (DEPOSIT_AMOUNT * BigInt(PLAN1_APR_BPS) * BigInt(10 * 24 * 60 * 60)) /
        (BigInt(365 * 24 * 60 * 60) * 10000n);

      expect(preview.currentInterest).to.be.closeTo(
        expectedInterest,
        ethers.parseUnits("0.1", 18),
      );
    });

    it("Should handle auto-compound before migration", async function () {
      const { savingBank, user } = await loadFixture(deploySavingBankFixture);

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);
      await savingBank.connect(user).enableAutoCompound(1);

      await time.increase(7 * 24 * 60 * 60);
      await savingBank.connect(user).compound(1);

      const depositBefore = await savingBank.depositCertificates(1);
      const principalBefore = depositBefore.principal;

      await time.increase(5 * 24 * 60 * 60);
      
      // Get preview to calculate expected principal after fee
      const preview = await savingBank.getMigrationPreview(1, 2);
      
      await savingBank.connect(user).migratePlan(1, 2);

      const newDeposit = await savingBank.depositCertificates(2);
      
      // New principal = old principal + interest - migration fee
      const expectedPrincipal = principalBefore + preview.currentInterest - preview.fee;
      expect(newDeposit.principal).to.be.closeTo(
        expectedPrincipal,
        ethers.parseUnits("1", 18),
      );
    });

    it("Should calculate interest after partial withdrawal", async function () {
      const { savingBank, user } = await loadFixture(deploySavingBankFixture);

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);
      await time.increase(5 * 24 * 60 * 60);

      // Partial withdraw 200
      await savingBank
        .connect(user)
        .partialWithdraw(1, ethers.parseUnits("200", 18));

      await time.increase(5 * 24 * 60 * 60);

      const preview = await savingBank.getMigrationPreview(1, 2);
      
      // Interest should be on remaining principal (800)
      const remainingPrincipal = DEPOSIT_AMOUNT - ethers.parseUnits("200", 18);
      const expectedInterest =
        (remainingPrincipal * BigInt(PLAN1_APR_BPS) * BigInt(10 * 24 * 60 * 60)) /
        (BigInt(365 * 24 * 60 * 60) * 10000n);

      expect(preview.currentInterest).to.be.closeTo(
        expectedInterest,
        ethers.parseUnits("0.5", 18),
      );
    });
  });

  describe("3.3.3 - Migration Fee", function () {
    it("Should charge 0.5% migration fee by default", async function () {
      const { savingBank, user, feeReceiver, token } = await loadFixture(
        deploySavingBankFixture,
      );

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);
      await time.increase(10 * 24 * 60 * 60);

      const preview = await savingBank.getMigrationPreview(1, 2);
      const principalWithInterest = DEPOSIT_AMOUNT + preview.currentInterest;
      const expectedFee = (principalWithInterest * 50n) / 10000n; // 0.5%

      const feeBalanceBefore = await token.balanceOf(feeReceiver.address);
      await savingBank.connect(user).migratePlan(1, 2);
      const feeBalanceAfter = await token.balanceOf(feeReceiver.address);

      expect(feeBalanceAfter - feeBalanceBefore).to.be.closeTo(
        expectedFee,
        ethers.parseUnits("0.01", 18),
      );
    });

    it("Should allow admin to update migration fee", async function () {
      const { savingBank, admin } = await loadFixture(deploySavingBankFixture);

      const newFee = 100; // 1%
      await savingBank.connect(admin).setMigrationFee(newFee);

      const fee = await savingBank.getMigrationFee();
      expect(fee).to.equal(newFee);
    });

    it("Should not allow fee above 5%", async function () {
      const { savingBank, admin } = await loadFixture(deploySavingBankFixture);

      await expect(
        savingBank.connect(admin).setMigrationFee(600),
      ).to.be.revertedWithCustomError(savingBank, "MigrationFeeExceedsMax");
    });

    it("Should emit MigrationFeeUpdated event", async function () {
      const { savingBank, admin } = await loadFixture(deploySavingBankFixture);

      await expect(savingBank.connect(admin).setMigrationFee(100))
        .to.emit(savingBank, "MigrationFeeUpdated")
        .withArgs(50, 100);
    });
  });

  describe("3.3.4 - New Deposit with New Plan", function () {
    it("Should create new deposit with correct plan parameters", async function () {
      const { savingBank, user } = await loadFixture(deploySavingBankFixture);

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);
      await time.increase(10 * 24 * 60 * 60);

      await savingBank.connect(user).migratePlan(1, 2);

      const newDeposit = await savingBank.depositCertificates(2);
      expect(newDeposit.planId).to.equal(2);
      expect(newDeposit.snapshotAprBps).to.equal(PLAN2_APR_BPS);
      expect(newDeposit.snapshotTenorDays).to.equal(PLAN2_TENOR_DAYS);
    });

    it("Should reset auto-compound to false", async function () {
      const { savingBank, user } = await loadFixture(deploySavingBankFixture);

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);
      await savingBank.connect(user).enableAutoCompound(1);

      await time.increase(10 * 24 * 60 * 60);
      await savingBank.connect(user).migratePlan(1, 2);

      const newDeposit = await savingBank.depositCertificates(2);
      expect(newDeposit.autoCompound).to.be.false;
    });

    it("Should reset partial withdrawal tracking", async function () {
      const { savingBank, user } = await loadFixture(deploySavingBankFixture);

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);
      await time.increase(5 * 24 * 60 * 60);

      await savingBank
        .connect(user)
        .partialWithdraw(1, ethers.parseUnits("200", 18));

      await time.increase(5 * 24 * 60 * 60);
      await savingBank.connect(user).migratePlan(1, 2);

      const newDeposit = await savingBank.depositCertificates(2);
      expect(newDeposit.totalPartialWithdrawn).to.equal(0);
    });

    it("Should set correct maturity date", async function () {
      const { savingBank, user } = await loadFixture(deploySavingBankFixture);

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);
      await time.increase(10 * 24 * 60 * 60);

      const migrationTime = await time.latest();
      await savingBank.connect(user).migratePlan(1, 2);

      const newDeposit = await savingBank.depositCertificates(2);
      const expectedMaturity = migrationTime + PLAN2_TENOR_DAYS * 24 * 60 * 60;

      expect(newDeposit.maturityAt).to.be.closeTo(
        expectedMaturity,
        10, // 10 seconds tolerance
      );
    });
  });

  describe("3.3.5 - NFT Handling", function () {
    it("Should burn old NFT", async function () {
      const { savingBank, user, nft } = await loadFixture(
        deploySavingBankFixture,
      );

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);
      await time.increase(10 * 24 * 60 * 60);

      await savingBank.connect(user).migratePlan(1, 2);

      await expect(nft.ownerOf(1)).to.be.reverted;
    });

    it("Should mint new NFT with correct parameters", async function () {
      const { savingBank, user, nft } = await loadFixture(
        deploySavingBankFixture,
      );

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);
      await time.increase(10 * 24 * 60 * 60);

      await savingBank.connect(user).migratePlan(1, 2);

      const owner = await nft.ownerOf(2);
      expect(owner).to.equal(user.address);
    });
  });

  describe("3.3.6 - Migration Preview", function () {
    it("Should return correct preview data", async function () {
      const { savingBank, user } = await loadFixture(deploySavingBankFixture);

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);
      await time.increase(10 * 24 * 60 * 60);

      const preview = await savingBank.getMigrationPreview(1, 2);

      expect(preview.currentInterest).to.be.gt(0);
      expect(preview.newMaturityDate).to.be.gt(await time.latest());
      expect(preview.fee).to.be.gt(0);
      
      // newPrincipalAmount = DEPOSIT_AMOUNT + interest - fee
      const expectedPrincipal = DEPOSIT_AMOUNT + preview.currentInterest - preview.fee;
      expect(preview.newPrincipalAmount).to.be.closeTo(
        expectedPrincipal,
        ethers.parseUnits("0.1", 18),
      );
    });

    it("Should show fee equals 0.5% of total", async function () {
      const { savingBank, user } = await loadFixture(deploySavingBankFixture);

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);
      await time.increase(10 * 24 * 60 * 60);

      const preview = await savingBank.getMigrationPreview(1, 2);
      const total = DEPOSIT_AMOUNT + preview.currentInterest;
      const expectedFee = (total * 50n) / 10000n;

      expect(preview.fee).to.be.closeTo(
        expectedFee,
        ethers.parseUnits("0.001", 18),
      );
    });
  });

  describe("3.3.7 - Validation Tests", function () {
    it("Should revert if not owner", async function () {
      const { savingBank, user, operator } = await loadFixture(
        deploySavingBankFixture,
      );

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);
      await time.increase(10 * 24 * 60 * 60);

      await expect(
        savingBank.connect(operator).migratePlan(1, 2),
      ).to.be.revertedWithCustomError(savingBank, "NotOwner");
    });

    it("Should revert if deposit not active", async function () {
      const { savingBank, user } = await loadFixture(deploySavingBankFixture);

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);
      await time.increase(PLAN1_TENOR_DAYS * 24 * 60 * 60);
      await savingBank.connect(user).withdraw(1);

      await expect(
        savingBank.connect(user).migratePlan(1, 2),
      ).to.be.revertedWithCustomError(savingBank, "NotActiveDeposit");
    });

    it("Should revert if already matured", async function () {
      const { savingBank, user } = await loadFixture(deploySavingBankFixture);

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);
      await time.increase(PLAN1_TENOR_DAYS * 24 * 60 * 60);

      await expect(
        savingBank.connect(user).migratePlan(1, 2),
      ).to.be.revertedWithCustomError(savingBank, "AlreadyMatured");
    });

    it("Should revert if same plan", async function () {
      const { savingBank, user } = await loadFixture(deploySavingBankFixture);

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);
      await time.increase(10 * 24 * 60 * 60);

      await expect(
        savingBank.connect(user).migratePlan(1, 1),
      ).to.be.revertedWithCustomError(savingBank, "SamePlan");
    });

    it("Should revert if new plan not enabled", async function () {
      const { savingBank, user, operator } = await loadFixture(
        deploySavingBankFixture,
      );

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);
      
      // FIX 4: Use disablePlan instead of togglePlan
      await savingBank.connect(operator).updatePlanStatus(2, false);

      await time.increase(10 * 24 * 60 * 60);

      await expect(
        savingBank.connect(user).migratePlan(1, 2),
      ).to.be.revertedWithCustomError(savingBank, "NotEnabledPlan");
    });

    it("Should revert if new principal below min deposit", async function () {
      const { savingBank, user, operator } = await loadFixture(
        deploySavingBankFixture,
      );

      // Create plan with high minimum
      await savingBank
        .connect(operator)
        .createPlan(
          90,
          1000,
          ethers.parseUnits("5000", 18), // High minimum
          MAX_DEPOSIT,
          PENALTY_BPS,
        );

      await savingBank
        .connect(user)
        .openDepositCertificate(1, ethers.parseUnits("1000", 18));
      await time.increase(10 * 24 * 60 * 60);

      await expect(
        savingBank.connect(user).migratePlan(1, 3),
      ).to.be.revertedWithCustomError(savingBank, "InvalidAmount");
    });
  });

  describe("3.3.8 - Edge Cases", function () {
    it("Should handle migration on day 1", async function () {
      const { savingBank, user } = await loadFixture(deploySavingBankFixture);

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);
      await time.increase(1 * 60 * 60); // 1 hour

      await expect(savingBank.connect(user).migratePlan(1, 2)).to.not.be
        .reverted;
    });

    it("Should handle migration just before maturity", async function () {
      const { savingBank, user } = await loadFixture(deploySavingBankFixture);

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);
      await time.increase(PLAN1_TENOR_DAYS * 24 * 60 * 60 - 60); // 1 min before

      await expect(savingBank.connect(user).migratePlan(1, 2)).to.not.be
        .reverted;
    });

    it("Should allow multiple migrations", async function () {
      const { savingBank, user, operator } = await loadFixture(
        deploySavingBankFixture,
      );

      // Create plan 3
      await savingBank
        .connect(operator)
        .createPlan(60, 800, MIN_DEPOSIT, MAX_DEPOSIT, PENALTY_BPS);

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);
      await time.increase(5 * 24 * 60 * 60);

      await savingBank.connect(user).migratePlan(1, 2);

      await time.increase(5 * 24 * 60 * 60);
      await savingBank.connect(user).migratePlan(2, 3);

      const deposit = await savingBank.depositCertificates(3);
      expect(deposit.status).to.equal(0); // Active
    });

    it("Should work with zero interest edge case", async function () {
      const { savingBank, user } = await loadFixture(deploySavingBankFixture);

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);
      await time.increase(1); // 1 second - very small interest

      await expect(savingBank.connect(user).migratePlan(1, 2)).to.not.be
        .reverted;
    });
  });

  describe("3.3.9 - canMigrate Helper", function () {
    it("Should return true for eligible deposit", async function () {
      const { savingBank, user } = await loadFixture(deploySavingBankFixture);

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);
      await time.increase(10 * 24 * 60 * 60);

      const [eligible, reason] = await savingBank.canMigrate(1);
      expect(eligible).to.be.true;
      expect(reason).to.equal("");
    });

    it("Should return false for matured deposit", async function () {
      const { savingBank, user } = await loadFixture(deploySavingBankFixture);

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);
      await time.increase(PLAN1_TENOR_DAYS * 24 * 60 * 60);

      const [eligible, reason] = await savingBank.canMigrate(1);
      expect(eligible).to.be.false;
      expect(reason).to.equal("Already matured");
    });

    it("Should return false for withdrawn deposit", async function () {
      const { savingBank, user } = await loadFixture(deploySavingBankFixture);

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);
      await time.increase(PLAN1_TENOR_DAYS * 24 * 60 * 60);
      await savingBank.connect(user).withdraw(1);

      const [eligible, reason] = await savingBank.canMigrate(1);
      expect(eligible).to.be.false;
      expect(reason).to.equal("Deposit not active");
    });
  });
});