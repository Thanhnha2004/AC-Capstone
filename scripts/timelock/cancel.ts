import { ethers } from "hardhat";

/**
 * HƯỚNG DẪN NHANH:
 * 1. Điền TIMELOCK_ADDRESS (dòng 11)
 * 2. Mở file proposal-*.json
 * 3. Copy operationHash vào OPERATION_HASH (dòng 12)
 * 4. Điền CANCEL_REASON (dòng 13)
 * 5. Chạy: npx hardhat run scripts/timelock/cancel.ts --network <network>
 */

const TIMELOCK_ADDRESS = "0x..."; // TODO: Điền địa chỉ Timelock
const OPERATION_HASH = "0x...";   // TODO: Copy từ proposal JSON
const CANCEL_REASON = "Emergency: Security concern detected"; // TODO: Lý do hủy

async function main() {
  console.log("🚨 Timelock Cancel Script\n");
  console.log("⚠️  WARNING: This will CANCEL a pending operation");
  console.log("⚠️  Reason:", CANCEL_REASON, "\n");

  const [canceller] = await ethers.getSigners();
  console.log("👤 Canceller:", canceller.address);

  const timelock = await ethers.getContractAt(
    "SavingBankTimelock",
    TIMELOCK_ADDRESS
  );

  console.log("🔗 Timelock:", await timelock.getAddress());
  console.log("🔐 Operation Hash:", OPERATION_HASH, "\n");

  // Check canceller role
  const CANCELLER_ROLE = await timelock.CANCELLER_ROLE();
  const hasRole = await timelock.hasRole(CANCELLER_ROLE, canceller.address);
  if (!hasRole) {
    throw new Error("❌ Account does not have CANCELLER_ROLE");
  }
  console.log("✅ Canceller role verified\n");

  // Check operation status
  const isPending = await timelock.isOperationPending(OPERATION_HASH);
  const isReady = await timelock.isOperationReady(OPERATION_HASH);
  const isDone = await timelock.isOperationDone(OPERATION_HASH);

  console.log("📊 Operation Status:");
  console.log("  - Pending:", isPending);
  console.log("  - Ready:", isReady);
  console.log("  - Done:", isDone, "\n");

  if (isDone) {
    throw new Error("❌ Operation already executed - cannot cancel");
  }

  if (!isPending && !isReady) {
    throw new Error("❌ Operation not found - nothing to cancel");
  }

  // Show operation info
  if (isPending || isReady) {
    const timestamp = await timelock.getTimestamp(OPERATION_HASH);
    const currentBlock = await ethers.provider.getBlock("latest");
    const currentTimestamp = currentBlock!.timestamp;

    console.log("⏰ Operation Info:");
    console.log("  Scheduled for:", new Date(Number(timestamp) * 1000).toLocaleString());
    console.log("  Current time:", new Date(currentTimestamp * 1000).toLocaleString());

    if (isReady) {
      console.log("  Status: Ready to execute (delay passed)");
    } else {
      const remainingTime = Number(timestamp) - currentTimestamp;
      console.log("  Status: Pending (waiting", Math.floor(remainingTime / 3600), "hours)");
    }
    console.log();
  }

  // Confirmation
  console.log("⚠️  ============ CONFIRMATION ============");
  console.log("You are about to CANCEL this operation:");
  console.log("Operation Hash:", OPERATION_HASH);
  console.log("Reason:", CANCEL_REASON);
  console.log("\n⚠️  This action CANNOT be undone.");
  console.log("⏸️  Waiting 5 seconds before proceeding...\n");

  await new Promise(resolve => setTimeout(resolve, 5000));

  // Cancel operation
  console.log("🚫 Cancelling operation...");

  const tx = await timelock.cancel(OPERATION_HASH);

  console.log("📤 Transaction sent:", tx.hash);
  const receipt = await tx.wait();
  console.log("✅ Transaction confirmed in block:", receipt?.blockNumber);

  // Verify cancellation
  const isStillPending = await timelock.isOperationPending(OPERATION_HASH);
  const isStillReady = await timelock.isOperationReady(OPERATION_HASH);

  if (isStillPending || isStillReady) {
    throw new Error("❌ Cancellation verification failed");
  }

  console.log("\n🎉 ============ CANCELLATION SUCCESSFUL ============");
  console.log("Operation Hash:", OPERATION_HASH);
  console.log("Transaction:", tx.hash);
  console.log("Block:", receipt?.blockNumber);
  console.log("Reason:", CANCEL_REASON);
  console.log("✅ Operation cancelled and verified");

  // Log to file
  const fs = require("fs");
  const cancellationLog = {
    operationHash: OPERATION_HASH,
    reason: CANCEL_REASON,
    cancelledBy: canceller.address,
    txHash: tx.hash,
    blockNumber: receipt?.blockNumber,
    timestamp: new Date().toISOString(),
  };

  const filename = `cancellation-${Date.now()}.json`;
  fs.writeFileSync(filename, JSON.stringify(cancellationLog, null, 2));
  console.log("\n💾 Cancellation logged to:", filename);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Error:", error.message);
    process.exit(1);
  });