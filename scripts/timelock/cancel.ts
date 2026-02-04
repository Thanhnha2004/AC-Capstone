import { ethers, deployments } from "hardhat";
import * as fs from "fs";

/**
 * 🚨 TIMELOCK CANCEL SCRIPT
 *
 * HƯỚNG DẪN:
 * 1. Chạy script này: npx hardhat run scripts/timelock/cancel.ts --network <network>
 * 2. Script sẽ auto-load proposal mới nhất, hoặc chỉ định file cụ thể
 *
 * LƯU Ý: Chỉ account có CANCELLER_ROLE mới có thể hủy operation
 */

// ============ CẤU HÌNH ============
const PROPOSAL_FILE = ""; // Để trống để auto-load, hoặc chỉ định file: "proposal-1234567890.json"
const CANCEL_REASON = "Emergency: Security vulnerability detected"; // Lý do hủy

async function main() {
  console.log("🚨 Timelock Cancel Script\n");

  const [canceller] = await ethers.getSigners();
  console.log("👤 Canceller:", canceller.address);

  // Get timelock address from deployment
  let TIMELOCK_ADDRESS = process.env.TIMELOCK_ADDRESS || "";

  if (!TIMELOCK_ADDRESS) {
    try {
      const timelockDeployment = await deployments.get("SavingBankTimelock");
      TIMELOCK_ADDRESS = timelockDeployment.address;
      console.log("✅ Timelock address from deployment:", TIMELOCK_ADDRESS);
    } catch {
      throw new Error(
        "❌ Timelock address not found! Deploy it first or set TIMELOCK_ADDRESS in .env",
      );
    }
  }

  const timelock = await ethers.getContractAt(
    "SavingBankTimelock",
    TIMELOCK_ADDRESS,
  );

  console.log("🔗 Timelock:", await timelock.getAddress());
  console.log();

  // ============ CHECK CANCELLER ROLE ============
  console.log("🔐 Verifying permissions...");

  const CANCELLER_ROLE = await timelock.CANCELLER_ROLE();
  const hasRole = await timelock.hasRole(CANCELLER_ROLE, canceller.address);

  if (!hasRole) {
    throw new Error("❌ Account does not have CANCELLER_ROLE");
  }

  console.log("✅ CANCELLER_ROLE verified\n");

  // ============ LOAD PROPOSAL DATA ============
  const PROPOSALS_DIR = "./proposals";
  const CANCELLATIONS_DIR = "./cancellations";

  // Tạo thư mục nếu chưa có
  if (!fs.existsSync(CANCELLATIONS_DIR)) {
    fs.mkdirSync(CANCELLATIONS_DIR, { recursive: true });
  }

  let proposalData: any;

  try {
    let proposalFile = PROPOSAL_FILE;

    // Auto-find latest proposal file if not specified
    if (!proposalFile) {
      const files = fs
        .readdirSync(PROPOSALS_DIR)
        .filter((f) => f.startsWith("proposal-") && f.endsWith(".json"))
        .sort()
        .reverse();

      if (files.length === 0) {
        throw new Error("❌ No proposal files found!");
      }

      proposalFile = files[0];
      console.log("📂 Auto-loaded latest proposal:", proposalFile);
    } else {
      console.log("📂 Loading proposal:", proposalFile);
    }

    const content = fs.readFileSync(
      `${PROPOSALS_DIR}/${proposalFile}`,
      "utf-8",
    );
    proposalData = JSON.parse(content);

    console.log("✅ Proposal data loaded");
    console.log("📝 Description:", proposalData.description);
    console.log("🔐 Operation Hash:", proposalData.operationHash);
    console.log();
  } catch (error: any) {
    throw new Error(`❌ Failed to load proposal file: ${error.message}`);
  }

  // ============ CHECK OPERATION STATUS ============
  console.log("📊 Checking operation status...");

  const operationHash = proposalData.operationHash;
  const isPending = await timelock.isOperationPending(operationHash);
  const isReady = await timelock.isOperationReady(operationHash);
  const isDone = await timelock.isOperationDone(operationHash);

  console.log("  - Pending:", isPending ? "✅" : "❌");
  console.log("  - Ready:", isReady ? "✅" : "❌");
  console.log("  - Done:", isDone ? "✅" : "❌");
  console.log();

  if (isDone) {
    throw new Error("❌ Operation already executed - cannot cancel");
  }

  if (!isPending && !isReady) {
    throw new Error("❌ Operation not found - nothing to cancel");
  }

  // ============ SHOW OPERATION DETAILS ============
  if (isPending || isReady) {
    const timestamp = await timelock.getTimestamp(operationHash);
    const currentBlock = await ethers.provider.getBlock("latest");
    const currentTimestamp = currentBlock!.timestamp;

    console.log("⏰ Operation Information:");
    console.log("  Description:", proposalData.description);
    console.log(
      "  Scheduled For:",
      new Date(Number(timestamp) * 1000).toLocaleString(),
    );
    console.log(
      "  Current Time:",
      new Date(currentTimestamp * 1000).toLocaleString(),
    );

    if (isReady) {
      console.log("  Status: ⚠️  READY TO EXECUTE (delay has passed)");
      console.log("  ⚡ Can be executed by anyone at any time!");
    } else {
      const remainingTime = Number(timestamp) - currentTimestamp;
      const hoursLeft = Math.floor(remainingTime / 3600);
      const minutesLeft = Math.floor((remainingTime % 3600) / 60);
      console.log(
        `  Status: ⏳ PENDING (${hoursLeft}h ${minutesLeft}m remaining)`,
      );
    }
    console.log();
  }

  // ============ CONFIRMATION ============
  console.log("⚠️  " + "=".repeat(54));
  console.log("⚠️  CONFIRMATION - READ CAREFULLY");
  console.log("⚠️  " + "=".repeat(54));
  console.log("You are about to CANCEL this operation:");
  console.log("  Description:", proposalData.description);
  console.log("  Operation Hash:", proposalData.operationHash);
  console.log("  Cancellation Reason:", CANCEL_REASON);
  console.log("\n⚠️  This action CANNOT be undone!");
  console.log("⚠️  The proposal will need to be re-submitted from scratch!");
  console.log("\n⏸️  Waiting 5 seconds before proceeding...\n");

  await new Promise((resolve) => setTimeout(resolve, 5000));

  // ============ CANCEL OPERATION ============
  console.log("🚫 Cancelling operation...");

  const tx = await timelock.cancel(operationHash);

  console.log("📤 Transaction sent:", tx.hash);
  console.log("⏳ Waiting for confirmation...");

  const receipt = await tx.wait();
  console.log("✅ Transaction confirmed in block:", receipt?.blockNumber);
  console.log();

  // ============ VERIFY CANCELLATION ============
  const isStillPending = await timelock.isOperationPending(operationHash);
  const isStillReady = await timelock.isOperationReady(operationHash);

  if (isStillPending || isStillReady) {
    throw new Error("❌ Cancellation verification failed");
  }

  // ============ SUCCESS ============
  console.log("=".repeat(60));
  console.log("🎉 CANCELLATION SUCCESSFUL!");
  console.log("=".repeat(60));
  console.log("Operation Hash:", proposalData.operationHash);
  console.log("Description:", proposalData.description);
  console.log("Transaction:", tx.hash);
  console.log("Block:", receipt?.blockNumber);
  console.log("Cancelled By:", canceller.address);
  console.log("Reason:", CANCEL_REASON);
  console.log("✅ Operation cancelled and verified");
  console.log("=".repeat(60));
  console.log();

  // ============ LOG CANCELLATION ============
  const cancellationLog = {
    operationHash: proposalData.operationHash,
    description: proposalData.description,
    reason: CANCEL_REASON,
    cancelledBy: canceller.address,
    txHash: tx.hash,
    blockNumber: receipt?.blockNumber,
    timestamp: new Date().toISOString(),
    proposalFile: PROPOSAL_FILE || "auto-detected",
  };

  const filename = `${CANCELLATIONS_DIR}/cancellation-${Date.now()}.json`;
  fs.writeFileSync(filename, JSON.stringify(cancellationLog, null, 2));
  console.log("💾 Cancellation logged to:", filename);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Error:", error.message);
    process.exit(1);
  });
