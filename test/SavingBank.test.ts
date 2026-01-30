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

describe("SavingBank Core Tests", function () {
  let admin: SignerWithAddress,
    operator: SignerWithAddress,
    user1: SignerWithAddress,
    user2: SignerWithAddress;
  let savingBank: SavingBankV2,
    token: ERC20Mock,
    principalVault: PrincipalVault,
    interestVault: InterestVault,
    nft: SavingBankNFT;
  let feeReceiver: SignerWithAddress;

  const ADMIN_ROLE = ethers.keccak256(ethers.toUtf8Bytes("ADMIN_ROLE"));
  const OPERATOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("OPERATOR_ROLE"));

  enum DepositStatus {
    Active,
    Withdrawn,
    EarlyWithdrawn,
    Renewed,
  }

  beforeEach(async function () {
    [admin, operator, user1, user2, feeReceiver] = await ethers.getSigners();

    // Deploy token
    const ERC20MockFactory = await ethers.getContractFactory("ERC20Mock");
    token = await ERC20MockFactory.deploy();

    // Deploy NFT
    const NFTFactory = await ethers.getContractFactory("SavingBankNFT");
    nft = await NFTFactory.deploy();

    // Deploy vaults
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

    // Deploy SavingBank
    const SavingBankFactory = await ethers.getContractFactory("SavingBankV2");
    savingBank = await SavingBankFactory.deploy(
      await token.getAddress(),
      await principalVault.getAddress(),
      await interestVault.getAddress(),
      await nft.getAddress(),
      feeReceiver.address,
      admin.address,
      operator.address,
    );

    // Setup roles
    await nft.connect(admin).setSavingBank(await savingBank.getAddress());
    await principalVault
      .connect(admin)
      .grantRole(OPERATOR_ROLE, await savingBank.getAddress());
    await interestVault
      .connect(admin)
      .grantRole(OPERATOR_ROLE, await savingBank.getAddress());

    // Mint tokens
    await token.mint(user1.address, ethers.parseEther("10000"));
    await token.mint(user2.address, ethers.parseEther("10000"));
    await token.mint(admin.address, ethers.parseEther("100000"));

    // Approvals
    await token
      .connect(user1)
      .approve(await principalVault.getAddress(), ethers.MaxUint256);
    await token
      .connect(user2)
      .approve(await principalVault.getAddress(), ethers.MaxUint256);
    await token
      .connect(admin)
      .approve(await principalVault.getAddress(), ethers.MaxUint256);
    await token
      .connect(admin)
      .approve(await interestVault.getAddress(), ethers.MaxUint256);

    // Fund interest vault
    await interestVault.connect(admin).depositFund(ethers.parseEther("50000"));
  });

  describe("Deployment", function () {
    it("Should set correct addresses and roles", async function () {
      expect(await savingBank.token()).to.equal(await token.getAddress());
      expect(await savingBank.principalVault()).to.equal(
        await principalVault.getAddress(),
      );
      expect(await savingBank.interestVault()).to.equal(
        await interestVault.getAddress(),
      );
      expect(await savingBank.nft()).to.equal(await nft.getAddress());
      expect(await savingBank.feeReceiver()).to.equal(feeReceiver.address);
      expect(await savingBank.hasRole(ADMIN_ROLE, admin.address)).to.be.true;
      expect(await savingBank.hasRole(OPERATOR_ROLE, operator.address)).to.be
        .true;
    });

    it("Should initialize IDs correctly", async function () {
      expect(await savingBank.nextPlanId()).to.equal(1);
      expect(await savingBank.nextDepositId()).to.equal(1);
    });

    it("Should revert if token is zero address", async function () {
      const SavingBankFactory = await ethers.getContractFactory("SavingBankV2");
      await expect(
        SavingBankFactory.deploy(
          ethers.ZeroAddress,
          await principalVault.getAddress(),
          await interestVault.getAddress(),
          await nft.getAddress(),
          feeReceiver.address,
          admin.address,
          operator.address,
        ),
      ).to.be.revertedWithCustomError(savingBank, "InvalidToken");
    });
  });

  describe("Create Plan", function () {
    it("Should create a plan with valid parameters", async function () {
      await expect(
        savingBank
          .connect(operator)
          .createPlan(
            30,
            1000,
            ethers.parseEther("100"),
            ethers.parseEther("10000"),
            5000,
          ),
      )
        .to.emit(savingBank, "PlanCreated")
        .withArgs(
          1,
          30,
          1000,
          ethers.parseEther("100"),
          ethers.parseEther("10000"),
          5000,
        );

      const plan = await savingBank.savingPlans(1);
      expect(plan.tenorDays).to.equal(30);
      expect(plan.aprBps).to.equal(1000);
      expect(plan.enabled).to.be.true;
      expect(await savingBank.nextPlanId()).to.equal(2);
    });

    it("Should revert with invalid parameters", async function () {
      await expect(
        savingBank
          .connect(operator)
          .createPlan(
            0,
            1000,
            ethers.parseEther("100"),
            ethers.parseEther("10000"),
            5000,
          ),
      ).to.be.revertedWithCustomError(savingBank, "InvalidTenor");
      await expect(
        savingBank
          .connect(operator)
          .createPlan(
            30,
            0,
            ethers.parseEther("100"),
            ethers.parseEther("10000"),
            5000,
          ),
      ).to.be.revertedWithCustomError(savingBank, "InvalidAPR");
      await expect(
        savingBank
          .connect(operator)
          .createPlan(30, 1000, 0, ethers.parseEther("10000"), 5000),
      ).to.be.revertedWithCustomError(savingBank, "InvalidMinDeposit");
      await expect(
        savingBank
          .connect(operator)
          .createPlan(
            30,
            1000,
            ethers.parseEther("1000"),
            ethers.parseEther("100"),
            5000,
          ),
      ).to.be.revertedWithCustomError(savingBank, "InvalidMaxDeposit");
    });

    it("Should revert with invalid penalty", async function () {
      await expect(
        savingBank
          .connect(operator)
          .createPlan(
            30,
            1000,
            ethers.parseEther("100"),
            ethers.parseEther("10000"),
            0,
          ),
      ).to.be.revertedWithCustomError(savingBank, "NotExceed");
      await expect(
        savingBank
          .connect(operator)
          .createPlan(
            30,
            1000,
            ethers.parseEther("100"),
            ethers.parseEther("10000"),
            10001,
          ),
      ).to.be.revertedWithCustomError(savingBank, "NotExceed");
    });

    it("Should revert if non-operator tries to create plan", async function () {
      await expect(
        savingBank
          .connect(user1)
          .createPlan(
            30,
            1000,
            ethers.parseEther("100"),
            ethers.parseEther("10000"),
            5000,
          ),
      ).to.be.reverted;
    });

    it("Should allow maxDeposit to be 0 (unlimited)", async function () {
      await savingBank
        .connect(operator)
        .createPlan(30, 1000, ethers.parseEther("100"), 0, 5000);
      const plan = await savingBank.savingPlans(1);
      expect(plan.maxDeposit).to.equal(0);
    });
  });

  describe("Open Deposit Certificate", function () {
    beforeEach(async function () {
      await savingBank
        .connect(operator)
        .createPlan(
          30,
          1000,
          ethers.parseEther("100"),
          ethers.parseEther("10000"),
          5000,
        );
    });

    it("Should open deposit successfully and mint NFT", async function () {
      const depositAmount = ethers.parseEther("1000");
      await expect(
        savingBank.connect(user1).openDepositCertificate(1, depositAmount),
      ).to.emit(savingBank, "DepositCertificateOpened");

      const deposit = await savingBank.depositCertificates(1);
      expect(deposit.owner).to.equal(user1.address);
      expect(deposit.principal).to.equal(depositAmount);
      expect(deposit.status).to.equal(DepositStatus.Active);
      expect(await nft.ownerOf(1)).to.equal(user1.address);
    });

    it("Should transfer tokens and track correctly", async function () {
      const depositAmount = ethers.parseEther("1000");
      const balanceBefore = await token.balanceOf(
        await principalVault.getAddress(),
      );
      await savingBank.connect(user1).openDepositCertificate(1, depositAmount);

      expect(await token.balanceOf(await principalVault.getAddress())).to.equal(
        balanceBefore + depositAmount,
      );
      const userDeposits = await savingBank.getUserDepositIds(user1.address);
      expect(userDeposits.length).to.equal(1);
      expect(await savingBank.nextDepositId()).to.equal(2);
    });

    it("Should snapshot plan data correctly", async function () {
      await savingBank
        .connect(user1)
        .openDepositCertificate(1, ethers.parseEther("1000"));
      const deposit = await savingBank.depositCertificates(1);
      expect(deposit.snapshotAprBps).to.equal(1000);
      expect(deposit.snapshotTenorDays).to.equal(30);
      expect(deposit.snapshotEarlyWithdrawPenaltyBps).to.equal(5000);
    });

    it("Should revert with invalid conditions", async function () {
      await savingBank.connect(operator).updatePlanStatus(1, false);
      await expect(
        savingBank
          .connect(user1)
          .openDepositCertificate(1, ethers.parseEther("1000")),
      ).to.be.revertedWithCustomError(savingBank, "NotEnabledPlan");

      await savingBank.connect(operator).updatePlanStatus(1, true);
      await expect(
        savingBank
          .connect(user1)
          .openDepositCertificate(1, ethers.parseEther("50")),
      ).to.be.revertedWithCustomError(savingBank, "InvalidAmount");
      await expect(
        savingBank
          .connect(user1)
          .openDepositCertificate(1, ethers.parseEther("20000")),
      ).to.be.revertedWithCustomError(savingBank, "InvalidAmount");
    });

    it("Should allow deposits at exact boundaries", async function () {
      await savingBank
        .connect(user1)
        .openDepositCertificate(1, ethers.parseEther("100"));
      await savingBank
        .connect(user1)
        .openDepositCertificate(1, ethers.parseEther("1000"));
      expect(await savingBank.nextDepositId()).to.equal(3);
    });

    it("Should revert when paused", async function () {
      await savingBank.connect(admin).pause();
      await expect(
        savingBank
          .connect(user1)
          .openDepositCertificate(1, ethers.parseEther("1000")),
      ).to.be.reverted;
    });
  });

  describe("Withdraw", function () {
    beforeEach(async function () {
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
    });

    it("Should withdraw successfully after maturity", async function () {
      const balanceBefore = await token.balanceOf(user1.address);
      await time.increase(31 * 86400);

      await expect(savingBank.connect(user1).withdraw(1)).to.emit(
        savingBank,
        "Withdrawn",
      );

      const balanceAfter = await token.balanceOf(user1.address);
      expect(balanceAfter).to.be.gt(balanceBefore);

      const deposit = await savingBank.depositCertificates(1);
      expect(deposit.status).to.equal(DepositStatus.Withdrawn);
      await expect(nft.ownerOf(1)).to.be.reverted;
    });

    it("Should calculate interest correctly", async function () {
      const interest = await savingBank.getCalculateInterest(1);
      expect(interest).to.be.closeTo(
        ethers.parseEther("8.219"),
        ethers.parseEther("0.01"),
      );
    });

    it("Should revert with invalid conditions", async function () {
      await expect(
        savingBank.connect(user1).withdraw(1),
      ).to.be.revertedWithCustomError(savingBank, "NotMaturedYet");

      await time.increase(31 * 86400);
      await expect(
        savingBank.connect(user2).withdraw(1),
      ).to.be.revertedWithCustomError(savingBank, "NotOwner");

      await savingBank.connect(user1).withdraw(1);
      await expect(
        savingBank.connect(user1).withdraw(1),
      ).to.be.revertedWithCustomError(savingBank, "NotActiveDeposit");
    });
  });

  describe("Early Withdraw", function () {
    beforeEach(async function () {
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
    });

    it("Should early withdraw with penalty correctly", async function () {
      const balanceBefore = await token.balanceOf(user1.address);
      const feeBalanceBefore = await token.balanceOf(feeReceiver.address);

      await time.increase(10 * 86400);
      await expect(savingBank.connect(user1).earlyWithdraw(1)).to.emit(
        savingBank,
        "EarlyWithdrawn",
      );

      const balanceAfter = await token.balanceOf(user1.address);
      const feeBalanceAfter = await token.balanceOf(feeReceiver.address);

      expect(balanceAfter - balanceBefore).to.equal(ethers.parseEther("500"));
      expect(feeBalanceAfter - feeBalanceBefore).to.equal(
        ethers.parseEther("500"),
      );

      const deposit = await savingBank.depositCertificates(1);
      expect(deposit.status).to.equal(DepositStatus.EarlyWithdrawn);
      await expect(nft.ownerOf(1)).to.be.reverted;
    });

    it("Should revert with invalid conditions", async function () {
      await time.increase(31 * 86400);
      await expect(
        savingBank.connect(user1).earlyWithdraw(1),
      ).to.be.revertedWithCustomError(savingBank, "AlreadyMatured");

      await time.increase((await time.latest()) - 20 * 86400);
      await expect(
        savingBank.connect(user2).earlyWithdraw(1),
      ).to.be.revertedWithCustomError(savingBank, "NotOwner");
    });
  });

  describe("Renew Deposit", function () {
    beforeEach(async function () {
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
    });

    it("Should renew successfully with compound interest", async function () {
      await time.increase(31 * 86400);
      const interest = await savingBank.getCalculateInterest(1);

      await expect(savingBank.connect(user1).renew(1, 2))
        .to.emit(savingBank, "Renewed")
        .withArgs(1, 2, interest + ethers.parseEther("1000"));

      const newDeposit = await savingBank.depositCertificates(2);
      expect(newDeposit.principal).to.equal(
        ethers.parseEther("1000") + interest,
      );
      expect(await nft.ownerOf(2)).to.equal(user1.address);
      await expect(nft.ownerOf(1)).to.be.reverted;

      const oldDeposit = await savingBank.depositCertificates(1);
      expect(oldDeposit.status).to.equal(DepositStatus.Renewed);
      expect(oldDeposit.renewedDepositId).to.equal(2);
    });

    it("Should revert with invalid conditions", async function () {
      await expect(
        savingBank.connect(user1).renew(1, 2),
      ).to.be.revertedWithCustomError(savingBank, "NotMaturedYet");

      await time.increase(31 * 86400);
      await expect(
        savingBank.connect(user2).renew(1, 2),
      ).to.be.revertedWithCustomError(savingBank, "NotOwner");

      await savingBank.connect(user1).renew(1, 2);
      await expect(
        savingBank.connect(user1).renew(1, 2),
      ).to.be.revertedWithCustomError(savingBank, "AlreadyRenewed");

      await savingBank.connect(operator).updatePlanStatus(2, false);
      await time.increase(61 * 86400);
      await expect(
        savingBank.connect(user1).renew(2, 2),
      ).to.be.revertedWithCustomError(savingBank, "NotEnabledPlan");
    });
  });

  describe("Admin Functions", function () {
    it("Should update vaults", async function () {
      const newPrincipalVault = await (
        await ethers.getContractFactory("PrincipalVault")
      ).deploy(await token.getAddress(), admin.address, operator.address);
      const newInterestVault = await (
        await ethers.getContractFactory("InterestVault")
      ).deploy(await token.getAddress(), admin.address, operator.address);

      await expect(
        savingBank
          .connect(admin)
          .setVaults(
            await newPrincipalVault.getAddress(),
            await newInterestVault.getAddress(),
          ),
      ).to.emit(savingBank, "VaultUpdated");
    });

    it("Should update NFT contract", async function () {
      const newNFT = await (
        await ethers.getContractFactory("SavingBankNFT")
      ).deploy();
      await expect(
        savingBank.connect(admin).setNFT(await newNFT.getAddress()),
      ).to.emit(savingBank, "NFTUpdated");
    });

    it("Should update fee receiver", async function () {
      await expect(savingBank.connect(admin).setFeeReceiver(user2.address))
        .to.emit(savingBank, "FeeReceiverUpdated")
        .withArgs(user2.address);
    });

    it("Should pause contract", async function () {
      await savingBank.connect(admin).pause();
      expect(await savingBank.paused()).to.be.true;
    });

    it("Should unpause contract", async function () {
      await savingBank.connect(admin).pause();
      await savingBank.connect(admin).unpause();
      expect(await savingBank.paused()).to.be.false;
    });

    it("Should revert if non-admin tries to pause", async function () {
      await expect(savingBank.connect(user1).pause()).to.be.reverted;
    });
  });

  describe("Operator Functions", function () {
    it("Should update plan status", async function () {
      await savingBank
        .connect(operator)
        .createPlan(
          30,
          1000,
          ethers.parseEther("100"),
          ethers.parseEther("10000"),
          5000,
        );
      await expect(savingBank.connect(operator).updatePlanStatus(1, false))
        .to.emit(savingBank, "PlanUpdated")
        .withArgs(1, false);
    });

    it("Should update plan parameters", async function () {
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
        .updatePlan(
          1,
          60,
          1500,
          ethers.parseEther("200"),
          ethers.parseEther("20000"),
          6000,
        );
      const plan = await savingBank.savingPlans(1);
      expect(plan.tenorDays).to.equal(60);
      expect(plan.aprBps).to.equal(1500);
    });

    it("Should revert if non-operator tries to update plan", async function () {
      await savingBank
        .connect(operator)
        .createPlan(
          30,
          1000,
          ethers.parseEther("100"),
          ethers.parseEther("10000"),
          5000,
        );
      await expect(savingBank.connect(user1).updatePlanStatus(1, false)).to.be
        .reverted;
    });
  });

  describe("View Functions", function () {
    beforeEach(async function () {
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
    });

    it("Should get plan info", async function () {
      const [tenorDays, aprBps, minDeposit, maxDeposit, penalty, enabled] =
        await savingBank.getPlanInfo(1);
      expect(tenorDays).to.equal(30);
      expect(aprBps).to.equal(1000);
      expect(enabled).to.be.true;
    });

    it("Should get user deposit IDs", async function () {
      const deposits = await savingBank.getUserDepositIds(user1.address);
      expect(deposits.length).to.equal(1);
      expect(deposits[0]).to.equal(1);
    });

    it("Should get deposit info", async function () {
      const [owner, planId, principal, startAt, maturityAt, status, renewedId] =
        await savingBank.getDepositInfo(1);
      expect(owner).to.equal(user1.address);
      expect(planId).to.equal(1);
      expect(principal).to.equal(ethers.parseEther("1000"));
      expect(status).to.equal(DepositStatus.Active);
    });

    it("Should calculate interest correctly", async function () {
      const interest = await savingBank.getCalculateInterest(1);
      expect(interest).to.be.gt(0);
    });
  });
});
