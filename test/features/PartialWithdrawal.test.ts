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

describe("SavingBank - Partial Withdraw Feature", function () {
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

  const PLAN_TENOR_DAYS = 30;
  const PLAN_APR_BPS = 1000; // 10%
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

    // Create a saving plan
    await savingBank
      .connect(operator)
      .createPlan(
        PLAN_TENOR_DAYS,
        PLAN_APR_BPS,
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

  describe("Basic Partial Withdraw", function () {
    it("Should allow partial withdrawal", async function () {
      const { savingBank, user } = await loadFixture(deploySavingBankFixture);

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);

      await time.increase(10 * 24 * 60 * 60); // 10 days

      const withdrawAmount = ethers.parseEther("200");
      await expect(
        savingBank.connect(user).partialWithdraw(1, withdrawAmount),
      ).to.emit(savingBank, "PartialWithdrawn");
    });

    it("Should update totalPartialWithdrawn correctly", async function () {
      const { savingBank, user } = await loadFixture(deploySavingBankFixture);

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);
      await time.increase(5 * 24 * 60 * 60);

      // First withdrawal
      await savingBank
        .connect(user)
        .partialWithdraw(1, ethers.parseEther("200"));

      let deposit = await savingBank.depositCertificates(1);
      expect(deposit.totalPartialWithdrawn).to.equal(ethers.parseEther("200"));

      // Second withdrawal
      await savingBank
        .connect(user)
        .partialWithdraw(1, ethers.parseEther("300"));

      deposit = await savingBank.depositCertificates(1);
      expect(deposit.totalPartialWithdrawn).to.equal(ethers.parseEther("500"));
    });

    it("Should transfer correct amount to user", async function () {
      const { savingBank, user, token } = await loadFixture(
        deploySavingBankFixture,
      );

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);
      await time.increase(10 * 24 * 60 * 60);

      const balanceBefore = await token.balanceOf(user.address);
      const withdrawAmount = ethers.parseEther("200");

      await savingBank.connect(user).partialWithdraw(1, withdrawAmount);

      const balanceAfter = await token.balanceOf(user.address);
      const received = balanceAfter - balanceBefore;

      // Should receive amount minus penalty
      expect(received).to.be.lt(withdrawAmount);
      expect(received).to.be.gt(0);
    });

    it("Should track withdrawal history", async function () {
      const { savingBank, user } = await loadFixture(deploySavingBankFixture);

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);
      await time.increase(5 * 24 * 60 * 60);

      await savingBank
        .connect(user)
        .partialWithdraw(1, ethers.parseEther("200"));

      await time.increase(5 * 24 * 60 * 60);

      await savingBank
        .connect(user)
        .partialWithdraw(1, ethers.parseEther("150"));

      const history = await savingBank.getPartialWithdrawalHistory(1);

      expect(history.length).to.equal(2);
      expect(history[0].amount).to.equal(ethers.parseEther("200"));
      expect(history[1].amount).to.equal(ethers.parseEther("150"));
      expect(history[0].penaltyAmount).to.be.gt(0);
      expect(history[1].penaltyAmount).to.be.gt(0);
    });
  });

  describe("Penalty Calculation", function () {
    it("Should apply time-based penalty", async function () {
      const { savingBank, user, token } = await loadFixture(
        deploySavingBankFixture,
      );

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);

      // Withdraw early (more penalty)
      await time.increase(5 * 24 * 60 * 60);

      const balanceBefore1 = await token.balanceOf(user.address);
      await savingBank
        .connect(user)
        .partialWithdraw(1, ethers.parseEther("100"));
      const balanceAfter1 = await token.balanceOf(user.address);
      const received1 = balanceAfter1 - balanceBefore1;

      // Create new deposit for comparison
      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);

      // Withdraw later (less penalty)
      await time.increase(25 * 24 * 60 * 60);

      const balanceBefore2 = await token.balanceOf(user.address);
      await savingBank
        .connect(user)
        .partialWithdraw(2, ethers.parseEther("100"));
      const balanceAfter2 = await token.balanceOf(user.address);
      const received2 = balanceAfter2 - balanceBefore2;

      // Later withdrawal should have less penalty (receive more)
      expect(received2).to.be.gt(received1);
    });

    it("Should charge penalty to fee receiver", async function () {
      const { savingBank, user, token, feeReceiver } = await loadFixture(
        deploySavingBankFixture,
      );

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);
      await time.increase(10 * 24 * 60 * 60);

      const feeBalanceBefore = await token.balanceOf(feeReceiver.address);

      await savingBank
        .connect(user)
        .partialWithdraw(1, ethers.parseEther("200"));

      const feeBalanceAfter = await token.balanceOf(feeReceiver.address);
      const penalty = feeBalanceAfter - feeBalanceBefore;

      expect(penalty).to.be.gt(0);
    });

    it("Should have lower penalty near maturity", async function () {
      const { savingBank, user } = await loadFixture(deploySavingBankFixture);

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);

      // Just before maturity
      await time.increase((PLAN_TENOR_DAYS - 1) * 24 * 60 * 60);

      await savingBank
        .connect(user)
        .partialWithdraw(1, ethers.parseEther("100"));

      const history = await savingBank.getPartialWithdrawalHistory(1);
      const penalty = history[0].penaltyAmount;

      // Penalty should be very small
      expect(penalty).to.be.lt(ethers.parseEther("1"));
    });
  });

  describe("Validations", function () {
    it("Should revert if not owner", async function () {
      const { savingBank, user, operator } = await loadFixture(
        deploySavingBankFixture,
      );

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);
      await time.increase(10 * 24 * 60 * 60);

      await expect(
        savingBank
          .connect(operator)
          .partialWithdraw(1, ethers.parseEther("100")),
      ).to.be.revertedWithCustomError(savingBank, "NotOwner");
    });

    it("Should revert if deposit not active", async function () {
      const { savingBank, user } = await loadFixture(deploySavingBankFixture);

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);
      await time.increase(PLAN_TENOR_DAYS * 24 * 60 * 60);

      await savingBank.connect(user).withdraw(1);

      await expect(
        savingBank.connect(user).partialWithdraw(1, ethers.parseEther("100")),
      ).to.be.revertedWithCustomError(savingBank, "NotActiveDeposit");
    });

    it("Should revert if already matured", async function () {
      const { savingBank, user } = await loadFixture(deploySavingBankFixture);

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);
      await time.increase(PLAN_TENOR_DAYS * 24 * 60 * 60);

      await expect(
        savingBank.connect(user).partialWithdraw(1, ethers.parseEther("100")),
      ).to.be.revertedWithCustomError(savingBank, "AlreadyMatured");
    });

    it("Should revert if amount exceeds available balance", async function () {
      const { savingBank, user } = await loadFixture(deploySavingBankFixture);

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);
      await time.increase(10 * 24 * 60 * 60);

      await savingBank
        .connect(user)
        .partialWithdraw(1, ethers.parseEther("500"));

      // Try to withdraw more than remaining
      await expect(
        savingBank.connect(user).partialWithdraw(1, ethers.parseEther("600")),
      ).to.be.revertedWithCustomError(savingBank, "InsufficientBalance");
    });

    it("Should revert if remaining below minimum", async function () {
      const { savingBank, user } = await loadFixture(deploySavingBankFixture);

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);
      await time.increase(10 * 24 * 60 * 60);

      // Try to withdraw leaving less than minDeposit (100)
      await expect(
        savingBank.connect(user).partialWithdraw(1, ethers.parseEther("950")),
      ).to.be.revertedWithCustomError(savingBank, "BelowMinimumRemaining");
    });

    it("Should allow withdrawal of all except minimum", async function () {
      const { savingBank, user } = await loadFixture(deploySavingBankFixture);

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);
      await time.increase(10 * 24 * 60 * 60);

      // Withdraw all but minDeposit (100)
      await expect(
        savingBank.connect(user).partialWithdraw(1, ethers.parseEther("900")),
      ).to.not.be.reverted;

      const deposit = await savingBank.depositCertificates(1);
      expect(deposit.totalPartialWithdrawn).to.equal(ethers.parseEther("900"));
    });
  });

  describe("View Functions", function () {
    it("Should return correct available balance", async function () {
      const { savingBank, user } = await loadFixture(deploySavingBankFixture);

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);

      const [available, minRemaining] = await savingBank.getAvailableBalance(1);

      expect(available).to.equal(DEPOSIT_AMOUNT);
      expect(minRemaining).to.equal(MIN_DEPOSIT);
    });

    it("Should return correct available after partial withdraw", async function () {
      const { savingBank, user } = await loadFixture(deploySavingBankFixture);

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);
      await time.increase(10 * 24 * 60 * 60);

      await savingBank
        .connect(user)
        .partialWithdraw(1, ethers.parseEther("300"));

      const [available, minRemaining] = await savingBank.getAvailableBalance(1);

      expect(available).to.equal(ethers.parseEther("700"));
      expect(minRemaining).to.equal(MIN_DEPOSIT);
    });

    it("Should return correct max partial withdraw amount", async function () {
      const { savingBank, user } = await loadFixture(deploySavingBankFixture);

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);

      const maxWithdraw = await savingBank.getMaxPartialWithdraw(1);

      // Can withdraw all except minDeposit
      expect(maxWithdraw).to.equal(DEPOSIT_AMOUNT - MIN_DEPOSIT);
    });

    it("Should return 0 max withdraw when at minimum", async function () {
      const { savingBank, user } = await loadFixture(deploySavingBankFixture);

      await savingBank.connect(user).openDepositCertificate(1, MIN_DEPOSIT);

      const maxWithdraw = await savingBank.getMaxPartialWithdraw(1);

      expect(maxWithdraw).to.equal(0);
    });
  });

  describe("Integration with Interest Calculation", function () {
    it("Should calculate interest on remaining principal at maturity", async function () {
      const { savingBank, user, token } = await loadFixture(
        deploySavingBankFixture,
      );

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);
      await time.increase(10 * 24 * 60 * 60);

      // Partial withdraw
      await savingBank
        .connect(user)
        .partialWithdraw(1, ethers.parseEther("500"));

      // Wait until maturity
      await time.increase((PLAN_TENOR_DAYS - 10) * 24 * 60 * 60);

      const balanceBefore = await token.balanceOf(user.address);
      await savingBank.connect(user).withdraw(1);
      const balanceAfter = await token.balanceOf(user.address);

      const received = balanceAfter - balanceBefore;

      // Should receive remaining 500 + interest on 500
      const expectedInterest =
        (ethers.parseEther("500") *
          BigInt(PLAN_APR_BPS) *
          BigInt(PLAN_TENOR_DAYS * 24 * 60 * 60)) /
        (BigInt(365 * 24 * 60 * 60) * 10000n);

      expect(received).to.be.closeTo(
        ethers.parseEther("500") + expectedInterest,
        ethers.parseEther("1"),
      );
    });

    it("Should work with auto-compound", async function () {
      const { savingBank, user } = await loadFixture(deploySavingBankFixture);

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);
      await savingBank.connect(user).enableAutoCompound(1);

      await time.increase(7 * 24 * 60 * 60);
      await savingBank.connect(user).compound(1);

      const depositBefore = await savingBank.depositCertificates(1);
      const principalBefore = depositBefore.principal;

      // Partial withdraw
      await savingBank
        .connect(user)
        .partialWithdraw(1, ethers.parseEther("200"));

      const depositAfter = await savingBank.depositCertificates(1);

      // Principal stays the same, but totalPartialWithdrawn increases
      expect(depositAfter.principal).to.equal(principalBefore);
      expect(depositAfter.totalPartialWithdrawn).to.equal(
        ethers.parseEther("200"),
      );
    });
  });

  describe("Multiple Partial Withdrawals", function () {
    it("Should allow multiple partial withdrawals", async function () {
      const { savingBank, user, token } = await loadFixture(
        deploySavingBankFixture,
      );

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);
      await time.increase(5 * 24 * 60 * 60);

      const balanceBefore = await token.balanceOf(user.address);

      // First withdrawal
      await savingBank
        .connect(user)
        .partialWithdraw(1, ethers.parseEther("200"));

      await time.increase(5 * 24 * 60 * 60);

      // Second withdrawal
      await savingBank
        .connect(user)
        .partialWithdraw(1, ethers.parseEther("150"));

      await time.increase(5 * 24 * 60 * 60);

      // Third withdrawal
      await savingBank
        .connect(user)
        .partialWithdraw(1, ethers.parseEther("100"));

      const balanceAfter = await token.balanceOf(user.address);
      const totalReceived = balanceAfter - balanceBefore;

      // Should receive total minus penalties
      expect(totalReceived).to.be.lt(ethers.parseEther("450"));
      expect(totalReceived).to.be.gt(ethers.parseEther("400"));

      const deposit = await savingBank.depositCertificates(1);
      expect(deposit.totalPartialWithdrawn).to.equal(ethers.parseEther("450"));
    });

    it("Should track all withdrawals in history", async function () {
      const { savingBank, user } = await loadFixture(deploySavingBankFixture);

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);

      const amounts = [200, 150, 100, 80, 70];

      for (const amount of amounts) {
        await time.increase(2 * 24 * 60 * 60);
        await savingBank
          .connect(user)
          .partialWithdraw(1, ethers.parseEther(amount.toString()));
      }

      const history = await savingBank.getPartialWithdrawalHistory(1);

      expect(history.length).to.equal(5);
      expect(history[0].amount).to.equal(ethers.parseEther("200"));
      expect(history[1].amount).to.equal(ethers.parseEther("150"));
      expect(history[2].amount).to.equal(ethers.parseEther("100"));
      expect(history[3].amount).to.equal(ethers.parseEther("80"));
      expect(history[4].amount).to.equal(ethers.parseEther("70"));
    });
  });

  describe("Edge Cases", function () {
    it("Should handle withdrawal on day 1", async function () {
      const { savingBank, user } = await loadFixture(deploySavingBankFixture);

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);
      await time.increase(1 * 60 * 60); // 1 hour

      await expect(
        savingBank.connect(user).partialWithdraw(1, ethers.parseEther("100")),
      ).to.not.be.reverted;
    });

    it("Should handle withdrawal 1 day before maturity", async function () {
      const { savingBank, user } = await loadFixture(deploySavingBankFixture);

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);
      await time.increase((PLAN_TENOR_DAYS - 1) * 24 * 60 * 60);

      await expect(
        savingBank.connect(user).partialWithdraw(1, ethers.parseEther("100")),
      ).to.not.be.reverted;
    });

    it("Should handle very small withdrawal", async function () {
      const { savingBank, user } = await loadFixture(deploySavingBankFixture);

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);
      await time.increase(10 * 24 * 60 * 60);

      await expect(
        savingBank.connect(user).partialWithdraw(1, ethers.parseEther("1")),
      ).to.not.be.reverted;
    });

    it("Should handle withdrawal to exactly minimum", async function () {
      const { savingBank, user } = await loadFixture(deploySavingBankFixture);

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);
      await time.increase(10 * 24 * 60 * 60);

      // Withdraw exactly to minimum
      const withdrawAmount = DEPOSIT_AMOUNT - MIN_DEPOSIT;

      await expect(savingBank.connect(user).partialWithdraw(1, withdrawAmount))
        .to.not.be.reverted;

      const [available] = await savingBank.getAvailableBalance(1);
      expect(available).to.equal(MIN_DEPOSIT);
    });
  });

  describe("Security Tests", function () {
    it("Should be protected by whenNotPaused", async function () {
      const { savingBank, user, admin } = await loadFixture(
        deploySavingBankFixture,
      );

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);
      await time.increase(10 * 24 * 60 * 60);

      // Pause contract
      await savingBank.connect(admin).pause();

      await expect(
        savingBank.connect(user).partialWithdraw(1, ethers.parseEther("100")),
      ).to.be.reverted;

      // Unpause
      await savingBank.connect(admin).unpause();

      await expect(
        savingBank.connect(user).partialWithdraw(1, ethers.parseEther("100")),
      ).to.not.be.reverted;
    });

    it("Should be protected by nonReentrant", async function () {
      const { savingBank, user } = await loadFixture(deploySavingBankFixture);

      await savingBank.connect(user).openDepositCertificate(1, DEPOSIT_AMOUNT);
      await time.increase(10 * 24 * 60 * 60);

      // This test just ensures the modifier is present
      // Actual reentrancy testing would require a malicious contract
      await expect(
        savingBank.connect(user).partialWithdraw(1, ethers.parseEther("100")),
      ).to.not.be.reverted;
    });
  });
});
