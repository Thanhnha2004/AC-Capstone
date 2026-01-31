import { ethers, deployments } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

/**
 * Script: Rút tiền trước hạn
 * Mục đích: User rút tiền trước khi đến hạn (bị penalty)
 */
async function main() {
  console.log("=== EARLY WITHDRAWAL ===\n");

  const [deployer, user1] = await ethers.getSigners();
  
  const tokenDeployment = await deployments.get("ERC20Mock");
  const nftDeployment = await deployments.get("SavingBankNFT");
  const savingBankDeployment = await deployments.get("SavingBankV2");
  
  const token = await ethers.getContractAt("ERC20Mock", tokenDeployment.address);
  const nft = await ethers.getContractAt("SavingBankNFT", nftDeployment.address);
  const savingBank = await ethers.getContractAt("SavingBankV2", savingBankDeployment.address);

  const user = user1 || deployer;
  console.log("User:", user.address);
  console.log();

  // Mint tokens và tạo deposit mới cho user
  console.log("💰 Setting up new deposit for user...");
  const mintAmount = ethers.parseEther("10000");
  const depositAmount = ethers.parseEther("3000");

  const tx1 = await token.mint(user.address, mintAmount);
  await tx1.wait();

  const principalVaultAddress = await savingBank.principalVault();
  const tx2 = user1
    ? await token.connect(user1).approve(principalVaultAddress, depositAmount)
    : await token.approve(principalVaultAddress, depositAmount);
  await tx2.wait();

  // Open deposit với Plan 2 (90 ngày - 30% penalty)
  const planId = 2;
  const tx3 = user1
    ? await savingBank.connect(user1).openDepositCertificate(planId, depositAmount)
    : await savingBank.openDepositCertificate(planId, depositAmount);
  await tx3.wait();
  console.log("  ✅ Deposit created\n");

  // Get deposit ID
  const userDeposits = await savingBank.getUserDepositIds(user.address);
  const depositId = userDeposits[userDeposits.length - 1];

  // Check deposit info
  console.log("📋 Deposit Certificate Info:");
  const deposit = await savingBank.getDepositInfo(depositId);
  console.log("  Deposit ID:", depositId.toString());
  console.log("  Principal:", ethers.formatEther(deposit.principal), "tokens");
  console.log(
    "  Start Time:",
    new Date(Number(deposit.startAt) * 1000).toLocaleString(),
  );
  console.log(
    "  Maturity Time:",
    new Date(Number(deposit.maturityAt) * 1000).toLocaleString(),
  );
  console.log();

  // Get plan info to show penalty
  const plan = await savingBank.getPlanInfo(planId);
  console.log("📋 Plan Info:");
  console.log("  Duration:", plan.tenorDays.toString(), "days");
  console.log(
    "  Early Withdraw Penalty:",
    (Number(plan.earlyWithdrawPenaltyBps) / 100).toString() + "%",
  );
  console.log();

  // Check balance before withdraw
  const balanceBefore = await token.balanceOf(user.address);
  console.log("💼 User Balance Before:");
  console.log("  Balance:", ethers.formatEther(balanceBefore), "tokens");
  console.log();

  // Calculate penalty
  const principal = deposit.principal;
  const penaltyRate = plan.earlyWithdrawPenaltyBps;
  const penalty = (principal * penaltyRate) / 10000n;
  const expectedReturn = principal - penalty;

  console.log("💸 Expected Early Withdrawal:");
  console.log("  Principal:", ethers.formatEther(principal), "tokens");
  console.log("  Penalty Rate:", (Number(penaltyRate) / 100).toString() + "%");
  console.log("  Penalty Amount:", ethers.formatEther(penalty), "tokens");
  console.log(
    "  Expected Return:",
    ethers.formatEther(expectedReturn),
    "tokens",
  );
  console.log();

  // Early withdraw
  console.log("💸 Performing early withdrawal...");
  const tx = user1
    ? await savingBank.connect(user1).earlyWithdraw(depositId)
    : await savingBank.earlyWithdraw(depositId);
  await tx.wait();
  console.log("  ✅ Early withdrawal completed\n");

  // Check balance after withdraw
  const balanceAfter = await token.balanceOf(user.address);
  const received = balanceAfter - balanceBefore;
  console.log("💼 User Balance After:");
  console.log("  Balance:", ethers.formatEther(balanceAfter), "tokens");
  console.log("  Received:", ethers.formatEther(received), "tokens");
  console.log("  Lost to penalty:", ethers.formatEther(penalty), "tokens");
  console.log();

  // Check deposit status
  const depositAfter = await savingBank.getDepositInfo(depositId);
  console.log("📋 Deposit Status After:");
  console.log("  Status:", depositAfter.status); // 2 = EarlyWithdrawn
  console.log();

  // Check NFT burned
  console.log("🎨 NFT Status:");
  try {
    await nft.ownerOf(depositId);
    console.log("  NFT still exists (should not happen)");
  } catch (error) {
    console.log("  ✅ NFT burned successfully");
  }
  console.log();

  console.log("✅ Early withdrawal completed!");
  console.log("  ⚠️  User received less due to penalty");
  console.log("  Received:", ethers.formatEther(received), "tokens");
  console.log("  Penalty:", ethers.formatEther(penalty), "tokens");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});