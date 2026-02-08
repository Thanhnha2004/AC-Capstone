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

describe("SavingBank - Auto Compound Feature", function () {
  // Signers
  let admin: SignerWithAddress;
  let operator: SignerWithAddress;
  let user: SignerWithAddress;
  let feeReceiver: SignerWithAddress;
  let timelock: SignerWithAddress;

  // Contract instances with TypeChain types
  let savingBank: SavingBankUpgradeable;
  let token: ERC20Mock;
  let principalVault: PrincipalVaultUpgradeable;
  let interestVault: InterestVaultUpgradeable;
  let nft: SavingBankNFT;
  let nftMetadata: NFTMetadataUpgradeable;

  // Constants
  const PLAN_TENOR_DAYS = 180; // 6 months
  const PLAN_APR_BPS = 1000; // 10%
  const MIN_DEPOSIT = ethers.parseUnits("100", 18);
  const MAX_DEPOSIT = ethers.parseUnits("1000000", 18);
  const PENALTY_BPS = 500; // 5%
  const DEPOSIT_AMOUNT = ethers.parseUnits("1000", 18);

  /**
   * Deploy fixture for testing
   * Deploys all contracts in upgradeable mode
   */
  async function deploySavingBankFixture() {
    [admin, operator, user, feeReceiver, timelock] = await ethers.getSigners();

    // 1. Deploy Mock Token
    const ERC20MockFactory = await ethers.getContractFactory("ERC20Mock");
    token = (await ERC20MockFactory.deploy()) as ERC20Mock;
    await token.waitForDeployment();

    // 2. Deploy PrincipalVault Upgradeable
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

    // 3. Deploy InterestVault Upgradeable
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

    // 4. Deploy NFT Metadata Upgradeable
    const NFTMetadataFactory = await ethers.getContractFactory(
      "NFTMetadataUpgradeable",
    );
    const metadataProxy = await upgrades.deployProxy(
      NFTMetadataFactory,
      [admin.address, admin.address, "ipfs://"], // Use admin as dummy, will update later
      { initializer: "initialize", kind: "uups" },
    );
    await metadataProxy.waitForDeployment();
    nftMetadata = metadataProxy as unknown as NFTMetadataUpgradeable;

    // 5. Deploy NFT (Non-upgradeable)
    const SavingBankNFTFactory = await ethers.getContractFactory(
      "SavingBankNFT",
    );
    nft = (await SavingBankNFTFactory.deploy(
      admin.address,
      operator.address,
      await nftMetadata.getAddress(),
    )) as SavingBankNFT;
    await nft.waitForDeployment();

    // 6. Update NFT contract address in metadata
    await nftMetadata.connect(admin).setNFTContract(await nft.getAddress());

    // 7. Deploy SavingBank Upgradeable
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

    // 8. Setup permissions
    const OPERATOR_ROLE = await principalVault.OPERATOR_ROLE();
    await principalVault
      .connect(admin)
      .grantRole(OPERATOR_ROLE, await savingBank.getAddress());
    await interestVault
      .connect(admin)
      .grantRole(OPERATOR_ROLE, await savingBank.getAddress());

    // Set SavingBank address in NFT
    await nft.connect(admin).setSavingBank(await savingBank.getAddress());

    // 9. Create a saving plan
    await savingBank
      .connect(operator)
      .createPlan(
        PLAN_TENOR_DAYS,
        PLAN_APR_BPS,
        MIN_DEPOSIT,
        MAX_DEPOSIT,
        PENALTY_BPS,
      );

    // 10. Mint tokens for testing
    await token.mint(user.address, DEPOSIT_AMOUNT * 10n);
    await token.mint(admin.address, ethers.parseUnits("100000", 18));

    // 11. Fund InterestVault properly using depositFund
    const fundAmount = ethers.parseUnits("100000", 18);
    await token
      .connect(admin)
      .approve(await interestVault.getAddress(), fundAmount);
    await interestVault.connect(admin).depositFund(fundAmount);

    // 12. Approve PrincipalVault for user deposits
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

  describe("3.1.1 - Auto-compound Storage", function () {
    it("Should initialize auto-compound as true by default", async function () {
      const { savingBank, user } = await loadFixture(deploySavingBankFixture);

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);

      const deposit = await savingBank.depositCertificates(1);
      const currentTime = await time.latest();

      expect(deposit.autoCompound).to.be.true;
      expect(deposit.lastCompoundTime).to.equal(currentTime);
      expect(deposit.accumulatedInterest).to.equal(0);
    });
  });

  describe("3.1.2 - Enable/Disable Auto-compound", function () {
    it("Should disable auto-compound successfully", async function () {
      const { savingBank, user } = await loadFixture(deploySavingBankFixture);

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);

      const depositBefore = await savingBank.depositCertificates(1);
      expect(depositBefore.autoCompound).to.be.true;

      await savingBank.connect(user).disableAutoCompound(1);

      const depositAfter = await savingBank.depositCertificates(1);
      expect(depositAfter.autoCompound).to.be.false;
    });

    it("Should compound accumulated interest before disabling", async function () {
      const { savingBank, user } = await loadFixture(deploySavingBankFixture);

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);

      await time.increase(10 * 24 * 60 * 60);

      const depositBefore = await savingBank.depositCertificates(1);
      const principalBefore = depositBefore.principal;

      await savingBank.connect(user).disableAutoCompound(1);

      const depositAfter = await savingBank.depositCertificates(1);

      expect(depositAfter.principal).to.be.gt(principalBefore);
      expect(depositAfter.accumulatedInterest).to.be.gt(0);
    });

    it("Should enable auto-compound after disabling", async function () {
      const { savingBank, user } = await loadFixture(deploySavingBankFixture);

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);

      await savingBank.connect(user).disableAutoCompound(1);

      const deposit1 = await savingBank.depositCertificates(1);
      expect(deposit1.autoCompound).to.be.false;

      await savingBank.connect(user).enableAutoCompound(1);

      const deposit2 = await savingBank.depositCertificates(1);
      expect(deposit2.autoCompound).to.be.true;
    });

    it("Should revert if trying to disable when already disabled", async function () {
      const { savingBank, user } = await loadFixture(deploySavingBankFixture);

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);

      await savingBank.connect(user).disableAutoCompound(1);

      await expect(
        savingBank.connect(user).disableAutoCompound(1),
      ).to.be.revertedWithCustomError(savingBank, "AutoCompoundNotEnabled");
    });

    it("Should revert if trying to enable when already enabled", async function () {
      const { savingBank, user } = await loadFixture(deploySavingBankFixture);

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);

      await expect(
        savingBank.connect(user).enableAutoCompound(1),
      ).to.be.revertedWithCustomError(savingBank, "AutoCompoundAlreadyEnabled");
    });

    it("Should revert if not owner", async function () {
      const { savingBank, user, operator } = await loadFixture(
        deploySavingBankFixture,
      );

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);

      await expect(
        savingBank.connect(operator).disableAutoCompound(1),
      ).to.be.revertedWithCustomError(savingBank, "NotOwner");

      await savingBank.connect(user).disableAutoCompound(1);

      await expect(
        savingBank.connect(operator).enableAutoCompound(1),
      ).to.be.revertedWithCustomError(savingBank, "NotOwner");
    });

    it("Should revert if deposit already matured", async function () {
      const { savingBank, user } = await loadFixture(deploySavingBankFixture);

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);

      await time.increase(PLAN_TENOR_DAYS * 24 * 60 * 60 + 1);

      await expect(
        savingBank.connect(user).disableAutoCompound(1),
      ).to.be.revertedWithCustomError(savingBank, "DepositAlreadyMatured");
    });

    it("Should emit AutoCompoundDisabled event", async function () {
      const { savingBank, user } = await loadFixture(deploySavingBankFixture);

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);

      await expect(savingBank.connect(user).disableAutoCompound(1))
        .to.emit(savingBank, "AutoCompoundDisabled")
        .withArgs(1, user.address);
    });

    it("Should emit AutoCompoundEnabled event", async function () {
      const { savingBank, user } = await loadFixture(deploySavingBankFixture);

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);

      await savingBank.connect(user).disableAutoCompound(1);

      await expect(savingBank.connect(user).enableAutoCompound(1))
        .to.emit(savingBank, "AutoCompoundEnabled")
        .withArgs(1, user.address);
    });
  });

  describe("3.1.3 - Compound Logic", function () {
    it("Should compound interest after minimum interval", async function () {
      const { savingBank, user } = await loadFixture(deploySavingBankFixture);

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);

      await time.increase(7 * 24 * 60 * 60);

      const depositBefore = await savingBank.depositCertificates(1);
      const principalBefore = depositBefore.principal;

      await savingBank.connect(user).compound(1);

      const depositAfter = await savingBank.depositCertificates(1);

      const expectedInterest =
        (DEPOSIT_AMOUNT * BigInt(PLAN_APR_BPS) * BigInt(7 * 24 * 60 * 60)) /
        (BigInt(365 * 24 * 60 * 60) * BigInt(10000));

      expect(depositAfter.principal).to.be.gt(principalBefore);
      expect(depositAfter.accumulatedInterest).to.be.closeTo(
        expectedInterest,
        ethers.parseUnits("1", 15), // 0.001 tolerance
      );
      expect(depositAfter.lastCompoundTime).to.be.gt(
        depositBefore.lastCompoundTime,
      );
    });

    it("Should revert if compound too early", async function () {
      const { savingBank, user } = await loadFixture(deploySavingBankFixture);

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);

      await time.increase(6 * 24 * 60 * 60);

      await expect(
        savingBank.connect(user).compound(1),
      ).to.be.revertedWithCustomError(savingBank, "CompoundTooEarly");
    });

    it("Should revert if auto-compound not enabled", async function () {
      const { savingBank, user } = await loadFixture(deploySavingBankFixture);

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);

      await savingBank.connect(user).disableAutoCompound(1);
      await time.increase(7 * 24 * 60 * 60);

      await expect(
        savingBank.connect(user).compound(1),
      ).to.be.revertedWithCustomError(savingBank, "AutoCompoundNotEnabled");
    });

    it("Should revert if deposit already matured", async function () {
      const { savingBank, user } = await loadFixture(deploySavingBankFixture);

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);

      await time.increase(PLAN_TENOR_DAYS * 24 * 60 * 60 + 1);

      await expect(
        savingBank.connect(user).compound(1),
      ).to.be.revertedWithCustomError(savingBank, "DepositAlreadyMatured");
    });

    it("Should compound multiple times", async function () {
      const { savingBank, user } = await loadFixture(deploySavingBankFixture);

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);

      await time.increase(7 * 24 * 60 * 60);
      await savingBank.connect(user).compound(1);

      const deposit1 = await savingBank.depositCertificates(1);
      const principal1 = deposit1.principal;

      await time.increase(7 * 24 * 60 * 60);
      await savingBank.connect(user).compound(1);

      const deposit2 = await savingBank.depositCertificates(1);

      expect(deposit2.principal).to.be.gt(principal1);
      expect(deposit2.accumulatedInterest).to.be.gt(
        deposit1.accumulatedInterest,
      );
    });

    it("Should emit Compounded event", async function () {
      const { savingBank, user } = await loadFixture(deploySavingBankFixture);

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);

      await time.increase(7 * 24 * 60 * 60);

      const tx = await savingBank.connect(user).compound(1);
      await expect(tx).to.emit(savingBank, "Compounded");
    });
  });

  describe("3.1.4 - Batch Compound", function () {
    it("Should compound multiple deposits", async function () {
      const { savingBank, user, token, principalVault } = await loadFixture(
        deploySavingBankFixture,
      );

      // Approve additional funds
      await token
        .connect(user)
        .approve(await principalVault.getAddress(), DEPOSIT_AMOUNT * 3n);

      // Create 3 deposits
      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);
      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);
      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);

      await time.increase(7 * 24 * 60 * 60);

      await savingBank.connect(user).compoundBatch([1, 2, 3]);

      const deposit1 = await savingBank.depositCertificates(1);
      const deposit2 = await savingBank.depositCertificates(2);
      const deposit3 = await savingBank.depositCertificates(3);

      expect(deposit1.principal).to.be.gt(DEPOSIT_AMOUNT);
      expect(deposit2.principal).to.be.gt(DEPOSIT_AMOUNT);
      expect(deposit3.principal).to.be.gt(DEPOSIT_AMOUNT);
    });

    it("Should continue on failure and emit CompoundFailed", async function () {
      const { savingBank, user, token, principalVault } = await loadFixture(
        deploySavingBankFixture,
      );

      await token
        .connect(user)
        .approve(await principalVault.getAddress(), DEPOSIT_AMOUNT * 3n);

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);
      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);
      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);

      await time.increase(6 * 24 * 60 * 60);

      await expect(savingBank.connect(user).compoundBatch([1, 2, 3])).to.emit(
        savingBank,
        "CompoundFailed",
      );
    });

    it("Should emit CompoundedBatch event", async function () {
      const { savingBank, user, token, principalVault } = await loadFixture(
        deploySavingBankFixture,
      );

      await token
        .connect(user)
        .approve(await principalVault.getAddress(), DEPOSIT_AMOUNT * 3n);

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);
      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);
      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);

      await time.increase(7 * 24 * 60 * 60);

      const tx = await savingBank.connect(user).compoundBatch([1, 2, 3]);
      await expect(tx).to.emit(savingBank, "CompoundedBatch");
    });
  });

  describe("3.1.5 - Withdraw with Auto-compound", function () {
    it("Should compound before withdraw at maturity", async function () {
      const { savingBank, user, token } = await loadFixture(
        deploySavingBankFixture,
      );

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);

      await time.increase(PLAN_TENOR_DAYS * 24 * 60 * 60);

      const balanceBefore = await token.balanceOf(user.address);
      await savingBank.connect(user).withdraw(1);
      const balanceAfter = await token.balanceOf(user.address);

      const expectedInterest =
        (DEPOSIT_AMOUNT *
          BigInt(PLAN_APR_BPS) *
          BigInt(PLAN_TENOR_DAYS * 24 * 60 * 60)) /
        (BigInt(365 * 24 * 60 * 60) * BigInt(10000));
      const expectedTotal = DEPOSIT_AMOUNT + expectedInterest;

      expect(balanceAfter - balanceBefore).to.be.closeTo(
        expectedTotal,
        ethers.parseUnits("1", 18),
      );
    });

    it("Should calculate interest correctly after disable", async function () {
      const { savingBank, user, token } = await loadFixture(
        deploySavingBankFixture,
      );

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);

      await time.increase(7 * 24 * 60 * 60);
      await savingBank.connect(user).compound(1);

      const deposit1 = await savingBank.depositCertificates(1);
      const principalAfterCompound = deposit1.principal;

      await savingBank.connect(user).disableAutoCompound(1);

      const deposit2 = await savingBank.depositCertificates(1);
      expect(deposit2.principal).to.be.gt(principalAfterCompound);

      await time.increase((PLAN_TENOR_DAYS - 7) * 24 * 60 * 60);

      const balanceBefore = await token.balanceOf(user.address);
      await savingBank.connect(user).withdraw(1);
      const balanceAfter = await token.balanceOf(user.address);

      expect(balanceAfter - balanceBefore).to.be.gt(DEPOSIT_AMOUNT);
    });

    it("Should emit Withdrawn event", async function () {
      const { savingBank, user } = await loadFixture(deploySavingBankFixture);

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);

      await time.increase(PLAN_TENOR_DAYS * 24 * 60 * 60);

      const tx = await savingBank.connect(user).withdraw(1);
      await expect(tx).to.emit(savingBank, "Withdrawn");
    });

    it("Should burn NFT after withdrawal", async function () {
      const { savingBank, user, nft } = await loadFixture(
        deploySavingBankFixture,
      );

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);

      await time.increase(PLAN_TENOR_DAYS * 24 * 60 * 60);
      await savingBank.connect(user).withdraw(1);

      await expect(nft.ownerOf(1)).to.be.reverted;
    });
  });

  describe("Edge Cases", function () {
    it("Should prevent compound on withdrawn deposit", async function () {
      const { savingBank, user } = await loadFixture(deploySavingBankFixture);

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);

      await time.increase(PLAN_TENOR_DAYS * 24 * 60 * 60);
      await savingBank.connect(user).withdraw(1);

      await expect(
        savingBank.connect(user).compound(1),
      ).to.be.revertedWithCustomError(savingBank, "NotActiveDeposit");
    });

    it("Should handle disable then enable then compound", async function () {
      const { savingBank, user } = await loadFixture(deploySavingBankFixture);

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);

      await time.increase(7 * 24 * 60 * 60);
      await savingBank.connect(user).compound(1);

      const deposit1 = await savingBank.depositCertificates(1);
      const principal1 = deposit1.principal;

      await savingBank.connect(user).disableAutoCompound(1);

      const deposit2 = await savingBank.depositCertificates(1);
      expect(deposit2.principal).to.be.gt(principal1);

      await time.increase(7 * 24 * 60 * 60);
      await savingBank.connect(user).enableAutoCompound(1);

      await time.increase(7 * 24 * 60 * 60);
      await savingBank.connect(user).compound(1);

      const deposit3 = await savingBank.depositCertificates(1);
      expect(deposit3.principal).to.be.gt(deposit2.principal);
    });
  });
});
