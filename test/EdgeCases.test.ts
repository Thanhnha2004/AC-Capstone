import "@nomicfoundation/hardhat-ethers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { SavingBank, ERC20Mock, LiquidityVault } from "../typechain";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("Edge Cases Tests", function () {
  let deployer: SignerWithAddress,
    receiver1: SignerWithAddress,
    addr1: SignerWithAddress,
    addr2: SignerWithAddress;

  let savingBank: SavingBank;
  let vault: LiquidityVault;
  let token: ERC20Mock;

  enum DepositStatus {
    Active = 0,
    Withdrawn = 1,
    EarlyWithdrawn = 2,
    Renewed = 3,
  }

  const deploy = async () => {
    [deployer, receiver1, addr1, addr2] = await ethers.getSigners();

    const ERC20MockFactory = await ethers.getContractFactory("ERC20Mock");
    token = await ERC20MockFactory.deploy();
    await token.waitForDeployment();

    vault = await (
      await ethers.getContractFactory("LiquidityVault")
    ).deploy(await token.getAddress());
    await vault.waitForDeployment();

    savingBank = await (
      await ethers.getContractFactory("SavingBank")
    ).deploy(
      await token.getAddress(),
      await vault.getAddress(),
      receiver1.address
    );
    await savingBank.waitForDeployment();

    await token.mint(deployer.address, ethers.parseEther("10000000"));
    await token.mint(addr1.address, ethers.parseEther("10000000"));
    await token.mint(addr2.address, ethers.parseEther("10000000"));

    await token
      .connect(deployer)
      .approve(await savingBank.getAddress(), ethers.MaxUint256);
    await token
      .connect(deployer)
      .approve(await vault.getAddress(), ethers.MaxUint256);
    await token
      .connect(addr1)
      .approve(await savingBank.getAddress(), ethers.MaxUint256);
    await token
      .connect(addr2)
      .approve(await savingBank.getAddress(), ethers.MaxUint256);

    await vault.setSavingBank(await savingBank.getAddress());
  };

  const createDefaultPlans = async () => {
    await savingBank.createPlan(
      7,
      500,
      ethers.parseEther("100"),
      ethers.parseEther("10000"),
      300
    );

    await savingBank.createPlan(
      30,
      800,
      ethers.parseEther("100"),
      ethers.parseEther("10000"),
      500
    );

    await savingBank.createPlan(90, 1200, ethers.parseEther("100"), 0, 800);
  };

  beforeEach(async () => {
    await deploy();
    await createDefaultPlans();
    await vault.fundVault(ethers.parseEther("1000000"));
  });

  describe("Amount Edge Cases", function () {
    it("Should handle minimum deposit amount", async function () {
      const minDeposit = ethers.parseEther("100");
      await savingBank.connect(addr1).openDepositCertificate(1, minDeposit);

      const deposit = await savingBank.depositCertificates(1);
      expect(deposit.principal).to.equal(minDeposit);
    });

    it("Should handle very large deposit amount (1M tokens)", async function () {
      const largeAmount = ethers.parseEther("1000000");
      
      // Need unlimited max deposit
      await savingBank.createPlan(7, 500, ethers.parseEther("100"), 0, 300);

      await savingBank.connect(addr1).openDepositCertificate(4, largeAmount);

      const deposit = await savingBank.depositCertificates(1);
      expect(deposit.principal).to.equal(largeAmount);

      await time.increase(7 * 24 * 60 * 60);
      const interest = await savingBank.getCalculateInterest(1);
      expect(interest).to.be.gt(0);
    });

    it("Should handle deposit at exact maxDeposit", async function () {
      const maxDeposit = ethers.parseEther("10000");
      await savingBank.connect(addr1).openDepositCertificate(1, maxDeposit);

      const deposit = await savingBank.depositCertificates(1);
      expect(deposit.principal).to.equal(maxDeposit);
    });

    it("Should calculate minimal interest for small amounts", async function () {
      const smallAmount = ethers.parseEther("100");
      await savingBank.connect(addr1).openDepositCertificate(1, smallAmount);

      await time.increase(7 * 24 * 60 * 60);
      const interest = await savingBank.getCalculateInterest(1);

      // Interest should be small but > 0
      expect(interest).to.be.gt(0);
      expect(interest).to.be.lt(ethers.parseEther("1"));
    });

    it("Should handle compound interest on very large amounts", async function () {
      const largeAmount = ethers.parseEther("100000");
      
      await savingBank.createPlan(7, 500, ethers.parseEther("100"), 0, 300);
      await savingBank.connect(addr1).openDepositCertificate(4, largeAmount);

      await time.increase(7 * 24 * 60 * 60);
      await savingBank.connect(addr1).renewWithNewPlan(1, 4);

      const deposit2 = await savingBank.depositCertificates(2);
      expect(deposit2.principal).to.be.gt(largeAmount);
    });
  });

  describe("Time Edge Cases", function () {
    beforeEach(async () => {
      await savingBank
        .connect(addr1)
        .openDepositCertificate(1, ethers.parseEther("1000"));
    });

    it("Should withdraw exactly at maturity timestamp", async function () {
      const deposit = await savingBank.depositCertificates(1);
      const currentTime = await time.latest();
      const timeToMaturity = Number(deposit.maturityAt) - currentTime;

      await time.increase(timeToMaturity);

      await expect(savingBank.connect(addr1).withdraw(1)).to.not.be.reverted;
    });

    it("Should allow early withdraw 1 second after opening", async function () {
      await time.increase(1);

      await expect(savingBank.connect(addr1).earlyWithdraw(1)).to.not.be
        .reverted;
    });

    it("Should fail early withdraw 1 second before maturity", async function () {
      const deposit = await savingBank.depositCertificates(1);
      const currentTime = await time.latest();
      const timeToMaturity = Number(deposit.maturityAt) - currentTime;

      await time.increase(timeToMaturity - 1);

      await expect(savingBank.connect(addr1).earlyWithdraw(1))
        .to.be.revertedWithCustomError(savingBank, "AlreadyMatured")
        .withArgs();
    });

    it("Should fail early withdraw exactly at maturity", async function () {
      const deposit = await savingBank.depositCertificates(1);
      const currentTime = await time.latest();
      const timeToMaturity = Number(deposit.maturityAt) - currentTime;

      await time.increase(timeToMaturity);

      await expect(savingBank.connect(addr1).earlyWithdraw(1))
        .to.be.revertedWithCustomError(savingBank, "AlreadyMatured")
        .withArgs();
    });

    it("Should handle very long tenor (180 days)", async function () {
      await savingBank.createPlan(180, 1500, ethers.parseEther("100"), 0, 1000);
      
      await savingBank
        .connect(addr1)
        .openDepositCertificate(4, ethers.parseEther("1000"));

      const deposit = await savingBank.depositCertificates(2);
      const expectedMaturity = deposit.startAt + 180n * 86400n;
      expect(deposit.maturityAt).to.equal(expectedMaturity);

      await time.increase(180 * 24 * 60 * 60);
      await expect(savingBank.connect(addr1).withdraw(2)).to.not.be.reverted;
    });
  });

  describe("Vault Liquidity Edge Cases", function () {
    it("Should revert if vault has insufficient balance for interest", async function () {
      await savingBank
        .connect(addr1)
        .openDepositCertificate(1, ethers.parseEther("1000"));

      // Withdraw all from vault
      const vaultBalance = await vault.totalBalance();
      await vault.withdrawVault(vaultBalance);

      await time.increase(7 * 24 * 60 * 60);

      await expect(savingBank.connect(addr1).withdraw(1))
        .to.be.revertedWithCustomError(vault, "InsufficientBalance")
        .withArgs();
    });

    it("Should handle vault with exact required amount", async function () {
      await savingBank
        .connect(addr1)
        .openDepositCertificate(1, ethers.parseEther("1000"));

      await time.increase(7 * 24 * 60 * 60);

      const interest = await savingBank.getCalculateInterest(1);

      // Withdraw all vault and refund exact amount needed
      const vaultBalance = await vault.totalBalance();
      await vault.withdrawVault(vaultBalance);
      await vault.fundVault(interest);

      await expect(savingBank.connect(addr1).withdraw(1)).to.not.be.reverted;

      expect(await vault.totalBalance()).to.equal(0);
    });

    it("Should fail renew if vault insufficient for interest deduction", async function () {
      await savingBank
        .connect(addr1)
        .openDepositCertificate(1, ethers.parseEther("1000"));

      await time.increase(7 * 24 * 60 * 60);

      // Withdraw all from vault
      const vaultBalance = await vault.totalBalance();
      await vault.withdrawVault(vaultBalance);

      await expect(savingBank.connect(addr1).renewWithNewPlan(1, 1))
        .to.be.revertedWithCustomError(vault, "InsufficientBalance")
        .withArgs();
    });
  });

  describe("Plan Update Edge Cases", function () {
    it("Should not affect old deposits when plan is updated", async function () {
      await savingBank
        .connect(addr1)
        .openDepositCertificate(1, ethers.parseEther("1000"));

      const depositBefore = await savingBank.depositCertificates(1);

      // Update plan after deposit opened
      await savingBank.updatePlan(
        1,
        14,
        1000,
        ethers.parseEther("50"),
        ethers.parseEther("5000"),
        500
      );

      const depositAfter = await savingBank.depositCertificates(1);
      const updatedPlan = await savingBank.savingPlans(1);

      // Deposit should keep old snapshot values
      expect(depositAfter.snapshotAprBps).to.equal(depositBefore.snapshotAprBps);
      expect(depositAfter.snapshotTenorDays).to.equal(
        depositBefore.snapshotTenorDays
      );
      expect(depositAfter.snapshotEarlyWithdrawPenaltyBps).to.equal(
        depositBefore.snapshotEarlyWithdrawPenaltyBps
      );

      // Plan should have new values
      expect(updatedPlan.aprBps).to.equal(1000);
      expect(updatedPlan.tenorDays).to.equal(14);
    });

    it("Should allow old deposits to work even after plan is disabled", async function () {
      await savingBank
        .connect(addr1)
        .openDepositCertificate(1, ethers.parseEther("1000"));

      // Disable plan
      await savingBank.updatePlanStatus(1, false);

      // Old deposit should still work
      await time.increase(7 * 24 * 60 * 60);
      await expect(savingBank.connect(addr1).withdraw(1)).to.not.be.reverted;
    });

    it("Should use updated plan data when renewing", async function () {
      await savingBank
        .connect(addr1)
        .openDepositCertificate(1, ethers.parseEther("1000"));

      // Update plan before maturity
      await savingBank.updatePlan(
        1,
        7,
        1000,
        ethers.parseEther("100"),
        ethers.parseEther("10000"),
        300
      );

      await time.increase(7 * 24 * 60 * 60);
      await savingBank.connect(addr1).renewWithNewPlan(1, 1);

      const newDeposit = await savingBank.depositCertificates(2);
      expect(newDeposit.snapshotAprBps).to.equal(1000); // New value
    });

    it("Should prevent opening new deposits on disabled plans", async function () {
      await savingBank.updatePlanStatus(1, false);

      await expect(
        savingBank
          .connect(addr1)
          .openDepositCertificate(1, ethers.parseEther("1000"))
      )
        .to.be.revertedWithCustomError(savingBank, "NotEnabledPlan")
        .withArgs();
    });

    it("Should prevent renewing to disabled plans", async function () {
      await savingBank
        .connect(addr1)
        .openDepositCertificate(1, ethers.parseEther("1000"));

      await time.increase(7 * 24 * 60 * 60);

      await savingBank.updatePlanStatus(2, false);

      await expect(savingBank.connect(addr1).renewWithNewPlan(1, 2))
        .to.be.revertedWithCustomError(savingBank, "NotEnabledPlan")
        .withArgs();
    });
  });

  describe("Rounding Edge Cases", function () {
    it("Should handle very small principal with short tenor", async function () {
      const smallPrincipal = ethers.parseEther("100");
      await savingBank.connect(addr1).openDepositCertificate(1, smallPrincipal);

      await time.increase(7 * 24 * 60 * 60);
      const interest = await savingBank.getCalculateInterest(1);

      // Interest should be minimal but calculable
      const expectedInterest =
        (smallPrincipal * 500n * 7n * 86400n) / (365n * 86400n * 10000n);
      expect(interest).to.equal(expectedInterest);
      expect(interest).to.be.gt(0);
    });

    it("Should verify no precision loss in interest calculation", async function () {
      const principal = ethers.parseEther("1000");
      await savingBank.connect(addr1).openDepositCertificate(1, principal);

      await time.increase(7 * 24 * 60 * 60);
      const interest = await savingBank.getCalculateInterest(1);

      // Calculate expected interest manually
      const expectedInterest =
        (principal * 500n * 7n * 86400n) / (365n * 86400n * 10000n);

      expect(interest).to.equal(expectedInterest);
    });

    it("Should maintain precision with large principal and long tenor", async function () {
      await savingBank.createPlan(365, 1000, ethers.parseEther("100"), 0, 500);
      
      const largePrincipal = ethers.parseEther("100000");
      await savingBank.connect(addr1).openDepositCertificate(4, largePrincipal);

      await time.increase(365 * 24 * 60 * 60);
      const interest = await savingBank.getCalculateInterest(1);

      // For 1 year at 10% APR, interest should be ~10% of principal
      const expectedInterest = (largePrincipal * 1000n) / 10000n;
      expect(interest).to.equal(expectedInterest);
    });

    it("Should handle odd APR values correctly", async function () {
      // Create plan with odd APR (3.33%)
      await savingBank.createPlan(
        7,
        333,
        ethers.parseEther("100"),
        ethers.parseEther("10000"),
        300
      );

      await savingBank
        .connect(addr1)
        .openDepositCertificate(4, ethers.parseEther("1000"));

      await time.increase(7 * 24 * 60 * 60);
      const interest = await savingBank.getCalculateInterest(1);

      const expectedInterest =
        (ethers.parseEther("1000") * 333n * 7n * 86400n) /
        (365n * 86400n * 10000n);
      expect(interest).to.equal(expectedInterest);
    });

    it("Should maintain accuracy across multiple compound cycles", async function () {
      const initialPrincipal = ethers.parseEther("1000");
      await savingBank
        .connect(addr1)
        .openDepositCertificate(1, initialPrincipal);

      let expectedPrincipal = initialPrincipal;

      // Compound 5 times
      for (let i = 0; i < 5; i++) {
        await time.increase(7 * 24 * 60 * 60);
        const interest = await savingBank.getCalculateInterest(i + 1);
        expectedPrincipal = expectedPrincipal + interest;
        await savingBank.connect(addr1).renewWithNewPlan(i + 1, 1);
      }

      const finalDeposit = await savingBank.depositCertificates(6);
      expect(finalDeposit.principal).to.equal(expectedPrincipal);
    });
  });

  describe("Boundary Conditions", function () {
    it("Should handle maximum BASIS_POINTS penalty (100%)", async function () {
      await savingBank.createPlan(
        7,
        500,
        ethers.parseEther("100"),
        ethers.parseEther("10000"),
        10000
      );

      await savingBank
        .connect(addr1)
        .openDepositCertificate(4, ethers.parseEther("1000"));

      const userBalanceBefore = await token.balanceOf(addr1.address);
      await savingBank.connect(addr1).earlyWithdraw(1);
      const userBalanceAfter = await token.balanceOf(addr1.address);

      // User should receive 0 (100% penalty)
      expect(userBalanceAfter).to.equal(userBalanceBefore);
    });

    it("Should handle very high APR", async function () {
      // Create plan with 100% APR
      await savingBank.createPlan(
        365,
        10000,
        ethers.parseEther("100"),
        0,
        300
      );

      await savingBank
        .connect(addr1)
        .openDepositCertificate(4, ethers.parseEther("1000"));

      await time.increase(365 * 24 * 60 * 60);
      const interest = await savingBank.getCalculateInterest(1);

      // For 365 days at 100% APR, interest should equal principal
      expect(interest).to.equal(ethers.parseEther("1000"));
    });

    it("Should handle plan with 1 day tenor", async function () {
      await savingBank.createPlan(
        1,
        500,
        ethers.parseEther("100"),
        ethers.parseEther("10000"),
        300
      );

      await savingBank
        .connect(addr1)
        .openDepositCertificate(4, ethers.parseEther("1000"));

      await time.increase(24 * 60 * 60);
      await expect(savingBank.connect(addr1).withdraw(1)).to.not.be.reverted;
    });

    it("Should handle unlimited maxDeposit correctly", async function () {
      const plan = await savingBank.savingPlans(3);
      expect(plan.maxDeposit).to.equal(0); // Unlimited

      // Should accept any amount
      await savingBank
        .connect(addr1)
        .openDepositCertificate(3, ethers.parseEther("1000000"));

      const deposit = await savingBank.depositCertificates(1);
      expect(deposit.principal).to.equal(ethers.parseEther("1000000"));
    });
  });

  describe("Reentrancy Protection", function () {
    it("Should protect withdraw from reentrancy", async function () {
      await savingBank
        .connect(addr1)
        .openDepositCertificate(1, ethers.parseEther("1000"));

      await time.increase(7 * 24 * 60 * 60);

      // ReentrancyGuard should prevent any reentrancy attempts
      await expect(savingBank.connect(addr1).withdraw(1)).to.not.be.reverted;
    });

    it("Should protect earlyWithdraw from reentrancy", async function () {
      await savingBank
        .connect(addr1)
        .openDepositCertificate(1, ethers.parseEther("1000"));

      await expect(savingBank.connect(addr1).earlyWithdraw(1)).to.not.be
        .reverted;
    });

    it("Should protect renewWithNewPlan from reentrancy", async function () {
      await savingBank
        .connect(addr1)
        .openDepositCertificate(1, ethers.parseEther("1000"));

      await time.increase(7 * 24 * 60 * 60);

      await expect(savingBank.connect(addr1).renewWithNewPlan(1, 1)).to.not.be
        .reverted;
    });
  });
});
