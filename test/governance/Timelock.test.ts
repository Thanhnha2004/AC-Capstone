import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SavingBankTimelock } from "../../typechain";

describe("SavingBankTimelock Tests", function () {
  // Signers
  let admin: SignerWithAddress;
  let proposer: SignerWithAddress;
  let executor: SignerWithAddress;
  let canceller: SignerWithAddress;
  let user: SignerWithAddress;

  // Contract instance with TypeChain type
  let timelock: SavingBankTimelock;
  let mockTarget: string;

  // Constants
  const MIN_DELAY = 2n * 24n * 60n * 60n; // 2 days in seconds

  /**
   * Deploy fixture for testing
   */
  async function deployTimelockFixture() {
    [admin, proposer, executor, canceller, user] = await ethers.getSigners();

    // Deploy Timelock
    const TimelockFactory = await ethers.getContractFactory("SavingBankTimelock");
    
    const timelockContract = await TimelockFactory.deploy(
      [proposer.address],
      [executor.address],
      admin.address
    );

    await timelockContract.waitForDeployment();
    
    timelock = await ethers.getContractAt(
      "SavingBankTimelock",
      await timelockContract.getAddress()
    ) as SavingBankTimelock;

    // Grant CANCELLER_ROLE
    const CANCELLER_ROLE = await timelock.CANCELLER_ROLE();
    await timelock.connect(admin).grantRole(CANCELLER_ROLE, canceller.address);

    // Use simple address as mock target
    mockTarget = user.address;

    return {
      timelock,
      mockTarget,
      admin,
      proposer,
      executor,
      canceller,
      user,
    };
  }

  describe("Deployment", function () {
    it("Should set correct min delay", async function () {
      const { timelock } = await loadFixture(deployTimelockFixture);
      
      expect(await timelock.getMinDelay()).to.equal(MIN_DELAY);
    });

    it("Should grant proposer role", async function () {
      const { timelock, proposer } = await loadFixture(deployTimelockFixture);
      
      const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
      expect(await timelock.hasRole(PROPOSER_ROLE, proposer.address)).to.be.true;
      expect(await timelock.isProposer(proposer.address)).to.be.true;
    });

    it("Should grant executor role", async function () {
      const { timelock, executor } = await loadFixture(deployTimelockFixture);
      
      const EXECUTOR_ROLE = await timelock.EXECUTOR_ROLE();
      expect(await timelock.hasRole(EXECUTOR_ROLE, executor.address)).to.be.true;
      expect(await timelock.isExecutor(executor.address)).to.be.true;
    });

    it("Should grant admin role", async function () {
      const { timelock, admin } = await loadFixture(deployTimelockFixture);
      
      const ADMIN_ROLE = await timelock.DEFAULT_ADMIN_ROLE();
      expect(await timelock.hasRole(ADMIN_ROLE, admin.address)).to.be.true;
    });

    it("Should grant canceller role", async function () {
      const { timelock, canceller } = await loadFixture(deployTimelockFixture);
      
      const CANCELLER_ROLE = await timelock.CANCELLER_ROLE();
      expect(await timelock.hasRole(CANCELLER_ROLE, canceller.address)).to.be.true;
      expect(await timelock.isCanceller(canceller.address)).to.be.true;
    });

    it("Should emit TimelockDeployed event", async function () {
      const [admin, proposer, executor] = await ethers.getSigners();
      const TimelockFactory = await ethers.getContractFactory("SavingBankTimelock");
      
      await expect(
        TimelockFactory.deploy(
          [proposer.address],
          [executor.address],
          admin.address
        )
      ).to.emit(TimelockFactory, "TimelockDeployed");
    });

    it("Should return correct MIN_DELAY constant", async function () {
      const { timelock } = await loadFixture(deployTimelockFixture);
      
      expect(await timelock.MIN_DELAY()).to.equal(MIN_DELAY);
    });
  });

  describe("Schedule Operation", function () {
    it("Should allow proposer to schedule operation", async function () {
      const { timelock, mockTarget, proposer } = await loadFixture(deployTimelockFixture);

      const calldata = "0x12345678";
      const operationHash = await timelock.hashOperation(
        mockTarget,
        0n,
        calldata,
        ethers.ZeroHash,
        ethers.id("test-schedule")
      );

      await expect(
        timelock.connect(proposer).schedule(
          mockTarget,
          0n,
          calldata,
          ethers.ZeroHash,
          ethers.id("test-schedule"),
          MIN_DELAY
        )
      ).to.not.be.reverted;

      expect(await timelock.isOperationPending(operationHash)).to.be.true;
    });

    it("Should revert if non-proposer tries to schedule", async function () {
      const { timelock, mockTarget, user } = await loadFixture(deployTimelockFixture);

      await expect(
        timelock.connect(user).schedule(
          mockTarget,
          0n,
          "0x",
          ethers.ZeroHash,
          ethers.id("test"),
          MIN_DELAY
        )
      ).to.be.reverted;
    });

    it("Should revert if delay is less than minimum", async function () {
      const { timelock, mockTarget, proposer } = await loadFixture(deployTimelockFixture);

      await expect(
        timelock.connect(proposer).schedule(
          mockTarget,
          0n,
          "0x",
          ethers.ZeroHash,
          ethers.id("test"),
          MIN_DELAY - 1n
        )
      ).to.be.reverted;
    });

    it("Should emit CallScheduled event", async function () {
      const { timelock, mockTarget, proposer } = await loadFixture(deployTimelockFixture);

      await expect(
        timelock.connect(proposer).schedule(
          mockTarget,
          0n,
          "0x",
          ethers.ZeroHash,
          ethers.id("test"),
          MIN_DELAY
        )
      ).to.emit(timelock, "CallScheduled");
    });

    it("Should not allow scheduling same operation twice", async function () {
      const { timelock, mockTarget, proposer } = await loadFixture(deployTimelockFixture);

      const salt = ethers.id("duplicate-test");

      await timelock.connect(proposer).schedule(
        mockTarget,
        0n,
        "0x",
        ethers.ZeroHash,
        salt,
        MIN_DELAY
      );

      await expect(
        timelock.connect(proposer).schedule(
          mockTarget,
          0n,
          "0x",
          ethers.ZeroHash,
          salt,
          MIN_DELAY
        )
      ).to.be.reverted;
    });

    it("Should store correct timestamp for operation", async function () {
      const { timelock, mockTarget, proposer } = await loadFixture(deployTimelockFixture);

      const blockBefore = await ethers.provider.getBlock("latest");
      const expectedTimestamp = blockBefore!.timestamp + Number(MIN_DELAY);

      const salt = ethers.id("timestamp-test");
      await timelock.connect(proposer).schedule(
        mockTarget,
        0n,
        "0x",
        ethers.ZeroHash,
        salt,
        MIN_DELAY
      );

      const operationHash = await timelock.hashOperation(
        mockTarget,
        0n,
        "0x",
        ethers.ZeroHash,
        salt
      );

      const actualTimestamp = await timelock.getTimestamp(operationHash);
      expect(actualTimestamp).to.be.closeTo(expectedTimestamp, 5);
    });
  });

  describe("Execute Operation", function () {
    it("Should not allow execution before delay", async function () {
      const { timelock, mockTarget, proposer, executor } = await loadFixture(deployTimelockFixture);

      const salt = ethers.id("execute-early");
      await timelock.connect(proposer).schedule(
        mockTarget,
        0n,
        "0x",
        ethers.ZeroHash,
        salt,
        MIN_DELAY
      );

      await expect(
        timelock.connect(executor).execute(
          mockTarget,
          0n,
          "0x",
          ethers.ZeroHash,
          salt
        )
      ).to.be.reverted;
    });

    it("Should allow execution after delay", async function () {
      const { timelock, mockTarget, proposer, executor } = await loadFixture(deployTimelockFixture);

      const salt = ethers.id("execute-after");
      await timelock.connect(proposer).schedule(
        mockTarget,
        0n,
        "0x",
        ethers.ZeroHash,
        salt,
        MIN_DELAY
      );

      await time.increase(MIN_DELAY);

      const operationHash = await timelock.hashOperation(
        mockTarget,
        0n,
        "0x",
        ethers.ZeroHash,
        salt
      );

      await expect(
        timelock.connect(executor).execute(
          mockTarget,
          0n,
          "0x",
          ethers.ZeroHash,
          salt
        )
      ).to.not.be.reverted;

      expect(await timelock.isOperationDone(operationHash)).to.be.true;
    });

    it("Should emit CallExecuted event", async function () {
      const { timelock, mockTarget, proposer, executor } = await loadFixture(deployTimelockFixture);

      const salt = ethers.id("execute-event");
      await timelock.connect(proposer).schedule(
        mockTarget,
        0n,
        "0x",
        ethers.ZeroHash,
        salt,
        MIN_DELAY
      );

      await time.increase(MIN_DELAY);

      await expect(
        timelock.connect(executor).execute(
          mockTarget,
          0n,
          "0x",
          ethers.ZeroHash,
          salt
        )
      ).to.emit(timelock, "CallExecuted");
    });

    it("Should not allow double execution", async function () {
      const { timelock, mockTarget, proposer, executor } = await loadFixture(deployTimelockFixture);

      const salt = ethers.id("double-execute");
      await timelock.connect(proposer).schedule(
        mockTarget,
        0n,
        "0x",
        ethers.ZeroHash,
        salt,
        MIN_DELAY
      );

      await time.increase(MIN_DELAY);

      await timelock.connect(executor).execute(
        mockTarget,
        0n,
        "0x",
        ethers.ZeroHash,
        salt
      );

      await expect(
        timelock.connect(executor).execute(
          mockTarget,
          0n,
          "0x",
          ethers.ZeroHash,
          salt
        )
      ).to.be.reverted;
    });

    it("Should not allow non-executor to execute", async function () {
      const { timelock, mockTarget, proposer, user } = await loadFixture(deployTimelockFixture);

      const salt = ethers.id("non-executor");
      await timelock.connect(proposer).schedule(
        mockTarget,
        0n,
        "0x",
        ethers.ZeroHash,
        salt,
        MIN_DELAY
      );

      await time.increase(MIN_DELAY);

      await expect(
        timelock.connect(user).execute(
          mockTarget,
          0n,
          "0x",
          ethers.ZeroHash,
          salt
        )
      ).to.be.reverted;
    });
  });

  describe("Cancel Operation", function () {
    it("Should allow canceller to cancel operation", async function () {
      const { timelock, mockTarget, proposer, canceller } = await loadFixture(deployTimelockFixture);

      const salt = ethers.id("cancel-test");
      await timelock.connect(proposer).schedule(
        mockTarget,
        0n,
        "0x",
        ethers.ZeroHash,
        salt,
        MIN_DELAY
      );

      const operationHash = await timelock.hashOperation(
        mockTarget,
        0n,
        "0x",
        ethers.ZeroHash,
        salt
      );

      await expect(
        timelock.connect(canceller).cancel(operationHash)
      ).to.not.be.reverted;

      expect(await timelock.isOperationPending(operationHash)).to.be.false;
      expect(await timelock.isOperationReady(operationHash)).to.be.false;
    });

    it("Should revert if non-canceller tries to cancel", async function () {
      const { timelock, mockTarget, proposer, user } = await loadFixture(deployTimelockFixture);

      const salt = ethers.id("non-canceller");
      await timelock.connect(proposer).schedule(
        mockTarget,
        0n,
        "0x",
        ethers.ZeroHash,
        salt,
        MIN_DELAY
      );

      const operationHash = await timelock.hashOperation(
        mockTarget,
        0n,
        "0x",
        ethers.ZeroHash,
        salt
      );

      await expect(
        timelock.connect(user).cancel(operationHash)
      ).to.be.reverted;
    });

    it("Should emit Cancelled event", async function () {
      const { timelock, mockTarget, proposer, canceller } = await loadFixture(deployTimelockFixture);

      const salt = ethers.id("cancel-event");
      await timelock.connect(proposer).schedule(
        mockTarget,
        0n,
        "0x",
        ethers.ZeroHash,
        salt,
        MIN_DELAY
      );

      const operationHash = await timelock.hashOperation(
        mockTarget,
        0n,
        "0x",
        ethers.ZeroHash,
        salt
      );

      await expect(
        timelock.connect(canceller).cancel(operationHash)
      ).to.emit(timelock, "Cancelled");
    });

    it("Should not allow execution after cancellation", async function () {
      const { timelock, mockTarget, proposer, canceller, executor } = await loadFixture(deployTimelockFixture);

      const salt = ethers.id("cancel-block");
      await timelock.connect(proposer).schedule(
        mockTarget,
        0n,
        "0x",
        ethers.ZeroHash,
        salt,
        MIN_DELAY
      );

      const operationHash = await timelock.hashOperation(
        mockTarget,
        0n,
        "0x",
        ethers.ZeroHash,
        salt
      );

      await timelock.connect(canceller).cancel(operationHash);
      await time.increase(MIN_DELAY);

      await expect(
        timelock.connect(executor).execute(
          mockTarget,
          0n,
          "0x",
          ethers.ZeroHash,
          salt
        )
      ).to.be.reverted;
    });

    it("Should allow cancellation of ready operation", async function () {
      const { timelock, mockTarget, proposer, canceller } = await loadFixture(deployTimelockFixture);

      const salt = ethers.id("cancel-ready");
      await timelock.connect(proposer).schedule(
        mockTarget,
        0n,
        "0x",
        ethers.ZeroHash,
        salt,
        MIN_DELAY
      );

      await time.increase(MIN_DELAY);

      const operationHash = await timelock.hashOperation(
        mockTarget,
        0n,
        "0x",
        ethers.ZeroHash,
        salt
      );

      expect(await timelock.isOperationReady(operationHash)).to.be.true;

      await expect(
        timelock.connect(canceller).cancel(operationHash)
      ).to.not.be.reverted;

      expect(await timelock.isOperationReady(operationHash)).to.be.false;
    });
  });

  describe("Operation Status", function () {
    it("Should return correct pending status", async function () {
      const { timelock, mockTarget, proposer } = await loadFixture(deployTimelockFixture);

      const salt = ethers.id("status-pending");
      await timelock.connect(proposer).schedule(
        mockTarget,
        0n,
        "0x",
        ethers.ZeroHash,
        salt,
        MIN_DELAY
      );

      const operationHash = await timelock.hashOperation(
        mockTarget,
        0n,
        "0x",
        ethers.ZeroHash,
        salt
      );

      expect(await timelock.isOperationPending(operationHash)).to.be.true;
      expect(await timelock.isOperationReady(operationHash)).to.be.false;
      expect(await timelock.isOperationDone(operationHash)).to.be.false;
    });

    it("Should return correct ready status after delay", async function () {
      const { timelock, mockTarget, proposer } = await loadFixture(deployTimelockFixture);

      const salt = ethers.id("status-ready");
      await timelock.connect(proposer).schedule(
        mockTarget,
        0n,
        "0x",
        ethers.ZeroHash,
        salt,
        MIN_DELAY
      );

      await time.increase(MIN_DELAY);

      const operationHash = await timelock.hashOperation(
        mockTarget,
        0n,
        "0x",
        ethers.ZeroHash,
        salt
      );

      expect(await timelock.isOperationPending(operationHash)).to.be.false;
      expect(await timelock.isOperationReady(operationHash)).to.be.true;
      expect(await timelock.isOperationDone(operationHash)).to.be.false;
    });

    it("Should return correct done status after execution", async function () {
      const { timelock, mockTarget, proposer, executor } = await loadFixture(deployTimelockFixture);

      const salt = ethers.id("status-done");
      await timelock.connect(proposer).schedule(
        mockTarget,
        0n,
        "0x",
        ethers.ZeroHash,
        salt,
        MIN_DELAY
      );

      await time.increase(MIN_DELAY);

      await timelock.connect(executor).execute(
        mockTarget,
        0n,
        "0x",
        ethers.ZeroHash,
        salt
      );

      const operationHash = await timelock.hashOperation(
        mockTarget,
        0n,
        "0x",
        ethers.ZeroHash,
        salt
      );

      expect(await timelock.isOperationPending(operationHash)).to.be.false;
      expect(await timelock.isOperationReady(operationHash)).to.be.false;
      expect(await timelock.isOperationDone(operationHash)).to.be.true;
    });

    it("Should return false for all statuses of non-existent operation", async function () {
      const { timelock } = await loadFixture(deployTimelockFixture);

      const fakeHash = ethers.id("non-existent");

      expect(await timelock.isOperationPending(fakeHash)).to.be.false;
      expect(await timelock.isOperationReady(fakeHash)).to.be.false;
      expect(await timelock.isOperationDone(fakeHash)).to.be.false;
    });
  });

  describe("Role Management", function () {
    it("Should allow admin to grant proposer role", async function () {
      const { timelock, admin, user } = await loadFixture(deployTimelockFixture);

      const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();

      await expect(
        timelock.connect(admin).grantRole(PROPOSER_ROLE, user.address)
      ).to.not.be.reverted;

      expect(await timelock.hasRole(PROPOSER_ROLE, user.address)).to.be.true;
      expect(await timelock.isProposer(user.address)).to.be.true;
    });

    it("Should allow admin to revoke proposer role", async function () {
      const { timelock, admin, proposer } = await loadFixture(deployTimelockFixture);

      const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();

      await timelock.connect(admin).revokeRole(PROPOSER_ROLE, proposer.address);

      expect(await timelock.hasRole(PROPOSER_ROLE, proposer.address)).to.be.false;
      expect(await timelock.isProposer(proposer.address)).to.be.false;
    });

    it("Should not allow non-admin to grant roles", async function () {
      const { timelock, user } = await loadFixture(deployTimelockFixture);

      const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();

      await expect(
        timelock.connect(user).grantRole(PROPOSER_ROLE, user.address)
      ).to.be.reverted;
    });

    it("Should emit RoleGranted event", async function () {
      const { timelock, admin, user } = await loadFixture(deployTimelockFixture);

      const EXECUTOR_ROLE = await timelock.EXECUTOR_ROLE();

      await expect(
        timelock.connect(admin).grantRole(EXECUTOR_ROLE, user.address)
      ).to.emit(timelock, "RoleGranted");
    });

    it("Should emit RoleRevoked event", async function () {
      const { timelock, admin, executor } = await loadFixture(deployTimelockFixture);

      const EXECUTOR_ROLE = await timelock.EXECUTOR_ROLE();

      await expect(
        timelock.connect(admin).revokeRole(EXECUTOR_ROLE, executor.address)
      ).to.emit(timelock, "RoleRevoked");
    });
  });

  describe("Hash Operation", function () {
    it("Should generate consistent hash for same parameters", async function () {
      const { timelock, mockTarget } = await loadFixture(deployTimelockFixture);

      const hash1 = await timelock.hashOperation(
        mockTarget,
        0n,
        "0x",
        ethers.ZeroHash,
        ethers.id("consistent")
      );

      const hash2 = await timelock.hashOperation(
        mockTarget,
        0n,
        "0x",
        ethers.ZeroHash,
        ethers.id("consistent")
      );

      expect(hash1).to.equal(hash2);
    });

    it("Should generate different hash for different salt", async function () {
      const { timelock, mockTarget } = await loadFixture(deployTimelockFixture);

      const hash1 = await timelock.hashOperation(
        mockTarget,
        0n,
        "0x",
        ethers.ZeroHash,
        ethers.id("salt1")
      );

      const hash2 = await timelock.hashOperation(
        mockTarget,
        0n,
        "0x",
        ethers.ZeroHash,
        ethers.id("salt2")
      );

      expect(hash1).to.not.equal(hash2);
    });
  });

  describe("Multiple Operations", function () {
    it("Should allow scheduling multiple operations", async function () {
      const { timelock, mockTarget, proposer } = await loadFixture(deployTimelockFixture);

      await expect(
        timelock.connect(proposer).schedule(
          mockTarget,
          0n,
          "0x11111111",
          ethers.ZeroHash,
          ethers.id("multi-1"),
          MIN_DELAY
        )
      ).to.not.be.reverted;

      await expect(
        timelock.connect(proposer).schedule(
          mockTarget,
          0n,
          "0x22222222",
          ethers.ZeroHash,
          ethers.id("multi-2"),
          MIN_DELAY
        )
      ).to.not.be.reverted;
    });

    it("Should track each operation independently", async function () {
      const { timelock, mockTarget, proposer, canceller } = await loadFixture(deployTimelockFixture);

      const salt1 = ethers.id("independent-1");
      const salt2 = ethers.id("independent-2");

      await timelock.connect(proposer).schedule(
        mockTarget,
        0n,
        "0x",
        ethers.ZeroHash,
        salt1,
        MIN_DELAY
      );

      await timelock.connect(proposer).schedule(
        mockTarget,
        0n,
        "0x",
        ethers.ZeroHash,
        salt2,
        MIN_DELAY
      );

      const hash1 = await timelock.hashOperation(
        mockTarget,
        0n,
        "0x",
        ethers.ZeroHash,
        salt1
      );

      const hash2 = await timelock.hashOperation(
        mockTarget,
        0n,
        "0x",
        ethers.ZeroHash,
        salt2
      );

      expect(await timelock.isOperationPending(hash1)).to.be.true;
      expect(await timelock.isOperationPending(hash2)).to.be.true;

      // Cancel one
      await timelock.connect(canceller).cancel(hash1);

      // First should be cancelled, second should still be pending
      expect(await timelock.isOperationPending(hash1)).to.be.false;
      expect(await timelock.isOperationPending(hash2)).to.be.true;
    });
  });
});