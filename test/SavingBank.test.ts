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
    addr5: SignerWithAddress;

  let savingBank: SavingBank;
  let vault: LiquidityVault;
  let token: ERC20Mock;

  const SECONDS_PER_YEAR = 365 * 86400;
  const BASIS_POINTS = 10000;

  enum DepositStatus {
    Active = 0,
    Withdrawn = 1,
    EarlyWithdrawn = 2,
    Renewed = 3,
  }

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
    ] = await ethers.getSigners();

    // Deploy Mock ERC20 Token
    const ERC20MockFactory = await ethers.getContractFactory("ERC20Mock");
    token = await ERC20MockFactory.deploy();
    await token.waitForDeployment();

    // Deploy LiquidityVault contract
    vault = await (
      await ethers.getContractFactory("LiquidityVault")
    ).deploy(await token.getAddress());
    await vault.waitForDeployment();

    // Deploy SavingBank contract
    savingBank = await (
      await ethers.getContractFactory("SavingBank")
    ).deploy(await token.getAddress(), await vault.getAddress(), receiver1.address);
    await savingBank.waitForDeployment();

    // Mint tokens to users
    await token.mint(deployer.address, ethers.parseEther("100000"));
    await token.mint(addr1.address, ethers.parseEther("10000"));
    await token.mint(addr2.address, ethers.parseEther("10000"));
    await token.mint(addr3.address, ethers.parseEther("10000"));

    // Approve SavingBank and Vault to transfer tokens
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

  beforeEach(async () => {
    await deploy();
  });

  describe("Deployment", function () {
    it("Should revert if token address is zero", async () => {
      const SavingBankFactory = await ethers.getContractFactory("SavingBank");
      await expect(
        SavingBankFactory.deploy(
          ethers.ZeroAddress,
          await vault.getAddress(),
          receiver1.address
        )
      ).to.be.revertedWithCustomError(savingBank, "InvalidToken");
    });

    it("Should revert if vault address is zero", async () => {
      const SavingBankFactory = await ethers.getContractFactory("SavingBank");
      await expect(
        SavingBankFactory.deploy(
          await token.getAddress(),
          ethers.ZeroAddress,
          receiver1.address
        )
      ).to.be.revertedWithCustomError(savingBank, "InvalidVault");
    });

    it("Should revert if fee receiver address is zero", async () => {
      const SavingBankFactory = await ethers.getContractFactory("SavingBank");
      await expect(
        SavingBankFactory.deploy(
          await token.getAddress(),
          await vault.getAddress(),
          ethers.ZeroAddress
        )
      ).to.be.revertedWithCustomError(savingBank, "InvalidToken");
    });

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

    it("Should set correct name and symbol for NFT", async () => {
      expect(await savingBank.name()).to.equal("Saving Bank Certificate");
      expect(await savingBank.symbol()).to.equal("SBC");
    });

    it("Should initialize planId and depositId to 1", async function () {
      expect(await savingBank.nextPlanId()).to.equal(1);
      expect(await savingBank.nextDepositId()).to.equal(1);
    });

    it("Should deploy saving bank successfully", async () => {
      expect(await savingBank.getAddress()).to.be.properAddress;
    });
  });

  describe("Plan Management - createPlan", function () {
    it("Should revert if tenor is zero", async function () {
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
    });

    it("Should revert if APR is zero", async function () {
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
    });

    it("Should revert if minDeposit is zero", async function () {
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
    });

    it("Should revert if maxDeposit < minDeposit", async function () {
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
    });

    it("Should revert if penalty is zero", async function () {
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

    it("Should revert if penalty > BASIS_POINTS", async function () {
      await expect(
        savingBank.createPlan(
          7,
          500,
          ethers.parseEther("100"),
          ethers.parseEther("10000"),
          10001,
        ),
      )
        .to.be.revertedWithCustomError(savingBank, "NotExceed")
        .withArgs();
    });

    it("Should revert if not owner", async function () {
      await expect(
        savingBank
          .connect(addr1)
          .createPlan(
            7,
            500,
            ethers.parseEther("100"),
            ethers.parseEther("10000"),
            300,
          ),
      ).to.be.revertedWithCustomError(savingBank, "OwnableUnauthorizedAccount");
    });

    it("Should create plan successfully", async function () {
      const planId = await savingBank.nextPlanId();
      
      await savingBank.createPlan(
        7,
        500,
        ethers.parseEther("100"),
        ethers.parseEther("10000"),
        300,
      );

      const plan = await savingBank.savingPlans(planId);
      const nextPlanId = await savingBank.nextPlanId();

      expect(plan.tenorDays).to.equal(7);
      expect(plan.aprBps).to.equal(500);
      expect(plan.minDeposit).to.equal(ethers.parseEther("100"));
      expect(plan.maxDeposit).to.equal(ethers.parseEther("10000"));
      expect(plan.earlyWithdrawPenaltyBps).to.equal(300);
      expect(plan.enabled).to.equal(true);
      expect(nextPlanId).to.equal(planId + 1n);
    });

    it("Should create plan with maxDeposit = 0 (unlimited)", async function () {
      await savingBank.createPlan(
        7,
        500,
        ethers.parseEther("100"),
        0,
        300,
      );

      const plan = await savingBank.savingPlans(1);
      expect(plan.maxDeposit).to.equal(0);
    });

    it("Should emit PlanCreated event", async function () {
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

    it("Should create multiple plans", async function () {
      await createDefaultPlans();

      expect(await savingBank.nextPlanId()).to.equal(4);
      
      const plan1 = await savingBank.savingPlans(1);
      const plan2 = await savingBank.savingPlans(2);
      const plan3 = await savingBank.savingPlans(3);

      expect(plan1.tenorDays).to.equal(7);
      expect(plan2.tenorDays).to.equal(30);
      expect(plan3.tenorDays).to.equal(90);
    });
  });

  describe("Plan Management - updatePlanStatus", function () {
    beforeEach(async () => {
      await createDefaultPlans();
    });

    it("Should revert if not owner", async function () {
      await expect(
        savingBank.connect(addr1).updatePlanStatus(1, false)
      ).to.be.revertedWithCustomError(savingBank, "OwnableUnauthorizedAccount");
    });

    it("Should revert if invalid plan id (zero)", async function () {
      await expect(savingBank.updatePlanStatus(0, false))
        .to.be.revertedWithCustomError(savingBank, "InvalidPlanId")
        .withArgs();
    });

    it("Should revert if invalid plan id (too high)", async function () {
      await expect(savingBank.updatePlanStatus(999, false))
        .to.be.revertedWithCustomError(savingBank, "InvalidPlanId")
        .withArgs();
    });

    it("Should update plan status to disabled", async function () {
      await savingBank.updatePlanStatus(1, false);

      const plan = await savingBank.savingPlans(1);
      expect(plan.enabled).to.equal(false);
    });

    it("Should update plan status to enabled", async function () {
      await savingBank.updatePlanStatus(1, false);
      await savingBank.updatePlanStatus(1, true);

      const plan = await savingBank.savingPlans(1);
      expect(plan.enabled).to.equal(true);
    });

    it("Should emit PlanUpdated event", async function () {
      await expect(savingBank.updatePlanStatus(1, false))
        .to.emit(savingBank, "PlanUpdated")
        .withArgs(1, false);
    });
  });

  describe("Plan Management - updatePlan", function () {
    beforeEach(async () => {
      await createDefaultPlans();
    });

    it("Should revert if not owner", async function () {
      await expect(
        savingBank
          .connect(addr1)
          .updatePlan(
            1,
            14,
            600,
            ethers.parseEther("200"),
            ethers.parseEther("20000"),
            400,
          ),
      ).to.be.revertedWithCustomError(savingBank, "OwnableUnauthorizedAccount");
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

    it("Should revert if invalid tenor", async function () {
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
    });

    it("Should revert if invalid APR", async function () {
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
    });

    it("Should revert if invalid minDeposit", async function () {
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
    });

    it("Should revert if invalid maxDeposit", async function () {
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
    });

    it("Should revert if invalid penalty", async function () {
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

    it("Should update plan successfully", async function () {
      await savingBank.updatePlan(
        1,
        30,
        400,
        ethers.parseEther("500"),
        ethers.parseEther("50000"),
        200,
      );

      const plan = await savingBank.savingPlans(1);

      expect(plan.tenorDays).to.equal(30);
      expect(plan.aprBps).to.equal(400);
      expect(plan.minDeposit).to.equal(ethers.parseEther("500"));
      expect(plan.maxDeposit).to.equal(ethers.parseEther("50000"));
      expect(plan.earlyWithdrawPenaltyBps).to.equal(200);
    });

    it("Should emit PlanUpdated event", async function () {
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

    it("Should keep enabled status after update", async function () {
      await savingBank.updatePlanStatus(1, false);
      
      await savingBank.updatePlan(
        1,
        30,
        400,
        ethers.parseEther("500"),
        ethers.parseEther("50000"),
        200,
      );

      const plan = await savingBank.savingPlans(1);
      expect(plan.enabled).to.equal(false);
    });
  });

  describe("Admin Functions - setVault", function () {
    it("Should revert if not owner", async function () {
      await expect(
        savingBank.connect(addr1).setVault(vault1.address)
      ).to.be.revertedWithCustomError(savingBank, "OwnableUnauthorizedAccount");
    });

    it("Should revert if address is zero", async function () {
      await expect(
        savingBank.setVault(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(savingBank, "InvalidVault");
    });

    it("Should update vault address", async function () {
      await savingBank.setVault(vault1.address);
      expect(await savingBank.vault()).to.equal(vault1.address);
    });

    it("Should emit VaultUpdated event", async function () {
      await expect(savingBank.setVault(vault1.address))
        .to.emit(savingBank, "VaultUpdated")
        .withArgs(vault1.address);
    });
  });

  describe("Admin Functions - setFeeReceiver", function () {
    it("Should revert if not owner", async function () {
      await expect(
        savingBank.connect(addr1).setFeeReceiver(receiver2.address)
      ).to.be.revertedWithCustomError(savingBank, "OwnableUnauthorizedAccount");
    });

    it("Should revert if address is zero", async function () {
      await expect(
        savingBank.setFeeReceiver(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(savingBank, "InvalidAddress");
    });

    it("Should update fee receiver", async function () {
      await savingBank.setFeeReceiver(receiver2.address);
      expect(await savingBank.feeReceiver()).to.equal(receiver2.address);
    });

    it("Should emit FeeReceiverUpdated event", async function () {
      await expect(savingBank.setFeeReceiver(receiver2.address))
        .to.emit(savingBank, "FeeReceiverUpdated")
        .withArgs(receiver2.address);
    });
  });

  describe("Admin Functions - Pause/Unpause", function () {
    it("Should revert if non-owner tries to pause", async () => {
      await expect(
        savingBank.connect(addr1).pause()
      ).to.be.revertedWithCustomError(savingBank, "OwnableUnauthorizedAccount");
    });

    it("Should revert if non-owner tries to unpause", async () => {
      await savingBank.pause();
      await expect(
        savingBank.connect(addr1).unpause()
      ).to.be.revertedWithCustomError(savingBank, "OwnableUnauthorizedAccount");
    });

    it("Should pause successfully", async () => {
      await savingBank.pause();
      expect(await savingBank.paused()).to.equal(true);
    });

    it("Should unpause successfully", async () => {
      await savingBank.pause();
      await savingBank.unpause();
      expect(await savingBank.paused()).to.equal(false);
    });

    it("Should emit Paused event", async () => {
      await expect(savingBank.pause())
        .to.emit(savingBank, "Paused")
        .withArgs(deployer.address);
    });

    it("Should emit Unpaused event", async () => {
      await savingBank.pause();
      await expect(savingBank.unpause())
        .to.emit(savingBank, "Unpaused")
        .withArgs(deployer.address);
    });
  });

  describe("openDepositCertificate", function () {
    beforeEach(async () => {
      await createDefaultPlans();
      await vault.fundVault(ethers.parseEther("10000"));
    });

    it("Should revert if plan not enabled", async function () {
      await savingBank.updatePlanStatus(1, false);

      await expect(
        savingBank
          .connect(addr1)
          .openDepositCertificate(1, ethers.parseEther("100")),
      )
        .to.be.revertedWithCustomError(savingBank, "NotEnabledPlan")
        .withArgs();
    });

    it("Should revert if amount < minDeposit", async function () {
      await expect(
        savingBank
          .connect(addr1)
          .openDepositCertificate(1, ethers.parseEther("50")),
      )
        .to.be.revertedWithCustomError(savingBank, "InvalidAmount")
        .withArgs();
    });

    it("Should revert if amount > maxDeposit", async function () {
      await expect(
        savingBank
          .connect(addr1)
          .openDepositCertificate(1, ethers.parseEther("20000")),
      )
        .to.be.revertedWithCustomError(savingBank, "InvalidAmount")
        .withArgs();
    });

    it("Should revert when paused", async function () {
      await savingBank.pause();
      await expect(
        savingBank
          .connect(addr1)
          .openDepositCertificate(1, ethers.parseEther("100")),
      ).to.be.revertedWithCustomError(savingBank, "EnforcedPause");
    });

    it("Should open deposit certificate successfully", async function () {
      const depositId = await savingBank.nextDepositId();
      const amount = ethers.parseEther("100");

      const tx = await savingBank
        .connect(addr1)
        .openDepositCertificate(1, amount);

      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt!.blockNumber);
      const txTimestamp = block!.timestamp;
      const maturity = txTimestamp + 7 * 86400;

      const deposit = await savingBank.depositCertificates(depositId);
      const nextDepositId = await savingBank.nextDepositId();
      const userDepositIds = await savingBank.getUserDepositIds(addr1.address);

      expect(deposit.owner).to.equal(addr1.address);
      expect(deposit.planId).to.equal(1);
      expect(deposit.principal).to.equal(amount);
      expect(deposit.startAt).to.equal(txTimestamp);
      expect(deposit.maturityAt).to.equal(maturity);
      expect(deposit.status).to.equal(DepositStatus.Active);
      expect(deposit.renewedDepositId).to.equal(0);
      expect(deposit.snapshotAprBps).to.equal(500);
      expect(deposit.snapshotTenorDays).to.equal(7);
      expect(deposit.snapshotEarlyWithdrawPenaltyBps).to.equal(300);
      expect(nextDepositId).to.equal(depositId + 1n);
      expect(userDepositIds).to.deep.equal([depositId]);
      expect(await savingBank.ownerOf(depositId)).to.equal(addr1.address);
    });

    it("Should transfer tokens from user to contract", async function () {
      const amount = ethers.parseEther("100");
      const balanceBefore = await token.balanceOf(addr1.address);
      const contractBalanceBefore = await token.balanceOf(await savingBank.getAddress());

      await savingBank.connect(addr1).openDepositCertificate(1, amount);

      const balanceAfter = await token.balanceOf(addr1.address);
      const contractBalanceAfter = await token.balanceOf(await savingBank.getAddress());

      expect(balanceBefore - balanceAfter).to.equal(amount);
      expect(contractBalanceAfter - contractBalanceBefore).to.equal(amount);
    });

    it("Should mint NFT to user", async function () {
      const depositId = await savingBank.nextDepositId();
      const nftBalanceBefore = await savingBank.balanceOf(addr1.address);

      await savingBank
        .connect(addr1)
        .openDepositCertificate(1, ethers.parseEther("100"));

      const nftBalanceAfter = await savingBank.balanceOf(addr1.address);

      expect(nftBalanceAfter).to.equal(nftBalanceBefore + 1n);
      expect(await savingBank.ownerOf(depositId)).to.equal(addr1.address);
    });

    it("Should emit DepositCertificateOpened event", async function () {
      const depositId = await savingBank.nextDepositId();
      const amount = ethers.parseEther("100");

      const tx = await savingBank
        .connect(addr1)
        .openDepositCertificate(1, amount);

      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt!.blockNumber);
      const txTimestamp = block!.timestamp;
      const maturity = txTimestamp + 7 * 86400;

      await expect(tx)
        .to.emit(savingBank, "DepositCertificateOpened")
        .withArgs(depositId, addr1.address, 1, amount, maturity);
    });

    it("Should allow multiple deposits from same user", async function () {
      await savingBank
        .connect(addr1)
        .openDepositCertificate(1, ethers.parseEther("100"));
      
      await savingBank
        .connect(addr1)
        .openDepositCertificate(2, ethers.parseEther("200"));

      const userDepositIds = await savingBank.getUserDepositIds(addr1.address);
      expect(userDepositIds.length).to.equal(2);
      expect(await savingBank.balanceOf(addr1.address)).to.equal(2);
    });

    it("Should handle plan with unlimited maxDeposit", async function () {
      await savingBank
        .connect(addr1)
        .openDepositCertificate(3, ethers.parseEther("10000"));

      const deposit = await savingBank.depositCertificates(1);
      expect(deposit.principal).to.equal(ethers.parseEther("10000"));
    });

    it("Should snapshot plan data correctly", async function () {
      const depositId = await savingBank.nextDepositId();
      
      await savingBank
        .connect(addr1)
        .openDepositCertificate(1, ethers.parseEther("100"));

      // Update plan after opening deposit
      await savingBank.updatePlan(
        1,
        14,
        1000,
        ethers.parseEther("50"),
        ethers.parseEther("5000"),
        500,
      );

      const deposit = await savingBank.depositCertificates(depositId);
      const updatedPlan = await savingBank.savingPlans(1);

      // Deposit should have old values
      expect(deposit.snapshotAprBps).to.equal(500);
      expect(deposit.snapshotTenorDays).to.equal(7);
      expect(deposit.snapshotEarlyWithdrawPenaltyBps).to.equal(300);

      // Plan should have new values
      expect(updatedPlan.aprBps).to.equal(1000);
      expect(updatedPlan.tenorDays).to.equal(14);
      expect(updatedPlan.earlyWithdrawPenaltyBps).to.equal(500);
    });
  });

  describe("withdraw", function () {
    beforeEach(async () => {
      await createDefaultPlans();
      await vault.fundVault(ethers.parseEther("10000"));
      await savingBank
        .connect(addr1)
        .openDepositCertificate(1, ethers.parseEther("1000"));
    });

    it("Should revert if not owner", async function () {
      await time.increase(7 * 24 * 60 * 60);
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

    it("Should withdraw principal and interest successfully", async function () {
      await time.increase(7 * 24 * 60 * 60);

      const depositId = 1;
      const deposit = await savingBank.depositCertificates(depositId);
      const interest = await savingBank.getCalculateInterest(depositId);
      
      const userBalanceBefore = await token.balanceOf(addr1.address);
      const nftBalanceBefore = await savingBank.balanceOf(addr1.address);

      await savingBank.connect(addr1).withdraw(depositId);

      const userBalanceAfter = await token.balanceOf(addr1.address);
      const nftBalanceAfter = await savingBank.balanceOf(addr1.address);
      const updatedDeposit = await savingBank.depositCertificates(depositId);

      expect(updatedDeposit.status).to.equal(DepositStatus.Withdrawn);
      expect(userBalanceAfter - userBalanceBefore).to.equal(
        deposit.principal + interest,
      );
      expect(nftBalanceAfter).to.equal(nftBalanceBefore - 1n);
    });

    it("Should burn NFT after withdrawal", async function () {
      await time.increase(7 * 24 * 60 * 60);
      const depositId = 1;

      await savingBank.connect(addr1).withdraw(depositId);

      await expect(savingBank.ownerOf(depositId)).to.be.revertedWithCustomError(
        savingBank,
        "ERC721NonexistentToken"
      );
    });

    it("Should emit Withdrawn event", async function () {
      await time.increase(7 * 24 * 60 * 60);

      const depositId = 1;
      const deposit = await savingBank.depositCertificates(depositId);
      const interest = await savingBank.getCalculateInterest(depositId);

      await expect(savingBank.connect(addr1).withdraw(depositId))
        .to.emit(savingBank, "Withdrawn")
        .withArgs(
          depositId,
          addr1.address,
          deposit.principal,
          interest,
          DepositStatus.Withdrawn,
        );
    });

    it("Should calculate interest correctly for 7-day plan", async function () {
      await time.increase(7 * 24 * 60 * 60);

      const depositId = 1;
      const deposit = await savingBank.depositCertificates(depositId);
      const interest = await savingBank.getCalculateInterest(depositId);

      // Expected: (1000 * 500 * 7 days) / (365 days * 10000) ≈ 0.9589 tokens
      const expectedInterest =
        (deposit.principal * 500n * 7n * 86400n) / (365n * 86400n * 10000n);

      expect(interest).to.equal(expectedInterest);
    });

    it("Should allow withdrawal exactly at maturity", async function () {
      const deposit = await savingBank.depositCertificates(1);
      const timeToMaturity = Number(deposit.maturityAt - BigInt(await time.latest()));
      
      await time.increase(timeToMaturity);

      await expect(savingBank.connect(addr1).withdraw(1)).to.not.be.reverted;
    });

    it("Should allow withdrawal after maturity", async function () {
      await time.increase(14 * 24 * 60 * 60); // Double the maturity period

      await expect(savingBank.connect(addr1).withdraw(1)).to.not.be.reverted;
    });
  });

  describe("earlyWithdraw", function () {
    beforeEach(async () => {
      await createDefaultPlans();
      await vault.fundVault(ethers.parseEther("10000"));
      await savingBank
        .connect(addr1)
        .openDepositCertificate(1, ethers.parseEther("1000"));
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
      expect(feeReceiverBalanceAfter - feeReceiverBalanceBefore).to.equal(penalty);
      expect(nftBalanceAfter).to.equal(nftBalanceBefore - 1n);
    });

    it("Should burn NFT after early withdrawal", async function () {
      const depositId = 1;

      await savingBank.connect(addr1).earlyWithdraw(depositId);

      await expect(savingBank.ownerOf(depositId)).to.be.revertedWithCustomError(
        savingBank,
        "ERC721NonexistentToken"
      );
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

    it("Should calculate penalty based on snapshot data", async function () {
      const depositId = 1;
      const deposit = await savingBank.depositCertificates(depositId);
      
      // Update plan after opening (should not affect existing deposit)
      await savingBank.updatePlan(
        1,
        7,
        500,
        ethers.parseEther("100"),
        ethers.parseEther("10000"),
        1000, // 10% penalty
      );

      const penalty = (deposit.principal * 300n) / 10000n; // Should still be 3%
      const userBalanceBefore = await token.balanceOf(addr1.address);

      await savingBank.connect(addr1).earlyWithdraw(depositId);

      const userBalanceAfter = await token.balanceOf(addr1.address);
      expect(userBalanceAfter - userBalanceBefore).to.equal(
        deposit.principal - penalty,
      );
    });
  });

});