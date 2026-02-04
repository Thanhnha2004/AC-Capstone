import { ethers, deployments } from "hardhat";

async function main() {
  console.log("📝 Timelock Propose Script\n");

  const [proposer] = await ethers.getSigners();
  console.log("👤 Proposer:", proposer.address);

  // Get contract addresses from deployments
  let TIMELOCK_ADDRESS = process.env.TIMELOCK_ADDRESS || "";
  let SAVING_BANK_ADDRESS = process.env.SAVING_BANK_ADDRESS || "";

  // Try to get from deployments if not in env
  if (!TIMELOCK_ADDRESS) {
    try {
      const timelockDeployment = await deployments.get("SavingBankTimelock");
      TIMELOCK_ADDRESS = timelockDeployment.address;
      console.log("✅ Timelock address from deployment:", TIMELOCK_ADDRESS);
    } catch {
      throw new Error(
        "Timelock address not found! Deploy it first or set TIMELOCK_ADDRESS in .env",
      );
    }
  }

  if (!SAVING_BANK_ADDRESS) {
    try {
      const savingBankDeployment = await deployments.get(
        "SavingBankUpgradeable",
      );
      SAVING_BANK_ADDRESS = savingBankDeployment.address;
      console.log(
        "✅ SavingBank address from deployment:",
        SAVING_BANK_ADDRESS,
      );
    } catch {
      throw new Error(
        "SavingBank address not found! Deploy it first or set SAVING_BANK_ADDRESS in .env",
      );
    }
  }

  const timelock = await ethers.getContractAt(
    "SavingBankTimelock",
    TIMELOCK_ADDRESS,
  );

  const savingBank = await ethers.getContractAt(
    "SavingBankUpgradeable",
    SAVING_BANK_ADDRESS,
  );

  // Check proposer role
  const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
  const hasRole = await timelock.hasRole(PROPOSER_ROLE, proposer.address);
  if (!hasRole) {
    throw new Error("❌ Account does not have PROPOSER_ROLE");
  }
  console.log("✅ Proposer role verified\n");

  // ============ CONFIGURE YOUR PROPOSAL HERE ============
  console.log("📋 Proposal: Update Plan 1 parameters");

  const PLAN_ID = 2;
  const TENOR_DAYS = 297; // 6 months
  const APR_BPS = 2620; // 12%
  const MIN_DEPOSIT = ethers.parseEther("100");
  const MAX_DEPOSIT = ethers.parseEther("100000");
  const PENALTY_BPS = 850; // 5%

  const DESCRIPTION = "Update Plan 1 - 6 months, 12% APR";
  // =======================================================

  // Encode function call
  const calldata = savingBank.interface.encodeFunctionData("updatePlan", [
    PLAN_ID,
    TENOR_DAYS,
    APR_BPS,
    MIN_DEPOSIT,
    MAX_DEPOSIT,
    PENALTY_BPS,
  ]);

  console.log("📦 Proposal Details:");
  console.log("  Plan ID:", PLAN_ID);
  console.log("  Tenor:", TENOR_DAYS, "days");
  console.log("  APR:", APR_BPS / 100, "%");
  console.log("  Min Deposit:", ethers.formatEther(MIN_DEPOSIT));
  console.log("  Max Deposit:", ethers.formatEther(MAX_DEPOSIT));
  console.log("  Penalty:", PENALTY_BPS / 100, "%");
  console.log("  Description:", DESCRIPTION, "\n");

  // Calculate operation hash
  const target = await savingBank.getAddress();
  const value = 0;
  const predecessor = ethers.ZeroHash;
  const salt = ethers.id(DESCRIPTION);

  const operationHash = await timelock.hashOperation(
    target,
    value,
    calldata,
    predecessor,
    salt,
  );

  console.log("🔐 Operation Hash:", operationHash);

  // Check if already scheduled
  const isPending = await timelock.isOperationPending(operationHash);
  const isReady = await timelock.isOperationReady(operationHash);
  const isDone = await timelock.isOperationDone(operationHash);

  if (isDone) {
    throw new Error("❌ Operation already executed!");
  }
  if (isPending || isReady) {
    throw new Error("❌ Operation already scheduled!");
  }

  // Schedule operation
  const delay = await timelock.getMinDelay();
  console.log("⏰ Delay:", Number(delay) / 86400, "days\n");

  console.log("📤 Scheduling operation...");
  const tx = await timelock.schedule(
    target,
    value,
    calldata,
    predecessor,
    salt,
    delay,
  );

  console.log("Transaction sent:", tx.hash);
  const receipt = await tx.wait();
  console.log("✅ Transaction confirmed in block:", receipt?.blockNumber);

  // Calculate execution time
  const currentBlock = await ethers.provider.getBlock("latest");
  const executionTime = currentBlock!.timestamp + Number(delay);

  console.log("\n" + "=".repeat(60));
  console.log("🎉 Operation Scheduled Successfully!");
  console.log("=".repeat(60));
  console.log("Operation Hash:", operationHash);
  console.log("Description:", DESCRIPTION);
  console.log(
    "Current Time:",
    new Date(currentBlock!.timestamp * 1000).toLocaleString(),
  );
  console.log(
    "Execute After:",
    new Date(executionTime * 1000).toLocaleString(),
  );
  console.log("Transaction:", tx.hash);
  console.log("=".repeat(60));

  // Save proposal data to file
  const fs = require("fs");
  const proposalData = {
    operationHash,
    description: DESCRIPTION,
    target,
    value: value.toString(),
    calldata,
    predecessor,
    salt,
    delay: delay.toString(),
    executionTime,
    executionTimeReadable: new Date(executionTime * 1000).toISOString(),
    txHash: tx.hash,
    blockNumber: receipt?.blockNumber,
    timestamp: new Date().toISOString(),
  };

  const PROPOSALS_DIR = "./proposals";
  if (!fs.existsSync(PROPOSALS_DIR)) {
    fs.mkdirSync(PROPOSALS_DIR, { recursive: true });
  }

  const filename = `${PROPOSALS_DIR}/proposal-${Date.now()}.json`;
  fs.writeFileSync(filename, JSON.stringify(proposalData, null, 2));
  console.log("\n💾 Proposal data saved to:", filename);
  console.log("ℹ️  Use this file for execution after delay\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Error:", error.message);
    process.exit(1);
  });
