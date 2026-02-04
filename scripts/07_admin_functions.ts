import { ethers, deployments } from "hardhat";

/**
 * Script: Các chức năng Admin
 * Mục đích: Test các chức năng quản trị hệ thống
 */
async function main() {
  console.log("=== ADMIN FUNCTIONS ===\n");

  const [deployer] = await ethers.getSigners();
  
  const tokenDeployment = await deployments.get("ERC20Mock");
  const principalVaultDeployment = await deployments.get("PrincipalVaultUpgradeable");
  const interestVaultDeployment = await deployments.get("InterestVaultUpgradeable");
  const savingBankDeployment = await deployments.get("SavingBankUpgradeable");
  
  const token = await ethers.getContractAt("ERC20Mock", tokenDeployment.address);
  const principalVault = await ethers.getContractAt("PrincipalVaultUpgradeable", principalVaultDeployment.address);
  const interestVault = await ethers.getContractAt("InterestVaultUpgradeable", interestVaultDeployment.address);
  const savingBank = await ethers.getContractAt("SavingBankUpgradeable", savingBankDeployment.address);

  console.log("Admin:", deployer.address);
  console.log();

  // 1. Check vault balances
  console.log("💰 Current Vault Balances:");
  const principalBalance = await principalVault.getBalance();
  const interestBalance = await interestVault.getBalance();
  console.log(
    "  PrincipalVaultUpgradeable:",
    ethers.formatEther(principalBalance),
    "tokens",
  );
  console.log(
    "  InterestVaultUpgradeable:",
    ethers.formatEther(interestBalance),
    "tokens",
  );
  console.log();

  // 2. Update plan status (disable/enable)
  console.log("📝 Testing Plan Status Update:");
  const planId = 1;

  // Get current status
  let plan = await savingBank.getPlanInfo(planId);
  console.log(
    "  Plan",
    planId,
    "current status:",
    plan.enabled ? "Enabled" : "Disabled",
  );

  // Disable plan
  console.log("  Disabling plan", planId, "...");
  const tx1 = await savingBank.updatePlanStatus(planId, false);
  await tx1.wait();

  plan = await savingBank.getPlanInfo(planId);
  console.log(
    "  Plan",
    planId,
    "new status:",
    plan.enabled ? "Enabled" : "Disabled",
  );

  // Re-enable plan
  console.log("  Re-enabling plan", planId, "...");
  const tx2 = await savingBank.updatePlanStatus(planId, true);
  await tx2.wait();

  plan = await savingBank.getPlanInfo(planId);
  console.log(
    "  ✅ Plan",
    planId,
    "status:",
    plan.enabled ? "Enabled" : "Disabled",
  );
  console.log();

  // 3. Update plan parameters
  console.log("📝 Testing Plan Parameter Update:");
  console.log("  Original Plan 1:");
  const oldPlan = await savingBank.getPlanInfo(1);
  console.log("    Duration:", oldPlan.tenorDays.toString(), "days");
  console.log("    APR:", (Number(oldPlan.aprBps) / 100).toString() + "%");
  console.log(
    "    Min Deposit:",
    ethers.formatEther(oldPlan.minDeposit),
    "tokens",
  );

  // Update plan (increase APR from 5% to 6%)
  console.log("  Updating Plan 1 (increasing APR to 6%)...");
  const tx3 = await savingBank.updatePlan(
    1, // planId
    30, // same duration
    600, // 6% APR (increased from 5%)
    ethers.parseEther("100"), // same min
    ethers.parseEther("10000"), // same max
    5000, // same penalty
  );
  await tx3.wait();

  const newPlan = await savingBank.getPlanInfo(1);
  console.log("  ✅ Updated Plan 1:");
  console.log("    Duration:", newPlan.tenorDays.toString(), "days");
  console.log("    APR:", (Number(newPlan.aprBps) / 100).toString() + "%");
  console.log(
    "    Min Deposit:",
    ethers.formatEther(newPlan.minDeposit),
    "tokens",
  );
  console.log();

  // 4. Pause/Unpause contract
  console.log("⏸️  Testing Pause/Unpause:");
  console.log("  Pausing SavingBank...");
  const tx4 = await savingBank.pause();
  await tx4.wait();
  console.log("  ✅ SavingBank paused");

  console.log("  Unpausing SavingBank...");
  const tx5 = await savingBank.unpause();
  await tx5.wait();
  console.log("  ✅ SavingBank unpaused");
  console.log();

  // 5. Fund management - Add funds to InterestVaultUpgradeable
  console.log("💰 Testing Vault Fund Management:");
  const additionalFund = ethers.parseEther("10000");

  console.log(
    "  Adding",
    ethers.formatEther(additionalFund),
    "tokens to InterestVaultUpgradeable...",
  );
  const tx6 = await token.approve(interestVaultDeployment.address, additionalFund);
  await tx6.wait();
  const tx7 = await interestVault.depositFund(additionalFund);
  await tx7.wait();

  const newInterestBalance = await interestVault.getBalance();
  console.log(
    "  ✅ InterestVaultUpgradeable new balance:",
    ethers.formatEther(newInterestBalance),
    "tokens",
  );
  console.log();

  // 6. Check system stats
  console.log("📊 System Statistics:");
  const nextPlanId = await savingBank.nextPlanId();
  const nextDepositId = await savingBank.nextDepositId();
  console.log("  Total Plans Created:", (nextPlanId - 1n).toString());
  console.log("  Total Deposits Created:", (nextDepositId - 1n).toString());
  console.log(
    "  PrincipalVaultUpgradeable Balance:",
    ethers.formatEther(principalBalance),
    "tokens",
  );
  console.log(
    "  InterestVaultUpgradeable Balance:",
    ethers.formatEther(newInterestBalance),
    "tokens",
  );
  console.log();

  console.log("✅ Admin functions tested successfully!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});