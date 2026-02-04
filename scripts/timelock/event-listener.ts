import { ethers, deployments } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * 🎯 TIMELOCK EVENT LISTENER
 *
 * HƯỚNG DẪN SỬ DỤNG:
 * 1. Cấu hình LOG_TO_FILE và LOG_DIR (dòng 17-18)
 * 2. Chạy: npx hardhat run scripts/timelock/event-listener.ts --network <network>
 * 3. Script sẽ chạy liên tục và log tất cả events
 * 4. Nhấn Ctrl+C để dừng
 */

// ============ CẤU HÌNH ============
const LOG_TO_FILE = true; // true = lưu vào file, false = chỉ console
const LOG_DIR = "./logs/timelock"; // Thư mục lưu logs

// ============ TYPES ============
interface EventLog {
  timestamp: string;
  blockNumber: number;
  txHash: string;
  event: string;
  args: any;
}

interface OperationData {
  operationHash: string;
  target: string;
  value: string;
  data: string;
  predecessor: string;
  delay: string;
}

// ============ HELPER FUNCTIONS ============

/**
 * Tạo thư mục logs nếu chưa tồn tại
 */
function ensureLogDirectory() {
  if (LOG_TO_FILE && !fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    console.log(`📁 Created log directory: ${LOG_DIR}`);
  }
}

/**
 * Ghi log vào file
 */
function writeLogToFile(eventLog: EventLog) {
  if (!LOG_TO_FILE) return;

  const date = new Date().toISOString().split("T")[0];
  const filename = path.join(LOG_DIR, `timelock-events-${date}.json`);

  let logs: EventLog[] = [];
  if (fs.existsSync(filename)) {
    const content = fs.readFileSync(filename, "utf-8");
    logs = JSON.parse(content);
  }

  logs.push(eventLog);
  fs.writeFileSync(filename, JSON.stringify(logs, null, 2));
}

/**
 * Format địa chỉ ngắn gọn
 */
function shortAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Format timestamp
 */
function formatTimestamp(timestamp: bigint): string {
  const date = new Date(Number(timestamp) * 1000);
  return date.toLocaleString();
}

/**
 * Calculate time until execution
 */
