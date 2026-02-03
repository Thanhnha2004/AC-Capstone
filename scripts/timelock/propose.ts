import { ethers } from "hardhat";

const TIMELOCK_ADDRESS = "0x...";
const SAVING_BANK_ADDRESS = "0x...";

async function main() {
  const [proposer] = await ethers.getSigners();

  const timelock = await ethers.getContractAt(
    "SavingBankTimelock",
    TIMELOCK_ADDRESS,
  );

  const savingBank = await ethers.getContractAt(
    "SavingBankV2Upgradeable",
    SAVING_BANK_ADDRESS,
  );

  // Encode function call
  const calldata = savingBank.interface.encodeFunctionData("updatePlan", [
    1, // planId
    180, // tenorDays
    800, // aprBps (8%)
    ethers.parseEther("100"), // minDeposit
    ethers.parseEther("100000"), // maxDeposit
    500, // earlyWithdrawPenaltyBps (5%)
  ]);

  // Calculate operation hash
  const target = await savingBank.getAddress();
  const value = 0;
  const predecessor = ethers.ZeroHash;
  const salt = ethers.id("Update Plan 1 - APR 8%");

  const operationHash = await timelock.hashOperation(
    target,
    value,
    calldata,
    predecessor,
    salt,
  );

  console.log("Operation Hash:", operationHash);

  // Schedule operation
  const delay = await timelock.getMinDelay();
  const tx = await timelock.schedule(
    target,
    value,
    calldata,
    predecessor,
    salt,
    delay,
  );

  await tx.wait();
  console.log("✅ Scheduled! Execute after 2 days");

  // Output execution time
  const currentBlock = await ethers.provider.getBlock("latest");
  const executionTime = currentBlock!.timestamp + Number(delay);
  console.log("Execution Time:", new Date(executionTime * 1000));
}

main();
