import { ethers } from "hardhat";
import { expect } from "chai";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import {
  SavingBankV2,
  ERC20Mock,
  PrincipalVault,
  InterestVault,
  SavingBankNFT,
} from "../typechain";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("Integration Tests", function () {
  let admin: SignerWithAddress,
    operator: SignerWithAddress,
    user1: SignerWithAddress,
    user2: SignerWithAddress,
    user3: SignerWithAddress;
  let savingBank: SavingBankV2,
    token: ERC20Mock,
    principalVault: PrincipalVault,
    interestVault: InterestVault,
    nft: SavingBankNFT;

  const OPERATOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("OPERATOR_ROLE"));

  beforeEach(async function () {
    [admin, operator, user1, user2, user3] = await ethers.getSigners();

    const TokenFactory = await ethers.getContractFactory("ERC20Mock");
    token = await TokenFactory.deploy();

    const NFTFactory = await ethers.getContractFactory("SavingBankNFT");
    nft = await NFTFactory.deploy();

    const PrincipalVaultFactory = await ethers.getContractFactory(
      "PrincipalVault",
    );
    principalVault = await PrincipalVaultFactory.deploy(
      await token.getAddress(),
      admin.address,
      operator.address,
    );

    const InterestVaultFactory = await ethers.getContractFactory(
      "InterestVault",
    );
    interestVault = await InterestVaultFactory.deploy(
      await token.getAddress(),
      admin.address,
      operator.address,
    );

    const SavingBankFactory = await ethers.getContractFactory("SavingBankV2");
    savingBank = await SavingBankFactory.deploy(
      await token.getAddress(),
      await principalVault.getAddress(),
      await interestVault.getAddress(),
      await nft.getAddress(),
      admin.address,
      admin.address,
      operator.address,
    );

    await nft.connect(admin).setSavingBank(await savingBank.getAddress());
    await principalVault
      .connect(admin)
      .grantRole(OPERATOR_ROLE, await savingBank.getAddress());
    await interestVault
      .connect(admin)
      .grantRole(OPERATOR_ROLE, await savingBank.getAddress());

    await token.mint(user1.address, ethers.parseEther("10000"));
    await token.mint(user2.address, ethers.parseEther("10000"));
    await token.mint(user3.address, ethers.parseEther("10000"));
    await token.mint(admin.address, ethers.parseEther("100000"));

    await token
      .connect(user1)
      .approve(await principalVault.getAddress(), ethers.MaxUint256);
    await token
      .connect(user2)
      .approve(await principalVault.getAddress(), ethers.MaxUint256);
    await token
      .connect(user3)
      .approve(await principalVault.getAddress(), ethers.MaxUint256);
    await token
      .connect(admin)
      .approve(await interestVault.getAddress(), ethers.MaxUint256);

    await interestVault.connect(admin).depositFund(ethers.parseEther("50000"));
  });

  describe("Full Deposit Lifecycle", function () {
    it("Should complete full cycle: deposit -> wait -> withdraw", async function () {
      await savingBank
        .connect(operator)
        .createPlan(
          30,
          1000,
          ethers.parseEther("100"),
          ethers.parseEther("10000"),
          5000,
        );

      const balanceBefore = await token.balanceOf(user1.address);
      await savingBank
        .connect(user1)
        .openDepositCertificate(1, ethers.parseEther("1000"));

      await time.increase(31 * 86400);
      await savingBank.connect(user1).withdraw(1);

      const balanceAfter = await token.balanceOf(user1.address);
      expect(balanceAfter).to.be.gt(balanceBefore);
    });

    it("Should handle multiple users with different plans", async function () {
      await savingBank
        .connect(operator)
        .createPlan(
          30,
          1000,
          ethers.parseEther("100"),
          ethers.parseEther("10000"),
          5000,
        );
      await savingBank
        .connect(operator)
        .createPlan(
          60,
          1500,
          ethers.parseEther("100"),
          ethers.parseEther("10000"),
          5000,
        );

      await savingBank
        .connect(user1)
        .openDepositCertificate(1, ethers.parseEther("1000"));
      await savingBank
        .connect(user2)
        .openDepositCertificate(2, ethers.parseEther("2000"));

      await time.increase(31 * 86400);
      await savingBank.connect(user1).withdraw(1);

      await time.increase(30 * 86400);
      await savingBank.connect(user2).withdraw(2);

      expect(await nft.balanceOf(user1.address)).to.equal(0);
      expect(await nft.balanceOf(user2.address)).to.equal(0);
    });

    it("Should track vault balances correctly through lifecycle", async function () {
      await savingBank
        .connect(operator)
        .createPlan(
          30,
          1000,
          ethers.parseEther("100"),
          ethers.parseEther("10000"),
          5000,
        );

      await savingBank
        .connect(user1)
        .openDepositCertificate(1, ethers.parseEther("1000"));
      expect(await principalVault.getBalance()).to.equal(
        ethers.parseEther("1000"),
      );

      await time.increase(31 * 86400);
      const interestBefore = await interestVault.getBalance();

      await savingBank.connect(user1).withdraw(1);

      expect(await principalVault.getBalance()).to.equal(0);
      expect(await interestVault.getBalance()).to.be.lt(interestBefore);
    });
  });

  describe("Renewal Flow", function () {
    it("Should compound interest through renewal", async function () {
      await savingBank
        .connect(operator)
        .createPlan(
          30,
          1000,
          ethers.parseEther("100"),
          ethers.parseEther("10000"),
          5000,
        );

      await savingBank
        .connect(user1)
        .openDepositCertificate(1, ethers.parseEther("1000"));
      await time.increase(31 * 86400);

      const interest = await savingBank.getCalculateInterest(1);
      await savingBank.connect(user1).renew(1, 1);

      const newDeposit = await savingBank.depositCertificates(2);
      expect(newDeposit.principal).to.equal(
        ethers.parseEther("1000") + interest,
      );
    });

    it("Should handle multiple renewals", async function () {
      await savingBank
        .connect(operator)
        .createPlan(
          30,
          1000,
          ethers.parseEther("100"),
          ethers.parseEther("100000"),
          5000,
        );

      await savingBank
        .connect(user1)
        .openDepositCertificate(1, ethers.parseEther("1000"));

      // First renewal
      await time.increase(31 * 86400);
      await savingBank.connect(user1).renew(1, 1);

      // Second renewal
      await time.increase(31 * 86400);
      await savingBank.connect(user1).renew(2, 1);

      // Third renewal
      await time.increase(31 * 86400);
      await savingBank.connect(user1).renew(3, 1);

      const finalDeposit = await savingBank.depositCertificates(4);
      expect(finalDeposit.principal).to.be.gt(ethers.parseEther("1000"));
    });

    it("Should maintain correct NFT ownership through renewals", async function () {
      await savingBank
        .connect(operator)
        .createPlan(
          30,
          1000,
          ethers.parseEther("100"),
          ethers.parseEther("10000"),
          5000,
        );

      await savingBank
        .connect(user1)
        .openDepositCertificate(1, ethers.parseEther("1000"));
      expect(await nft.ownerOf(1)).to.equal(user1.address);

      await time.increase(31 * 86400);
      await savingBank.connect(user1).renew(1, 1);

      await expect(nft.ownerOf(1)).to.be.reverted;
      expect(await nft.ownerOf(2)).to.equal(user1.address);
    });
  });

  describe("Multi-User Scenarios", function () {
    it("Should handle concurrent deposits", async function () {
      await savingBank
        .connect(operator)
        .createPlan(
          30,
          1000,
          ethers.parseEther("100"),
          ethers.parseEther("10000"),
          5000,
        );

      await savingBank
        .connect(user1)
        .openDepositCertificate(1, ethers.parseEther("1000"));
      await savingBank
        .connect(user2)
        .openDepositCertificate(1, ethers.parseEther("2000"));
      await savingBank
        .connect(user3)
        .openDepositCertificate(1, ethers.parseEther("1500"));

      expect(await principalVault.getBalance()).to.equal(
        ethers.parseEther("4500"),
      );
      expect(await nft.balanceOf(user1.address)).to.equal(1);
      expect(await nft.balanceOf(user2.address)).to.equal(1);
      expect(await nft.balanceOf(user3.address)).to.equal(1);
    });

    it("Should handle mixed withdrawal strategies", async function () {
      await savingBank
        .connect(operator)
        .createPlan(
          30,
          1000,
          ethers.parseEther("100"),
          ethers.parseEther("10000"),
          5000,
        );

      await savingBank
        .connect(user1)
        .openDepositCertificate(1, ethers.parseEther("1000"));
      await savingBank
        .connect(user2)
        .openDepositCertificate(1, ethers.parseEther("2000"));
      await savingBank
        .connect(user3)
        .openDepositCertificate(1, ethers.parseEther("1500"));

      // User1 early withdraws
      await savingBank.connect(user1).earlyWithdraw(1);

      // User2 waits and withdraws
      await time.increase(31 * 86400);
      await savingBank.connect(user2).withdraw(2);

      // User3 renews
      await savingBank.connect(user3).renew(3, 1);

      expect(await nft.balanceOf(user1.address)).to.equal(0);
      expect(await nft.balanceOf(user2.address)).to.equal(0);
      expect(await nft.balanceOf(user3.address)).to.equal(1);
    });

    it("Should maintain separate user deposit lists", async function () {
      await savingBank
        .connect(operator)
        .createPlan(
          30,
          1000,
          ethers.parseEther("100"),
          ethers.parseEther("10000"),
          5000,
        );

      await savingBank
        .connect(user1)
        .openDepositCertificate(1, ethers.parseEther("1000"));
      await savingBank
        .connect(user1)
        .openDepositCertificate(1, ethers.parseEther("1500"));
      await savingBank
        .connect(user2)
        .openDepositCertificate(1, ethers.parseEther("2000"));

      const user1Deposits = await savingBank.getUserDepositIds(user1.address);
      const user2Deposits = await savingBank.getUserDepositIds(user2.address);

      expect(user1Deposits.length).to.equal(2);
      expect(user2Deposits.length).to.equal(1);
    });
  });

  describe("Plan Management", function () {
    it("Should handle plan disabling with existing deposits", async function () {
      await savingBank
        .connect(operator)
        .createPlan(
          30,
          1000,
          ethers.parseEther("100"),
          ethers.parseEther("10000"),
          5000,
        );
      await savingBank
        .connect(user1)
        .openDepositCertificate(1, ethers.parseEther("1000"));

      await savingBank.connect(operator).updatePlanStatus(1, false);

      // Existing deposit should still work
      await time.increase(31 * 86400);
      await savingBank.connect(user1).withdraw(1);

      // New deposits should fail
      await expect(
        savingBank
          .connect(user2)
          .openDepositCertificate(1, ethers.parseEther("1000")),
      ).to.be.revertedWithCustomError(savingBank, "NotEnabledPlan");
    });

    it("Should handle plan updates correctly", async function () {
      await savingBank
        .connect(operator)
        .createPlan(
          30,
          1000,
          ethers.parseEther("100"),
          ethers.parseEther("10000"),
          5000,
        );
      await savingBank
        .connect(user1)
        .openDepositCertificate(1, ethers.parseEther("1000"));

      await savingBank
        .connect(operator)
        .updatePlan(
          1,
          60,
          2000,
          ethers.parseEther("200"),
          ethers.parseEther("20000"),
          6000,
        );

      // Old deposit uses snapshot
      const oldDeposit = await savingBank.depositCertificates(1);
      expect(oldDeposit.snapshotAprBps).to.equal(1000);

      // New deposit uses updated plan
      await savingBank
        .connect(user2)
        .openDepositCertificate(1, ethers.parseEther("2000"));
      const newDeposit = await savingBank.depositCertificates(2);
      expect(newDeposit.snapshotAprBps).to.equal(2000);
    });
  });

  describe("Vault Integration", function () {
    it("Should maintain vault balance consistency", async function () {
      await savingBank
        .connect(operator)
        .createPlan(
          30,
          1000,
          ethers.parseEther("100"),
          ethers.parseEther("10000"),
          5000,
        );

      await savingBank
        .connect(user1)
        .openDepositCertificate(1, ethers.parseEther("1000"));
      await savingBank
        .connect(user2)
        .openDepositCertificate(1, ethers.parseEther("2000"));

      const principalBalance = await principalVault.getBalance();
      const actualBalance = await principalVault.getActualBalance();
      expect(principalBalance).to.equal(actualBalance);
    });

    it("Should handle admin vault operations alongside user deposits", async function () {
      await savingBank
        .connect(operator)
        .createPlan(
          30,
          1000,
          ethers.parseEther("100"),
          ethers.parseEther("10000"),
          5000,
        );

      await savingBank
        .connect(user1)
        .openDepositCertificate(1, ethers.parseEther("1000"));

      await token
        .connect(admin)
        .approve(await principalVault.getAddress(), ethers.MaxUint256);
      await principalVault
        .connect(admin)
        .depositFund(ethers.parseEther("5000"));

      expect(await principalVault.getBalance()).to.equal(
        ethers.parseEther("6000"),
      );

      await time.increase(31 * 86400);
      await savingBank.connect(user1).withdraw(1);

      expect(await principalVault.getBalance()).to.equal(
        ethers.parseEther("5000"),
      );
    });

    it("Should handle interest vault depletion gracefully", async function () {
      await savingBank
        .connect(operator)
        .createPlan(
          365,
          100,
          ethers.parseEther("100"),
          ethers.parseEther("10000"),
          5000,
        );

      // Drain most of interest vault
      await interestVault
        .connect(admin)
        .withdrawFund(ethers.parseEther("49900"));

      await savingBank
        .connect(user1)
        .openDepositCertificate(1, ethers.parseEther("10000"));

      await time.increase(366 * 86400);

      // Should still be able to withdraw (interest ~10000 tokens needed)
      await expect(savingBank.connect(user1).withdraw(1)).to.not.be.reverted;
    });
  });

  describe("NFT Integration", function () {
    it("Should create NFT metadata correctly", async function () {
      await savingBank
        .connect(operator)
        .createPlan(
          30,
          1000,
          ethers.parseEther("100"),
          ethers.parseEther("10000"),
          5000,
        );
      await savingBank
        .connect(user1)
        .openDepositCertificate(1, ethers.parseEther("1000"));

      const certData = await nft.getCertificateData(1);
      expect(certData.depositId).to.equal(1);
      expect(certData.planId).to.equal(1);
      expect(certData.depositAmount).to.equal(ethers.parseEther("1000"));
    });

    it("Should handle NFT lifecycle through deposit lifecycle", async function () {
      await savingBank
        .connect(operator)
        .createPlan(
          30,
          1000,
          ethers.parseEther("100"),
          ethers.parseEther("10000"),
          5000,
        );

      await savingBank
        .connect(user1)
        .openDepositCertificate(1, ethers.parseEther("1000"));
      expect(await nft.balanceOf(user1.address)).to.equal(1);

      await time.increase(31 * 86400);
      await savingBank.connect(user1).withdraw(1);

      expect(await nft.balanceOf(user1.address)).to.equal(0);
      await expect(nft.getCertificateData(1)).to.not.be.reverted; // Data still exists
    });
  });

  describe("Complex Scenarios", function () {
    it("Should handle rapid sequential operations", async function () {
      await savingBank
        .connect(operator)
        .createPlan(
          1,
          1000,
          ethers.parseEther("100"),
          ethers.parseEther("10000"),
          5000,
        );

      await savingBank
        .connect(user1)
        .openDepositCertificate(1, ethers.parseEther("1000"));
      await savingBank
        .connect(user1)
        .openDepositCertificate(1, ethers.parseEther("1000"));
      await savingBank
        .connect(user1)
        .openDepositCertificate(1, ethers.parseEther("1000"));

      await time.increase(2 * 86400);

      await savingBank.connect(user1).withdraw(1);
      await savingBank.connect(user1).withdraw(2);
      await savingBank.connect(user1).withdraw(3);

      expect(await nft.balanceOf(user1.address)).to.equal(0);
    });

    it("Should handle mixed maturity states", async function () {
      await savingBank
        .connect(operator)
        .createPlan(
          10,
          1000,
          ethers.parseEther("100"),
          ethers.parseEther("10000"),
          5000,
        );
      await savingBank
        .connect(operator)
        .createPlan(
          30,
          1000,
          ethers.parseEther("100"),
          ethers.parseEther("10000"),
          5000,
        );

      await savingBank
        .connect(user1)
        .openDepositCertificate(1, ethers.parseEther("1000"));
      await savingBank
        .connect(user1)
        .openDepositCertificate(2, ethers.parseEther("1000"));

      await time.increase(11 * 86400);

      await savingBank.connect(user1).withdraw(1);

      await expect(
        savingBank.connect(user1).withdraw(2),
      ).to.be.revertedWithCustomError(savingBank, "NotMaturedYet");

      await time.increase(20 * 86400);
      await savingBank.connect(user1).withdraw(2);
    });

    it("Should calculate compounded interest correctly over multiple renewals", async function () {
      await savingBank
        .connect(operator)
        .createPlan(
          30,
          1000,
          ethers.parseEther("100"),
          ethers.parseEther("100000"),
          5000,
        );

      let principal = ethers.parseEther("1000");
      await savingBank.connect(user1).openDepositCertificate(1, principal);

      for (let i = 1; i <= 3; i++) {
        await time.increase(31 * 86400);
        const interest = await savingBank.getCalculateInterest(i);
        await savingBank.connect(user1).renew(i, 1);
        principal = principal + interest;
      }

      const finalDeposit = await savingBank.depositCertificates(4);
      expect(finalDeposit.principal).to.be.closeTo(
        principal,
        ethers.parseEther("0.01"),
      );
    });
  });

  describe("State Consistency", function () {
    it("Should maintain consistent state across multiple operations", async function () {
      await savingBank
        .connect(operator)
        .createPlan(
          30,
          1000,
          ethers.parseEther("100"),
          ethers.parseEther("10000"),
          5000,
        );

      await savingBank
        .connect(user1)
        .openDepositCertificate(1, ethers.parseEther("1000"));
      await savingBank
        .connect(user2)
        .openDepositCertificate(1, ethers.parseEther("2000"));

      const user1DepositsBefore = await savingBank.getUserDepositIds(
        user1.address,
      );
      const user2DepositsBefore = await savingBank.getUserDepositIds(
        user2.address,
      );

      await time.increase(31 * 86400);

      await savingBank.connect(user1).withdraw(1);

      const user1DepositsAfter = await savingBank.getUserDepositIds(
        user1.address,
      );
      const user2DepositsAfter = await savingBank.getUserDepositIds(
        user2.address,
      );

      expect(user1DepositsBefore.length).to.equal(user1DepositsAfter.length);
      expect(user2DepositsBefore.length).to.equal(user2DepositsAfter.length);
    });

    it("Should maintain correct deposit ID sequencing", async function () {
      await savingBank
        .connect(operator)
        .createPlan(
          30,
          1000,
          ethers.parseEther("100"),
          ethers.parseEther("10000"),
          5000,
        );

      await savingBank
        .connect(user1)
        .openDepositCertificate(1, ethers.parseEther("1000"));
      expect(await savingBank.nextDepositId()).to.equal(2);

      await savingBank
        .connect(user2)
        .openDepositCertificate(1, ethers.parseEther("2000"));
      expect(await savingBank.nextDepositId()).to.equal(3);

      await time.increase(31 * 86400);
      await savingBank.connect(user1).renew(1, 1);
      expect(await savingBank.nextDepositId()).to.equal(4);
    });
  });
});
