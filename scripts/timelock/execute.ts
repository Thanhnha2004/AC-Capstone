import { ethers, deployments } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { time } from "@nomicfoundation/hardhat-network-helpers";

/**
 * 🚀 TIMELOCK EXECUTE SCRIPT
 *
 * HƯỚNG DẪN:
 * 1. Chạy propose.ts trước
 * 2. Đợi 2 ngày (delay)
 * 3. Chạy script này: npx hardhat run scripts/timelock/execute.ts --network <network>
 *
 * Script sẽ tự động:
 * - Load operation data từ file proposal-*.json mới nhất
 * - Hoặc bạn có thể chỉ định file cụ thể bằng PROPOSAL_FILE
 */

// ============ CẤU HÌNH ============
// Để trống để auto-load file mới nhất, hoặc chỉ định file cụ thể
const PROPOSAL_FILE = ""; // VD: "proposal-1234567890.json"

async function main() {
  console.log("🚀 Timelock Execute Script\n");

  const [executor] = await ethers.getSigners();
  console.log("👤 Executor:", executor.address);

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

  // ============ LOAD PROPOSAL DATA ============
  let proposalData: any;

  const PROPOSALS_DIR = "./proposals";
  const EXECUTIONS_DIR = "./executions";

  try {
    let proposalFile = PROPOSAL_FILE;

    // Auto-find latest proposal file if not specified
    if (!proposalFile) {
      // Kiểm tra thư mục proposals
      if (!fs.existsSync(PROPOSALS_DIR)) {
        throw new Error("❌ Proposals directory not found!");
      }

      const files = fs
        .readdirSync(PROPOSALS_DIR) // ✅ Đọc từ thư mục proposals
        .filter((f) => f.startsWith("proposal-") && f.endsWith(".json"))
        .sort()
        .reverse();

      if (files.length === 0) {
        throw new Error("❌ No proposal files found! Run propose.ts first.");
      }

      proposalFile = files[0];
      console.log("📂 Auto-loaded latest proposal:", proposalFile);
    } else {
      console.log("📂 Loading proposal:", proposalFile);
    }

    if (!fs.existsSync(EXECUTIONS_DIR)) {
      fs.mkdirSync(EXECUTIONS_DIR, { recursive: true });
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
  console.log("⏰ Checking operation status...");

  const operationHash = proposalData.operationHash;
  const isPending = await timelock.isOperationPending(operationHash);
  const isReady = await timelock.isOperationReady(operationHash);
  const isDone = await timelock.isOperationDone(operationHash);

  console.log("📊 Status:");
  console.log("  - Pending:", isPending);
  console.log("  - Ready:", isReady);
  console.log("  - Done:", isDone);
  console.log();

  if (isDone) {
    throw new Error("❌ Operation already executed!");
  }

  if (!isReady) {
    if (isPending) {
      const timestamp = await timelock.getTimestamp(operationHash);
      const currentBlock = await ethers.provider.getBlock("latest");
      const currentTime = currentBlock!.timestamp;
      const waitTime = Number(timestamp) - currentTime;

      console.log("⏳ Execution Details:");
      console.log(
        "  Current Time:",
        new Date(currentTime * 1000).toLocaleString(),
      );
      console.log(
        "  Execute After:",
        new Date(Number(timestamp) * 1000).toLocaleString(),
      );
      console.log(
        "  Wait Time:",
        Math.floor(waitTime / 3600),
        "hours (",
        Math.floor(waitTime / 86400),
        "days )",
      );
      console.log();

      // 🔥 AUTO INCREASE TIME FOR TESTING
      console.log("⏩ Increasing time by", Math.ceil(waitTime), "seconds...");
      await time.increase(waitTime + 1);
      console.log("✅ Time increased! Rechecking...\n");

      // Recheck status
      const isReadyNow = await timelock.isOperationReady(operationHash);
      if (!isReadyNow) {
        throw new Error("❌ Still not ready after time increase!");
      }
    } else {
      throw new Error("❌ Operation not found!");
    }
  } // ✅ KẾT THÚC if (!isReady), TIẾP TỤC EXECUTE

  console.log("✅ Delay passed, ready to execute\n");

  console.log("✅ Delay passed, ready to execute\n");

  // ============ SHOW PROPOSAL DETAILS ============
  console.log("=".repeat(60));
  console.log("📋 PROPOSAL TO EXECUTE");
  console.log("=".repeat(60));
  console.log("Description:", proposalData.description);
  console.log("Target:", proposalData.target);
  console.log("Operation Hash:", proposalData.operationHash);
  console.log("Scheduled At:", proposalData.timestamp);
  console.log("=".repeat(60));
  console.log();

  // ============ CONFIRMATION ============
  console.log("⚠️  WARNING: This will make PERMANENT changes to the contract.");
  console.log("⏸️  Waiting 5 seconds before proceeding...\n");

  await new Promise((resolve) => setTimeout(resolve, 5000));

  // ============ EXECUTE ============
  console.log("⚡ Executing operation...");

  const tx = await timelock.execute(
    proposalData.target,
    proposalData.value,
    proposalData.calldata,
    proposalData.predecessor,
    proposalData.salt,
  );

  console.log("📤 Transaction sent:", tx.hash);
  console.log("⏳ Waiting for confirmation...");

  const receipt = await tx.wait();
  console.log("✅ Transaction confirmed in block:", receipt?.blockNumber);
  console.log();

  // ============ VERIFY EXECUTION ============
  const isNowDone = await timelock.isOperationDone(operationHash);

  if (!isNowDone) {
    throw new Error("❌ Execution verification failed!");
  }

  // ============ SUCCESS ============
  console.log("=".repeat(60));
  console.log("🎉 EXECUTION SUCCESSFUL!");
  console.log("=".repeat(60));
  console.log("Operation Hash:", proposalData.operationHash);
  console.log("Description:", proposalData.description);
  console.log("Transaction:", tx.hash);
  console.log("Block:", receipt?.blockNumber);
  console.log("Executed By:", executor.address);
  console.log("✅ Operation completed and verified");
  console.log("=".repeat(60));
  console.log();

  // ============ LOG EXECUTION ============
  const executionLog = {
    operationHash: proposalData.operationHash,
    description: proposalData.description,
    executedBy: executor.address,
    txHash: tx.hash,
    blockNumber: receipt?.blockNumber,
    timestamp: new Date().toISOString(),
    proposalFile: PROPOSAL_FILE || "auto-detected",
  };

  const filename = `${EXECUTIONS_DIR}/execution-${Date.now()}.json`;
  fs.writeFileSync(filename, JSON.stringify(executionLog, null, 2));
  console.log("💾 Execution logged to:", filename);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Error:", error.message);
    process.exit(1);
  });
