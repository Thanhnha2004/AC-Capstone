import "@nomicfoundation/hardhat-ethers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { SavingBank, ERC20Mock, LiquidityVault } from "../typechain";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";

describe("Integration Tests", function () {
  enum DepositStatus {
    Active = 0,
    Withdrawn = 1,
    EarlyWithdrawn = 2,
    Renewed = 3,
  }

  async function deployFixture() {
    const [deployer, receiver1, addr1, addr2, addr3] = await ethers.getSigners();

    const ERC20MockFactory = await ethers.getContractFactory("ERC20Mock");
    const token = await ERC20MockFactory.deploy();
    await token.waitForDeployment();

    const vault = await (
      await ethers.getContractFactory("LiquidityVault")
    ).deploy(await token.getAddress());
    await vault.waitForDeployment();

    const savingBank = await (
      await ethers.getContractFactory("SavingBank")
    ).deploy(
      await token.getAddress(),
      await vault.getAddress(),
      receiver1.address
    );
    await savingBank.waitForDeployment();

    // Mint tokens
    await token.mint(deployer.address, ethers.parseEther("1000000"));
    await token.mint(addr1.address, ethers.parseEther("100000"));
    await token.mint(addr2.address, ethers.parseEther("100000"));
    await token.mint(addr3.address, ethers.parseEther("100000"));

    // Approve tokens
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
    await token
      .connect(addr3)
      .approve(await savingBank.getAddress(), ethers.MaxUint256);

    await vault.setSavingBank(await savingBank.getAddress());

    // Create default plans
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

    // Fund vault
    await vault.fundVault(ethers.parseEther("100000"));

    return { deployer, receiver1, addr1, addr2, addr3, token, vault, savingBank };
  }

  describe("Flow 1: Open → Withdraw", function () {
    it("Should complete full cycle successfully", async function () {
      const { addr1, token, vault, savingBank } = await loadFixture(deployFixture);
      
      const depositAmount = ethers.parseEther("1000");
      const userBalanceStart = await token.balanceOf(addr1.address);
      const vaultBalanceStart = await vault.totalBalance();
      const contractBalanceStart = await token.balanceOf(
        await savingBank.getAddress()
      );

      // User opens deposit
      await savingBank
        .connect(addr1)
        .openDepositCertificate(1, depositAmount);

      const userBalanceAfterOpen = await token.balanceOf(addr1.address);
      const contractBalanceAfterOpen = await token.balanceOf(
        await savingBank.getAddress()
      );
      const nftBalanceAfterOpen = await savingBank.balanceOf(addr1.address);

      expect(userBalanceStart - userBalanceAfterOpen).to.equal(depositAmount);
      expect(contractBalanceAfterOpen - contractBalanceStart).to.equal(
        depositAmount
      );
      expect(nftBalanceAfterOpen).to.equal(1);
      expect(await savingBank.ownerOf(1)).to.equal(addr1.address);

      // Time travel to maturity
      await time.increase(7 * 24 * 60 * 60);

      const interest = await savingBank.getCalculateInterest(1);

      // User withdraws
      await savingBank.connect(addr1).withdraw(1);

      const userBalanceEnd = await token.balanceOf(addr1.address);
      const vaultBalanceEnd = await vault.totalBalance();
      const contractBalanceEnd = await token.balanceOf(
        await savingBank.getAddress()
      );
      const nftBalanceEnd = await savingBank.balanceOf(addr1.address);

      // Verify token flow
      expect(userBalanceEnd - userBalanceAfterOpen).to.equal(
        depositAmount + interest
      );
      expect(vaultBalanceStart - vaultBalanceEnd).to.equal(interest);
      expect(contractBalanceAfterOpen - contractBalanceEnd).to.equal(
        depositAmount
      );

      // Verify NFT lifecycle
      expect(nftBalanceEnd).to.equal(0);
      await expect(savingBank.ownerOf(1)).to.be.revertedWithCustomError(
        savingBank,
        "ERC721NonexistentToken"
      );

      // Verify deposit status
      const deposit = await savingBank.depositCertificates(1);
      expect(deposit.status).to.equal(DepositStatus.Withdrawn);
    });
  });

  describe("Flow 2: Open → Early Withdraw", function () {
    it("Should complete early withdraw with penalty", async function () {
      const { addr1, receiver1, token, savingBank } = await loadFixture(deployFixture);
      
      const depositAmount = ethers.parseEther("1000");
      const penalty = (depositAmount * 300n) / 10000n; // 3%

      const userBalanceStart = await token.balanceOf(addr1.address);
      const feeReceiverBalanceStart = await token.balanceOf(receiver1.address);
      const contractBalanceStart = await token.balanceOf(
        await savingBank.getAddress()
      );

      // User opens deposit
      await savingBank
        .connect(addr1)
        .openDepositCertificate(1, depositAmount);

      const nftBalanceAfterOpen = await savingBank.balanceOf(addr1.address);
      expect(nftBalanceAfterOpen).to.equal(1);

      // User early withdraws (immediately)
      await savingBank.connect(addr1).earlyWithdraw(1);

      const userBalanceEnd = await token.balanceOf(addr1.address);
      const feeReceiverBalanceEnd = await token.balanceOf(receiver1.address);
      const contractBalanceEnd = await token.balanceOf(
        await savingBank.getAddress()
      );
      const nftBalanceEnd = await savingBank.balanceOf(addr1.address);

      // Verify penalty distribution
      expect(userBalanceEnd - userBalanceStart).to.equal(
        depositAmount - penalty - depositAmount // Net: -penalty
      );
      expect(feeReceiverBalanceEnd - feeReceiverBalanceStart).to.equal(penalty);
      expect(contractBalanceStart - contractBalanceEnd).to.equal(0); // All returned

      // Verify NFT burned
      expect(nftBalanceEnd).to.equal(0);

      // Verify deposit status
      const deposit = await savingBank.depositCertificates(1);
      expect(deposit.status).to.equal(DepositStatus.EarlyWithdrawn);
    });
  });

  describe("Flow 3: Open → Renew → Withdraw", function () {
    it("Should compound interest correctly", async function () {
      const { addr1, token, vault, savingBank } = await loadFixture(deployFixture);
      
      const initialDeposit = ethers.parseEther("1000");
      const userBalanceStart = await token.balanceOf(addr1.address);
      const vaultBalanceStart = await vault.totalBalance();

      // User opens deposit
      await savingBank
        .connect(addr1)
        .openDepositCertificate(1, initialDeposit);
      expect(await savingBank.balanceOf(addr1.address)).to.equal(1);

      // Time travel to maturity
      await time.increase(7 * 24 * 60 * 60);

      const interest1 = await savingBank.getCalculateInterest(1);
      const principal2 = initialDeposit + interest1;

      // User renews
      const vaultBalanceBeforeRenew = await vault.totalBalance();
      await savingBank.connect(addr1).renewWithNewPlan(1, 1);
      const vaultBalanceAfterRenew = await vault.totalBalance();

      // Verify vault deducted interest
      expect(vaultBalanceBeforeRenew - vaultBalanceAfterRenew).to.equal(
        interest1
      );

      // Verify old NFT burned, new NFT minted
      expect(await savingBank.balanceOf(addr1.address)).to.equal(1);
      expect(await savingBank.ownerOf(2)).to.equal(addr1.address);

      const deposit2 = await savingBank.depositCertificates(2);
      expect(deposit2.principal).to.equal(principal2);

      // Time travel to new maturity
      await time.increase(7 * 24 * 60 * 60);

      const interest2 = await savingBank.getCalculateInterest(2);
      const expectedInterest2 = (principal2 * 500n * 7n * 86400n) / (365n * 86400n * 10000n);
      expect(interest2).to.equal(expectedInterest2);

      // User withdraws
      await savingBank.connect(addr1).withdraw(2);

      const userBalanceEnd = await token.balanceOf(addr1.address);
      const vaultBalanceEnd = await vault.totalBalance();

      // Verify compound interest
      const totalReceived = userBalanceEnd - userBalanceStart;
      expect(totalReceived).to.equal(principal2 + interest2 - initialDeposit);

      // Verify vault balance
      expect(vaultBalanceStart - vaultBalanceEnd).to.equal(
        interest1 + interest2
      );

      // Verify NFT burned
      expect(await savingBank.balanceOf(addr1.address)).to.equal(0);
    });
  });

  describe("Flow 4: Open → Renew New Plan → Withdraw", function () {
    it("Should apply different interest rates correctly", async function () {
      const { addr1, token, savingBank } = await loadFixture(deployFixture);
      
      const initialDeposit = ethers.parseEther("1000");

      // User opens with plan 1 (7 days, 5% APR)
      await savingBank
        .connect(addr1)
        .openDepositCertificate(1, initialDeposit);

      await time.increase(7 * 24 * 60 * 60);
      const interest1 = await savingBank.getCalculateInterest(1);
      const expectedInterest1 = (initialDeposit * 500n * 7n * 86400n) / (365n * 86400n * 10000n);
      expect(interest1).to.equal(expectedInterest1);

      // Renew to plan 2 (30 days, 8% APR)
      await savingBank.connect(addr1).renewWithNewPlan(1, 2);

      const deposit2 = await savingBank.depositCertificates(2);
      const principal2 = initialDeposit + interest1;
      expect(deposit2.principal).to.equal(principal2);
      expect(deposit2.snapshotAprBps).to.equal(800);
      expect(deposit2.snapshotTenorDays).to.equal(30);

      await time.increase(30 * 24 * 60 * 60);
      const interest2 = await savingBank.getCalculateInterest(2);
      const expectedInterest2 = (principal2 * 800n * 30n * 86400n) / (365n * 86400n * 10000n);
      expect(interest2).to.equal(expectedInterest2);

      // Withdraw
      const userBalanceBefore = await token.balanceOf(addr1.address);
      await savingBank.connect(addr1).withdraw(2);
      const userBalanceAfter = await token.balanceOf(addr1.address);

      // Verify total received with different interest rates
      expect(userBalanceAfter - userBalanceBefore).to.equal(
        principal2 + interest2
      );
    });
  });

  describe("Flow 5: Multiple Users Scenario", function () {
    it("Should handle complex multi-user interactions", async function () {
      const { addr1, addr2, addr3, token, vault, savingBank } = await loadFixture(deployFixture);
      
      const vaultBalanceStart = await vault.totalBalance();

      // User 1 opens 1000 tokens on plan 1
      await savingBank
        .connect(addr1)
        .openDepositCertificate(1, ethers.parseEther("1000"));

      // User 2 opens 2000 tokens on plan 2
      await savingBank
        .connect(addr2)
        .openDepositCertificate(2, ethers.parseEther("2000"));

      // User 3 opens 3000 tokens on plan 3
      await savingBank
        .connect(addr3)
        .openDepositCertificate(3, ethers.parseEther("3000"));

      // Verify NFT ownership
      expect(await savingBank.ownerOf(1)).to.equal(addr1.address);
      expect(await savingBank.ownerOf(2)).to.equal(addr2.address);
      expect(await savingBank.ownerOf(3)).to.equal(addr3.address);

      // User 1 withdraws early (day 3)
      await time.increase(3 * 24 * 60 * 60);
      const user1BalanceBefore = await token.balanceOf(addr1.address);
      await savingBank.connect(addr1).earlyWithdraw(1);
      const user1BalanceAfter = await token.balanceOf(addr1.address);
      const penalty1 = (ethers.parseEther("1000") * 300n) / 10000n;
      expect(user1BalanceAfter - user1BalanceBefore).to.equal(
        ethers.parseEther("1000") - penalty1
      );

      // User 2 waits to maturity (day 30)
      await time.increase(27 * 24 * 60 * 60); // +27 days (total 30)
      const interest2 = await savingBank.getCalculateInterest(2);
      const user2BalanceBefore = await token.balanceOf(addr2.address);
      await savingBank.connect(addr2).withdraw(2);
      const user2BalanceAfter = await token.balanceOf(addr2.address);
      expect(user2BalanceAfter - user2BalanceBefore).to.equal(
        ethers.parseEther("2000") + interest2
      );

      // User 3 renews at maturity (day 90)
      await time.increase(60 * 24 * 60 * 60); // +60 days (total 90)
      const interest3_1 = await savingBank.getCalculateInterest(3);
      await savingBank.connect(addr3).renewWithNewPlan(3, 1);

      const deposit4 = await savingBank.depositCertificates(4);
      expect(deposit4.principal).to.equal(
        ethers.parseEther("3000") + interest3_1
      );

      await time.increase(7 * 24 * 60 * 60);
      const interest3_2 = await savingBank.getCalculateInterest(4);
      const user3BalanceBefore = await token.balanceOf(addr3.address);
      await savingBank.connect(addr3).withdraw(4);
      const user3BalanceAfter = await token.balanceOf(addr3.address);
      expect(user3BalanceAfter - user3BalanceBefore).to.equal(
        deposit4.principal + interest3_2
      );

      // Verify isolation between users
      const user1Deposits = await savingBank.getUserDepositIds(addr1.address);
      const user2Deposits = await savingBank.getUserDepositIds(addr2.address);
      const user3Deposits = await savingBank.getUserDepositIds(addr3.address);

      expect(user1Deposits).to.deep.equal([1n]);
      expect(user2Deposits).to.deep.equal([2n]);
      expect(user3Deposits).to.deep.equal([3n, 4n]);

      // Verify vault balance tracking
      const vaultBalanceEnd = await vault.totalBalance();
      const totalInterestPaid = interest2 + interest3_1 + interest3_2;
      expect(vaultBalanceStart - vaultBalanceEnd).to.equal(totalInterestPaid);

      // Verify all NFTs handled correctly
      expect(await savingBank.balanceOf(addr1.address)).to.equal(0);
      expect(await savingBank.balanceOf(addr2.address)).to.equal(0);
      expect(await savingBank.balanceOf(addr3.address)).to.equal(0);
    });

    it("Should maintain contract balance correctly", async function () {
      const { addr1, addr2, token, savingBank } = await loadFixture(deployFixture);
      
      const contractBalanceStart = await token.balanceOf(
        await savingBank.getAddress()
      );

      await savingBank
        .connect(addr1)
        .openDepositCertificate(1, ethers.parseEther("1000"));
      await savingBank
        .connect(addr2)
        .openDepositCertificate(1, ethers.parseEther("2000"));

      const contractBalanceAfterDeposits = await token.balanceOf(
        await savingBank.getAddress()
      );
      expect(contractBalanceAfterDeposits - contractBalanceStart).to.equal(
        ethers.parseEther("3000")
      );

      await time.increase(7 * 24 * 60 * 60);

      await savingBank.connect(addr1).withdraw(1);
      const contractBalanceAfterWithdraw1 = await token.balanceOf(
        await savingBank.getAddress()
      );
      expect(contractBalanceAfterDeposits - contractBalanceAfterWithdraw1).to.equal(
        ethers.parseEther("1000")
      );

      await savingBank.connect(addr2).withdraw(2);
      const contractBalanceEnd = await token.balanceOf(
        await savingBank.getAddress()
      );
      expect(contractBalanceEnd).to.equal(contractBalanceStart);
    });

    it("Should handle simultaneous operations from multiple users", async function () {
      const { addr1, addr2, addr3, token, vault, savingBank } = await loadFixture(deployFixture);
      
      // All users deposit at same time
      await savingBank
        .connect(addr1)
        .openDepositCertificate(1, ethers.parseEther("1000"));
      await savingBank
        .connect(addr2)
        .openDepositCertificate(1, ethers.parseEther("1000"));
      await savingBank
        .connect(addr3)
        .openDepositCertificate(1, ethers.parseEther("1000"));

      // All users withdraw at same time
      await time.increase(7 * 24 * 60 * 60);

      const vaultBalanceBefore = await vault.totalBalance();

      await savingBank.connect(addr1).withdraw(1);
      await savingBank.connect(addr2).withdraw(2);
      await savingBank.connect(addr3).withdraw(3);

      const vaultBalanceAfter = await vault.totalBalance();

      // Verify all users got their principal back
      const user1Balance = await token.balanceOf(addr1.address);
      const user2Balance = await token.balanceOf(addr2.address);
      const user3Balance = await token.balanceOf(addr3.address);

      expect(user1Balance).to.be.gte(ethers.parseEther("100000")); // Started with 100000
      expect(user2Balance).to.be.gte(ethers.parseEther("100000"));
      expect(user3Balance).to.be.gte(ethers.parseEther("100000"));

      // Verify vault paid out all interests
      const interest1 = (ethers.parseEther("1000") * 500n * 7n * 86400n) / (365n * 86400n * 10000n);
      const totalInterest = interest1 * 3n;
      expect(vaultBalanceBefore - vaultBalanceAfter).to.equal(totalInterest);
    });
  });

  describe("Error Recovery Scenarios", function () {
    it("Should handle failed renew and allow retry", async function () {
      const { addr1, savingBank } = await loadFixture(deployFixture);
      
      await savingBank
        .connect(addr1)
        .openDepositCertificate(1, ethers.parseEther("1000"));

      await time.increase(7 * 24 * 60 * 60);

      // Disable plan 2
      await savingBank.updatePlanStatus(2, false);

      // Try to renew to disabled plan (should fail)
      await expect(
        savingBank.connect(addr1).renewWithNewPlan(1, 2)
      ).to.be.revertedWithCustomError(savingBank, "NotEnabledPlan");

      // Enable plan and retry (should succeed)
      await savingBank.updatePlanStatus(2, true);
      await expect(savingBank.connect(addr1).renewWithNewPlan(1, 2)).to.not.be
        .reverted;
    });

    it("Should handle insufficient vault balance", async function () {
      const { addr1, vault, savingBank } = await loadFixture(deployFixture);
      
      // Withdraw all vault balance
      const vaultBalance = await vault.totalBalance();
      await vault.withdrawVault(vaultBalance);

      await savingBank
        .connect(addr1)
        .openDepositCertificate(1, ethers.parseEther("1000"));

      await time.increase(7 * 24 * 60 * 60);

      // Try to withdraw (should fail due to insufficient vault)
      await expect(
        savingBank.connect(addr1).withdraw(1)
      ).to.be.revertedWithCustomError(vault, "InsufficientBalance");

      // Refund vault and retry
      await vault.fundVault(ethers.parseEther("10000"));
      await expect(savingBank.connect(addr1).withdraw(1)).to.not.be.reverted;
    });
  });

  describe("Gas Optimization Checks", function () {
    it("Should process multiple deposits efficiently", async function () {
      const { addr1, savingBank } = await loadFixture(deployFixture);
      
      const numDeposits = 10;
      
      for (let i = 0; i < numDeposits; i++) {
        await savingBank
          .connect(addr1)
          .openDepositCertificate(1, ethers.parseEther("100"));
      }

      const userDepositIds = await savingBank.getUserDepositIds(addr1.address);
      expect(userDepositIds.length).to.equal(numDeposits);
    });

    it("Should handle batch withdrawals", async function () {
      const { addr1, savingBank } = await loadFixture(deployFixture);
      
      // Open multiple deposits
      for (let i = 0; i < 5; i++) {
        await savingBank
          .connect(addr1)
          .openDepositCertificate(1, ethers.parseEther("100"));
      }

      await time.increase(7 * 24 * 60 * 60);

      // Withdraw all
      for (let i = 1; i <= 5; i++) {
        await savingBank.connect(addr1).withdraw(i);
      }

      expect(await savingBank.balanceOf(addr1.address)).to.equal(0);
    });
  });
});