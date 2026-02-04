import { ethers, deployments } from "hardhat";

/**
 * Script: Tạo gói tiết kiệm
 * Mục đích: Admin/Operator tạo các gói tiết kiệm với lãi suất khác nhau
 */
async function main() {
  console.log("=== CREATE SAVING PLANS ===\n");

  const [deployer] = await ethers.getSigners();
  
  const savingBankDeployment = await deployments.get("SavingBankUpgradeable");
  const savingBank = await ethers.getContractAt(
    "SavingBankUpgradeable",
    savingBankDeployment.address,
  );

  console.log("Operator:", deployer.address);
  console.log("SavingBank:", savingBankDeployment.address);
  console.log();

  // Plan 1: 30 ngày - 5% APR
  console.log("📝 Creating Plan 1: 30 days - 5% APR");
  const tx1 = await savingBank.createPlan(
    30, // 30 ngày
    500, // 5% APR (500 basis points)
    ethers.parseEther("100"), // Min: 100 tokens
    ethers.parseEther("10000"), // Max: 10,000 tokens
    5000, // Penalty: 50% nếu rút sớm
  );
  await tx1.wait();
  console.log("  ✅ Plan 1 created\n");

  // Plan 2: 90 ngày - 8% APR
  console.log("📝 Creating Plan 2: 90 days - 8% APR");
  const tx2 = await savingBank.createPlan(
    90, // 90 ngày
    800, // 8% APR
    ethers.parseEther("100"), // Min: 100 tokens
    ethers.parseEther("50000"), // Max: 50,000 tokens
    3000, // Penalty: 30% nếu rút sớm
  );
  await tx2.wait();
  console.log("  ✅ Plan 2 created\n");

  // Plan 3: 180 ngày - 12% APR
  console.log("📝 Creating Plan 3: 180 days - 12% APR");
  const tx3 = await savingBank.createPlan(
    180, // 180 ngày
    1200, // 12% APR
    ethers.parseEther("1000"), // Min: 1,000 tokens
    ethers.parseEther("100000"), // Max: 100,000 tokens
    2000, // Penalty: 20% nếu rút sớm
  );
  await tx3.wait();
  console.log("  ✅ Plan 3 created\n");

  // Display all plans
  console.log("📊 All Saving Plans:");

  const nextPlanId = await savingBank.nextPlanId();

  for (let i = 1n; i < nextPlanId; i++) {
    const plan = await savingBank.savingPlans(i);
    console.log(`\n  Plan ${i}:`);
    console.log(`    Duration: ${plan.tenorDays} days`);
    console.log(`    APR: ${Number(plan.aprBps) / 100}%`);
    console.log(`    Min Deposit: ${ethers.formatEther(plan.minDeposit)} tokens`);
    console.log(`    Max Deposit: ${ethers.formatEther(plan.maxDeposit)} tokens`);
    console.log(`    Early Withdraw Penalty: ${Number(plan.earlyWithdrawPenaltyBps) / 100}%`);
    console.log(`    Enabled: ${plan.enabled}`);
  }

  console.log("\n✅ All plans created successfully!");
  console.log("\n⚠️  NOTE: Plan 4 is for TESTING only (1 day = quick maturity)");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});