function getTimeUntil(timestamp: bigint): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = Number(timestamp) - now;

  if (diff <= 0) return "Ready to execute";

  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const minutes = Math.floor((diff % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

// ============ EVENT HANDLERS ============

/**
 * Handler cho CallScheduled event
 */
async function handleCallScheduled(...args: any[]) {
  const eventObj = args.find(arg => arg && typeof arg === 'object' && 'log' in arg && 'getBlock' in arg);
  
  if (!eventObj) {
    console.error("❌ Could not find event object in CallScheduled!");
    return;
  }

  let id, index, target, value, data, predecessor, delay;
  
  if (eventObj.args && Array.isArray(eventObj.args)) {
    [id, index, target, value, data, predecessor, delay] = eventObj.args;
  } else {
    const eventIndex = args.indexOf(eventObj);
    [id, index, target, value, data, predecessor, delay] = args.slice(0, eventIndex);
  }

  const block = await eventObj.getBlock();
  const executeTime = BigInt(block.timestamp) + BigInt(delay);

  console.log("\n📅 ============ OPERATION SCHEDULED ============");
  console.log("Operation Hash:", id);
  console.log("Index:", index.toString());
  console.log("Target:", target, `(${shortAddress(target)})`);
  console.log("Value:", ethers.formatEther(value), "ETH");
  console.log("Data Length:", data.length, "bytes");
  console.log("Predecessor:", predecessor);
  console.log("Delay:", Number(delay) / 86400, "days");
  console.log("─".repeat(45));
  console.log("Scheduled At:", formatTimestamp(BigInt(block.timestamp)));
  console.log("Execute After:", formatTimestamp(executeTime));
  console.log("Time Until:", getTimeUntil(executeTime));
  console.log("Block:", block.number);
  console.log("Transaction:", eventObj.log.transactionHash);
  console.log("===============================================\n");

  const eventLog: EventLog = {
    timestamp: new Date().toISOString(),
    blockNumber: block.number,
    txHash: eventObj.log.transactionHash,
    event: "CallScheduled",
    args: {
      operationHash: id,
      index: index.toString(),
      target,
      value: value.toString(),
      data,
      predecessor,
      delay: delay.toString(),
      executeTime: executeTime.toString(),
    },
  };

  writeLogToFile(eventLog);

  if (LOG_TO_FILE) {
    const operationData: OperationData = {
      operationHash: id,
      target,
      value: value.toString(),
      data,
      predecessor,
      delay: delay.toString(),
    };

    const opFilename = path.join(LOG_DIR, `operation-${id.slice(0, 10)}.json`);
    fs.writeFileSync(opFilename, JSON.stringify(operationData, null, 2));
    console.log(`💾 Operation data saved to: ${opFilename}\n`);
  }
}

/**
 * Handler cho CallExecuted event
 */
async function handleCallExecuted(...args: any[]) {
  const eventObj = args.find(arg => arg && typeof arg === 'object' && 'log' in arg && 'getBlock' in arg);
  
  if (!eventObj) {
    console.error("❌ Could not find event object in CallExecuted!");
    return;
  }

  let id, index, target, value, data;
  
  if (eventObj.args && Array.isArray(eventObj.args)) {
    [id, index, target, value, data] = eventObj.args;
  } else {
    const eventIndex = args.indexOf(eventObj);
    [id, index, target, value, data] = args.slice(0, eventIndex);
  }

  const block = await eventObj.getBlock();

  console.log("\n✅ ============ OPERATION EXECUTED ============");
  console.log("Operation Hash:", id);
  console.log("Index:", index.toString());
  console.log("Target:", target, `(${shortAddress(target)})`);
  console.log("Value:", ethers.formatEther(value), "ETH");
  console.log("Data Length:", data.length, "bytes");
  console.log("─".repeat(45));
  console.log("Executed At:", formatTimestamp(BigInt(block.timestamp)));
  console.log("Block:", block.number);
  console.log("Transaction:", eventObj.log.transactionHash);
  console.log("===============================================\n");

  const eventLog: EventLog = {
    timestamp: new Date().toISOString(),
    blockNumber: block.number,
    txHash: eventObj.log.transactionHash,
    event: "CallExecuted",
    args: {
      operationHash: id,
      index: index.toString(),
      target,
      value: value.toString(),
      data,
    },
  };

  writeLogToFile(eventLog);
}

/**
 * Handler cho Cancelled event
 */
async function handleCancelled(...args: any[]) {
  const eventObj = args.find(arg => arg && typeof arg === 'object' && 'log' in arg && 'getBlock' in arg);
  
  if (!eventObj) {
    console.error("❌ Could not find event object in Cancelled!");
    return;
  }

  let id;
  if (eventObj.args && Array.isArray(eventObj.args)) {
    [id] = eventObj.args;
  } else {
    const eventIndex = args.indexOf(eventObj);
    [id] = args.slice(0, eventIndex);
  }

  const block = await eventObj.getBlock();

  console.log("\n🚫 ============ OPERATION CANCELLED ============");
  console.log("Operation Hash:", id);
  console.log("Cancelled At:", formatTimestamp(BigInt(block.timestamp)));
  console.log("Block:", block.number);
  console.log("Transaction:", eventObj.log.transactionHash);
  console.log("===============================================\n");

  const eventLog: EventLog = {
    timestamp: new Date().toISOString(),
    blockNumber: block.number,
    txHash: eventObj.log.transactionHash,
    event: "Cancelled",
    args: {
      operationHash: id,
    },
  };

  writeLogToFile(eventLog);
}

/**
 * Handler cho MinDelayChange event
 */
async function handleMinDelayChange(...args: any[]) {
  const eventObj = args.find(arg => arg && typeof arg === 'object' && 'log' in arg && 'getBlock' in arg);
  
  if (!eventObj) {
    console.error("❌ Could not find event object in MinDelayChange!");
    return;
  }

  let oldDuration, newDuration;
  if (eventObj.args && Array.isArray(eventObj.args)) {
    [oldDuration, newDuration] = eventObj.args;
  } else {
    const eventIndex = args.indexOf(eventObj);
    [oldDuration, newDuration] = args.slice(0, eventIndex);
  }

  const block = await eventObj.getBlock();

  console.log("\n⏰ ============ MIN DELAY CHANGED ============");
  console.log("Old Delay:", Number(oldDuration) / 86400, "days");
  console.log("New Delay:", Number(newDuration) / 86400, "days");
  console.log("Changed At:", formatTimestamp(BigInt(block.timestamp)));
  console.log("Block:", block.number);
  console.log("Transaction:", eventObj.log.transactionHash);
  console.log("===============================================\n");

  const eventLog: EventLog = {
    timestamp: new Date().toISOString(),
    blockNumber: block.number,
    txHash: eventObj.log.transactionHash,
    event: "MinDelayChange",
    args: {
      oldDuration: oldDuration.toString(),
      newDuration: newDuration.toString(),
    },
  };

  writeLogToFile(eventLog);
}

/**
 * Handler cho RoleGranted event
 */
async function handleRoleGranted(...args: any[]) {
  const eventObj = args.find(arg => arg && typeof arg === 'object' && 'log' in arg && 'getBlock' in arg);
  
  if (!eventObj) {
    console.error("❌ Could not find event object in RoleGranted!");
    return;
  }

  let role, account, sender;
  if (eventObj.args && Array.isArray(eventObj.args)) {
    [role, account, sender] = eventObj.args;
  } else {
    const eventIndex = args.indexOf(eventObj);
    [role, account, sender] = args.slice(0, eventIndex);
  }

  const block = await eventObj.getBlock();

  let roleName = "UNKNOWN_ROLE";
  if (role === ethers.id("PROPOSER_ROLE")) roleName = "PROPOSER_ROLE";
  else if (role === ethers.id("EXECUTOR_ROLE")) roleName = "EXECUTOR_ROLE";
  else if (role === ethers.id("CANCELLER_ROLE")) roleName = "CANCELLER_ROLE";
  else if (role === ethers.ZeroHash) roleName = "DEFAULT_ADMIN_ROLE";

  console.log("\n👤 ============ ROLE GRANTED ============");
  console.log("Role:", roleName);
  console.log("Account:", account, `(${shortAddress(account)})`);
  console.log("Granted By:", sender, `(${shortAddress(sender)})`);
  console.log("Granted At:", formatTimestamp(BigInt(block.timestamp)));
  console.log("Block:", block.number);
  console.log("Transaction:", eventObj.log.transactionHash);
  console.log("===============================================\n");

  const eventLog: EventLog = {
    timestamp: new Date().toISOString(),
    blockNumber: block.number,
    txHash: eventObj.log.transactionHash,
    event: "RoleGranted",
    args: {
      role,
      roleName,
      account,
      sender,
    },
  };

  writeLogToFile(eventLog);
}

/**
 * Handler cho RoleRevoked event
 */
async function handleRoleRevoked(...args: any[]) {
  const eventObj = args.find(arg => arg && typeof arg === 'object' && 'log' in arg && 'getBlock' in arg);
  
  if (!eventObj) {
    console.error("❌ Could not find event object in RoleRevoked!");
    return;
  }

  let role, account, sender;
  if (eventObj.args && Array.isArray(eventObj.args)) {
    [role, account, sender] = eventObj.args;
  } else {
    const eventIndex = args.indexOf(eventObj);
    [role, account, sender] = args.slice(0, eventIndex);
  }

  const block = await eventObj.getBlock();

  let roleName = "UNKNOWN_ROLE";
  if (role === ethers.id("PROPOSER_ROLE")) roleName = "PROPOSER_ROLE";
  else if (role === ethers.id("EXECUTOR_ROLE")) roleName = "EXECUTOR_ROLE";
  else if (role === ethers.id("CANCELLER_ROLE")) roleName = "CANCELLER_ROLE";
  else if (role === ethers.ZeroHash) roleName = "DEFAULT_ADMIN_ROLE";

  console.log("\n🚷 ============ ROLE REVOKED ============");
  console.log("Role:", roleName);
  console.log("Account:", account, `(${shortAddress(account)})`);
  console.log("Revoked By:", sender, `(${shortAddress(sender)})`);
  console.log("Revoked At:", formatTimestamp(BigInt(block.timestamp)));
  console.log("Block:", block.number);
  console.log("Transaction:", eventObj.log.transactionHash);
  console.log("===============================================\n");

  const eventLog: EventLog = {
    timestamp: new Date().toISOString(),
    blockNumber: block.number,
    txHash: eventObj.log.transactionHash,
    event: "RoleRevoked",
    args: {
      role,
      roleName,
      account,
      sender,
    },
  };

  writeLogToFile(eventLog);
}

// ============ MAIN FUNCTION ============

async function main() {
  console.log("🎧 ============ TIMELOCK EVENT LISTENER ============\n");

  ensureLogDirectory();

  const [signer] = await ethers.getSigners();
  console.log("👤 Listener:", signer.address);

  // Get timelock address from deployment
  let TIMELOCK_ADDRESS = process.env.TIMELOCK_ADDRESS || "";

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

  const timelock = await ethers.getContractAt(
    "SavingBankTimelock",
    TIMELOCK_ADDRESS,
  );

  console.log("🔗 Timelock:", await timelock.getAddress());
  console.log("⏰ Min Delay:", (await timelock.getMinDelay()) / 86400n, "days");
  console.log("📁 Log Dir:", LOG_TO_FILE ? LOG_DIR : "Console only");
  console.log("🌐 Network:", (await ethers.provider.getNetwork()).name);
  console.log("\n✅ Listening for events... (Press Ctrl+C to stop)\n");
  console.log("╔" + "═".repeat(58) + "╗\n");

  // Listen to all events
  timelock.on("CallScheduled", handleCallScheduled);
  timelock.on("CallExecuted", handleCallExecuted);
  timelock.on("Cancelled", handleCancelled);
  timelock.on("MinDelayChange", handleMinDelayChange);
  timelock.on("RoleGranted", handleRoleGranted);
  timelock.on("RoleRevoked", handleRoleRevoked);

  // Keep the script running
  await new Promise(() => {});
}

// ============ ERROR HANDLING ============

main()
  .then(() => {
    console.log("\n👋 Event listener stopped");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Error:", error.message);
    process.exit(1);
  });

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\n\n🛑 Shutting down gracefully...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n\n🛑 Shutting down gracefully...");
  process.exit(0);
});