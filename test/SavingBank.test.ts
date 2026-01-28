import "@nomicfoundation/hardhat-ethers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { SavingBank, ERC20Mock, LiquidityVault } from "../typechain";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("SavingBank", function () {
  let deployer: SignerWithAddress,
    admin: SignerWithAddress,
    vault1: SignerWithAddress,
    receiver1: SignerWithAddress,
    receiver2: SignerWithAddress,
    addr1: SignerWithAddress,
    addr2: SignerWithAddress,
    addr3: SignerWithAddress,
    addr4: SignerWithAddress,
    addr5: SignerWithAddress,
    addr6: SignerWithAddress,
    addr7: SignerWithAddress,
    addr8: SignerWithAddress,
    addr9: SignerWithAddress;

  let savingBank: SavingBank;
  let vault: LiquidityVault;
  let token: ERC20Mock;

  const SECONDS_PER_YEAR = 365 * 86400;
  const BASIS_POINTS = 10000;

  const deploy = async () => {
    [
      deployer,
      admin,
      vault1,
      receiver1,
      receiver2,
      addr1,
      addr2,
      addr3,
      addr4,
      addr5,
      addr6,
      addr7,
      addr8,
      addr9,
    ] = await ethers.getSigners();

    // Deploy Mock ERC20 Tokens
    const ERC20MockFactory = await ethers.getContractFactory("ERC20Mock");

    token = (await ERC20MockFactory.deploy()) as ERC20Mock;
    await token.waitForDeployment();

    // deploy LiquidityVault contract
    vault = await (
      await ethers.getContractFactory("LiquidityVault")
    ).deploy(await token.getAddress());

    // deploy Staking contract
    savingBank = await (
      await ethers.getContractFactory("SavingBank")
    ).deploy(await token.getAddress(), vault.getAddress(), receiver1);

    // Mint tokens cho users
    await token.mint(deployer.address, ethers.parseEther("10000"));
    await token.mint(addr1.address, ethers.parseEther("10000"));
    await token.mint(addr2.address, ethers.parseEther("10000"));
    await token.mint(addr3.address, ethers.parseEther("10000"));

    // // Approve pool để stake
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
  };

  enum DepositStatus {
    Active = 0,
    Withdrawn = 1,
    EarlyWithdrawn = 2,
    Renewed = 3,
  }

  const createDefaultPlans = async () => {
    // Plan 1: 7 days, 5% APR
    await savingBank.createPlan(
      7,
      500,
      ethers.parseEther("100"),
      ethers.parseEther("10000"),
      300,
    );

    // Plan 2: 30 days, 8% APR
    await savingBank.createPlan(
      30,
      800,
      ethers.parseEther("100"),
      ethers.parseEther("10000"),
      500,
    );

    // Plan 3: 90 days, 12% APR
    await savingBank.createPlan(90, 1200, ethers.parseEther("100"), 0, 800);
  };

  const fundVault = async (amount: bigint) => {
    await vault.fundVault(amount);
  };

  const openDepositCertificate = async (depositId: bigint, amount: bigint) => {
    await savingBank.connect(addr1).openDepositCertificate(depositId, amount);
  };

  beforeEach(async () => {
    await deploy();
  });

  describe("Deploy", function () {
    it("Should set deployer as owner", async function () {
      expect(await savingBank.owner()).to.equal(deployer.address);
    });

    it("Should set correct vault address", async function () {
      expect(await savingBank.vault()).to.equal(await vault.getAddress());
    });

    it("Should set correct fee receiver", async function () {
      expect(await savingBank.feeReceiver()).to.equal(receiver1.address);
    });

    it("Should set correct token address", async () => {
      expect(await savingBank.token()).to.equal(await token.getAddress());
    });

    it("Should set correct name and symbol NFT", async () => {
      expect(await savingBank.name()).to.equal("Saving Bank Certificate");
      expect(await savingBank.symbol()).to.equal("SBC");
    });

    it("Should set the initial planId and depositId to 1", async function () {
      const planId = await savingBank.nextPlanId();
      const depositId = await savingBank.nextDepositId();
      expect(planId).to.equal(1n);
      expect(depositId).to.equal(1n);
    });

    it("Should deploy saving bank successfully", async () => {
      expect(await savingBank.getAddress()).to.be.properAddress;
    });
  });

  describe("createPlan", function () {
    it("Should revert if invalid input", async function () {
      await expect(
        savingBank.createPlan(
          0,
          500,
          ethers.parseEther("100"),
          ethers.parseEther("10000"),
          300,
        ),
      )
        .to.be.revertedWithCustomError(savingBank, "InvalidTenor")
        .withArgs();

      await expect(
        savingBank.createPlan(
          7,
          0,
          ethers.parseEther("100"),
          ethers.parseEther("10000"),
          300,
        ),
      )
        .to.be.revertedWithCustomError(savingBank, "InvalidAPR")
        .withArgs();

      await expect(
        savingBank.createPlan(
          7,
          500,
          ethers.parseEther("0"),
          ethers.parseEther("10000"),
          300,
        ),
      )
        .to.be.revertedWithCustomError(savingBank, "InvalidMinDeposit")
        .withArgs();

      await expect(
        savingBank.createPlan(
          7,
          500,
          ethers.parseEther("100"),
          ethers.parseEther("10"),
          300,
        ),
      )
        .to.be.revertedWithCustomError(savingBank, "InvalidMaxDeposit")
        .withArgs();

      await expect(
        savingBank.createPlan(
          7,
          500,
          ethers.parseEther("100"),
          ethers.parseEther("10000"),
          0,
        ),
      )
        .to.be.revertedWithCustomError(savingBank, "NotExceed")
        .withArgs();
    });

    it("Should create saving plan", async function () {
      const planId = await savingBank.nextPlanId();
      const tx = await savingBank.createPlan(
        7,
        500,
        ethers.parseEther("100"),
        ethers.parseEther("10000"),
        300,
      );
      await tx.wait();

      const plan = await savingBank.savingPlans(1);
      const nextPlanId = await savingBank.nextPlanId();

      expect(planId).to.equal(1);
      expect(plan.tenorDays).to.equal(7);
      expect(plan.aprBps).to.equal(500);
      expect(plan.minDeposit).to.equal(ethers.parseEther("100"));
      expect(plan.maxDeposit).to.equal(ethers.parseEther("10000"));
      expect(plan.earlyWithdrawPenaltyBps).to.equal(300);
      expect(plan.enabled).to.equal(true);
      expect(nextPlanId).to.equal(2);
    });

    it("Should emit event PlanCreated", async function () {
      const planId = await savingBank.nextPlanId();

      await expect(
        savingBank.createPlan(
          7,
          500,
          ethers.parseEther("100"),
          ethers.parseEther("10000"),
          300,
        ),
      )
        .to.emit(savingBank, "PlanCreated")
        .withArgs(
          planId,
          7,
          500,
          ethers.parseEther("100"),
          ethers.parseEther("10000"),
          300,
        );
    });
  });

  describe("updatePlanStatus", function () {
    beforeEach(async () => {
      await createDefaultPlans();
    });

    it("Should revert if invalid plan id", async function () {
      await expect(savingBank.updatePlanStatus(0, false))
        .to.be.revertedWithCustomError(savingBank, "InvalidPlanId")
        .withArgs();
    });

    it("Should update saving plan status", async function () {
      const tx = await savingBank.updatePlanStatus(1, false);
      await tx.wait();

      const plan = await savingBank.savingPlans(1);

      expect(plan.enabled).to.equal(false);
    });

    it("Should emit event PlanUpdated", async function () {
      await expect(savingBank.updatePlanStatus(1, false))
        .to.emit(savingBank, "PlanUpdated")
        .withArgs(1, false);
    });
  });

  describe("updatePlan", function () {
    beforeEach(async () => {
      await createDefaultPlans();
    });

    it("Should revert if invalid plan id", async function () {
      await expect(
        savingBank.updatePlan(
          0,
          7,
          500,
          ethers.parseEther("100"),
          ethers.parseEther("10000"),
          300,
        ),
      )
        .to.be.revertedWithCustomError(savingBank, "InvalidPlanId")
        .withArgs();
    });

    it("Should revert if invalid input", async function () {
      await expect(
        savingBank.updatePlan(
          1,
          0,
          500,
          ethers.parseEther("100"),
          ethers.parseEther("10000"),
          300,
        ),
      )
        .to.be.revertedWithCustomError(savingBank, "InvalidTenor")
        .withArgs();

      await expect(
        savingBank.updatePlan(
          1,
          7,
          0,
          ethers.parseEther("100"),
          ethers.parseEther("10000"),
          300,
        ),
      )
        .to.be.revertedWithCustomError(savingBank, "InvalidAPR")
        .withArgs();

      await expect(
        savingBank.updatePlan(
          1,
          7,
          500,
          ethers.parseEther("0"),
          ethers.parseEther("10000"),
          300,
        ),
      )
        .to.be.revertedWithCustomError(savingBank, "InvalidMinDeposit")
        .withArgs();

      await expect(
        savingBank.updatePlan(
          1,
          7,
          500,
          ethers.parseEther("100"),
          ethers.parseEther("10"),
          300,
        ),
      )
        .to.be.revertedWithCustomError(savingBank, "InvalidMaxDeposit")
        .withArgs();

      await expect(
        savingBank.updatePlan(
          1,
          7,
          500,
          ethers.parseEther("100"),
          ethers.parseEther("10000"),
          0,
        ),
      )
        .to.be.revertedWithCustomError(savingBank, "NotExceed")
        .withArgs();
    });

    it("Should update plan correct", async function () {
      const tx = await savingBank.updatePlan(
        1,
        30,
        400,
        ethers.parseEther("500"),
        ethers.parseEther("50000"),
        200,
      );
      await tx.wait();

      const plan = await savingBank.savingPlans(1);

      expect(plan.tenorDays).to.equal(30);
      expect(plan.aprBps).to.equal(400);
      expect(plan.minDeposit).to.equal(ethers.parseEther("500"));
      expect(plan.maxDeposit).to.equal(ethers.parseEther("50000"));
      expect(plan.earlyWithdrawPenaltyBps).to.equal(200);
    });

    it("Should emit event PlanUpdated", async function () {
      await expect(
        savingBank.updatePlan(
          1,
          30,
          400,
          ethers.parseEther("500"),
          ethers.parseEther("50000"),
          200,
        ),
      )
        .to.emit(savingBank, "PlanUpdated")
        .withArgs(1, true);
    });
  });

  describe("openDepositCertificate", function () {
    beforeEach(async () => {
      await createDefaultPlans();
      await fundVault(ethers.parseEther("1000"));
    });

    it("Should revert if plan not enable", async function () {
      await savingBank.updatePlanStatus(1, false);

      await expect(
        savingBank
          .connect(addr1)
          .openDepositCertificate(1, ethers.parseEther("100")),
      )
        .to.be.revertedWithCustomError(savingBank, "NotEnabledPlan")
        .withArgs();
    });

    it("Should revert if invalid amount", async function () {
      await expect(
        savingBank
          .connect(addr1)
          .openDepositCertificate(1, ethers.parseEther("0")),
      )
        .to.be.revertedWithCustomError(savingBank, "InvalidAmount")
        .withArgs();
    });

    it("Should open deposit certificate for user", async function () {
      const depositId = 1;

      const tx = await savingBank
        .connect(addr1)
        .openDepositCertificate(1, ethers.parseEther("100"));

      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt!.blockNumber);
      const txTimestamp = block!.timestamp;
      const maturity = txTimestamp + 7 * 86400;

      const deposit = await savingBank.depositCertificates(depositId);
      const nextDepositId = await savingBank.nextDepositId();
      let userDepositIds: bigint[] = await savingBank.getUserDepositIds(
        addr1.address,
      );

      expect(deposit.owner).to.equal(addr1.address);
      expect(deposit.planId).to.equal(1);
      expect(deposit.principal).to.equal(ethers.parseEther("100"));
      expect(deposit.startAt).to.equal(txTimestamp);
      expect(deposit.maturityAt).to.equal(maturity);
      expect(deposit.status).to.equal(DepositStatus.Active);
      expect(deposit.renewedDepositId).to.equal(0);
      expect(nextDepositId).to.equal(2);
      expect(userDepositIds).to.deep.equal([depositId]);
      expect(await savingBank.ownerOf(depositId)).to.equal(addr1.address);
    });

    it("Should emit event DepositCertificateOpened", async function () {
      const depositId = await savingBank.nextDepositId();

      const tx = await savingBank
        .connect(addr1)
        .openDepositCertificate(1, ethers.parseEther("100"));

      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt!.blockNumber);
      const txTimestamp = block!.timestamp;

      const maturity = txTimestamp + 7 * 86400;

      await expect(tx)
        .to.emit(savingBank, "DepositCertificateOpened")
        .withArgs(
          depositId,
          addr1.address,
          1,
          ethers.parseEther("100"),
          maturity,
        );
    });
  });

  describe("withdraw", function () {
    beforeEach(async () => {
      await createDefaultPlans();
      await fundVault(ethers.parseEther("1000"));
      await openDepositCertificate(1n, ethers.parseEther("100"));
    });

    it("Should revert if not owner deposit certificate", async function () {
      await expect(savingBank.connect(addr2).withdraw(1))
        .to.be.revertedWithCustomError(savingBank, "NotOwner")
        .withArgs();
    });

    it("Should revert if deposit not active", async function () {
      await time.increase(7 * 24 * 60 * 60);

      await savingBank.connect(addr1).withdraw(1);

      await expect(savingBank.connect(addr1).withdraw(1))
        .to.be.revertedWithCustomError(savingBank, "NotActiveDeposit")
        .withArgs();
    });

    it("Should revert if not matured yet", async function () {
      await expect(savingBank.connect(addr1).withdraw(1))
        .to.be.revertedWithCustomError(savingBank, "NotMaturedYet")
        .withArgs();
    });

    it("Should withdraw principal and interest", async function () {
      await time.increase(7 * 24 * 60 * 60);

      const balanceBefore = await token.balanceOf(addr1.address);
      const nftBalanceBefore = await savingBank.balanceOf(addr1.address);

      const depositId = 1;
      const tx = await savingBank.connect(addr1).withdraw(depositId);
      await tx.wait();

      const deposit = await savingBank.depositCertificates(depositId);
      const interest = await savingBank.getCalculateInterest(depositId);
      const balanceAfter = await token.balanceOf(addr1.address);
      const nftBalanceAfter = await savingBank.balanceOf(addr1.address);

      expect(deposit.status).to.equal(DepositStatus.Withdrawn);
      expect(balanceAfter - balanceBefore).to.equal(
        interest + deposit.principal,
      );
      expect(nftBalanceAfter).to.equal(nftBalanceBefore - 1n);
    });

    it("Should emit event Withdrawn", async function () {
      await time.increase(7 * 24 * 60 * 60);

      const depositId = 1;

      const tx = await savingBank.connect(addr1).withdraw(1);
      const deposit = await savingBank.depositCertificates(depositId);
      const interest = await savingBank.getCalculateInterest(depositId);

      await expect(tx)
        .to.emit(savingBank, "Withdrawn")
        .withArgs(
          1,
          addr1.address,
          deposit.principal,
          interest,
          DepositStatus.Withdrawn,
        );
    });
  });

  describe("earlyWithdraw", function () {
    beforeEach(async () => {
      await createDefaultPlans();
      await fundVault(ethers.parseEther("1000"));
      await openDepositCertificate(1n, ethers.parseEther("100"));
    });

    it("Should revert if not owner", async function () {
      await expect(savingBank.connect(addr2).earlyWithdraw(1))
        .to.be.revertedWithCustomError(savingBank, "NotOwner")
        .withArgs();
    });

    it("Should revert if deposit not active", async function () {
      await savingBank.connect(addr1).earlyWithdraw(1);

      await expect(savingBank.connect(addr1).earlyWithdraw(1))
        .to.be.revertedWithCustomError(savingBank, "NotActiveDeposit")
        .withArgs();
    });

    it("Should revert if already matured", async function () {
      await time.increase(7 * 24 * 60 * 60);

      await expect(savingBank.connect(addr1).earlyWithdraw(1))
        .to.be.revertedWithCustomError(savingBank, "AlreadyMatured")
        .withArgs();
    });

    it("Should early withdraw with penalty", async function () {
      const depositId = 1;
      const deposit = await savingBank.depositCertificates(depositId);
      const penalty = (deposit.principal * 300n) / 10000n; // 3% penalty

      const userBalanceBefore = await token.balanceOf(addr1.address);
      const feeReceiverBalanceBefore = await token.balanceOf(receiver1.address);
      const nftBalanceBefore = await savingBank.balanceOf(addr1.address);

      await savingBank.connect(addr1).earlyWithdraw(depositId);

      const userBalanceAfter = await token.balanceOf(addr1.address);
      const feeReceiverBalanceAfter = await token.balanceOf(receiver1.address);
      const nftBalanceAfter = await savingBank.balanceOf(addr1.address);
      const updatedDeposit = await savingBank.depositCertificates(depositId);

      expect(updatedDeposit.status).to.equal(DepositStatus.EarlyWithdrawn);
      expect(userBalanceAfter - userBalanceBefore).to.equal(
        deposit.principal - penalty,
      );
      expect(feeReceiverBalanceAfter - feeReceiverBalanceBefore).to.equal(
        penalty,
      );
      expect(nftBalanceAfter).to.equal(nftBalanceBefore - 1n);
    });

    it("Should emit EarlyWithdrawn event", async function () {
      const depositId = 1;
      const deposit = await savingBank.depositCertificates(depositId);
      const penalty = (deposit.principal * 300n) / 10000n;

      await expect(savingBank.connect(addr1).earlyWithdraw(depositId))
        .to.emit(savingBank, "EarlyWithdrawn")
        .withArgs(
          depositId,
          addr1.address,
          deposit.principal - penalty,
          penalty,
          DepositStatus.EarlyWithdrawn,
        );
    });
  });
});
