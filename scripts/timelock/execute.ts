import { ethers } from "hardhat";

// ============ CẤU HÌNH ============
const TIMELOCK_ADDRESS = "0x..."; // Địa chỉ Timelock contract

// ============ NHẬP DATA TỪ PROPOSE ============
// Copy toàn bộ từ propose output hoặc từ file proposal-*.json

const OPERATION_DATA = {
  target: "0x...", // Địa chỉ SavingBank contract
  value: 0, // Luôn là 0
  calldata: "0x...", // Encoded function call từ propose
  predecessor: ethers.ZeroHash, // Hoặc "0x0000000000000000000000000000000000000000000000000000000000000000"
  salt: "0x...", // Salt từ propose (hash của description)
  operationHash: "0x...", // Operation hash từ propose
};

async function main() {
  console.log("🚀 Starting Timelock Execution\n");

  const [executor] = await ethers.getSigners();
  console.log("👤 Executor:", executor.address);

  const timelock = await ethers.getContractAt(
    "SavingBankTimelock",
    TIMELOCK_ADDRESS,
  );

  console.log("🔗 Timelock:", await timelock.getAddress());
  console.log("🔐 Operation Hash:", OPERATION_DATA.operationHash, "\n");

  // Verify delay passed
  console.log("⏰ Checking if delay passed...");
  const isReady = await timelock.isOperationReady(OPERATION_DATA.operationHash);

  if (!isReady) {
    // Check status
    const isPending = await timelock.isOperationPending(
      OPERATION_DATA.operationHash,
    );
    const isDone = await timelock.isOperationDone(OPERATION_DATA.operationHash);

    console.log("Status - Pending:", isPending);
    console.log("Status - Ready:", isReady);
    console.log("Status - Done:", isDone);

    if (isDone) {
      throw new Error("❌ Operation already executed!");
    }
    if (isPending) {
      const timestamp = await timelock.getTimestamp(
        OPERATION_DATA.operationHash,
      );
      const currentBlock = await ethers.provider.getBlock("latest");
      const currentTime = currentBlock!.timestamp;
      const waitTime = Number(timestamp) - currentTime;

      console.log("⏳ Need to wait:", Math.floor(waitTime / 3600), "hours");
      throw new Error("❌ Delay not passed yet!");
    }
    throw new Error("❌ Operation not found or not ready!");
  }

  console.log("✅ Delay passed, ready to execute\n");

  // Execute
  console.log("⚡ Executing operation...");
  const tx = await timelock.execute(
    OPERATION_DATA.target,
    OPERATION_DATA.value,
    OPERATION_DATA.calldata,
    OPERATION_DATA.predecessor,
    OPERATION_DATA.salt,
  );

  console.log("📤 Transaction sent:", tx.hash);
  const receipt = await tx.wait();
  console.log("✅ Transaction confirmed in block:", receipt?.blockNumber);

  // Verify execution
  const isDone = await timelock.isOperationDone(OPERATION_DATA.operationHash);
  console.log("\n🎉 Execution successful!");
  console.log("Verified:", isDone);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Error:", error);
    process.exit(1);
  });
