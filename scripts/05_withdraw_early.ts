import { ethers, deployments } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

/**
 * Script: Rút tiền trước hạn
 * Mục đích: User rút tiền trước khi đến hạn (bị penalty)
 */
async function main() {
  console.log("=== EARLY WITHDRAWAL ===\n");

  const [deployer, user1] = await ethers.getSigners();
  const token = await ethers.getContractAt(
    "ERC20Mock",
    "0xe264592FC0402d449E9388108E85C13ED8c76D5a",
  );
  const nft = await ethers.getContractAt(
    "SavingBankNFT",
    "0x396b84f8Ff1cF125Da399F9a7D5A34179c06C81F",
  );
  const savingBank = await ethers.getContractAt(
    "SavingBankV2",
    "0x88A4805e23ceF4DC0Aeb881Dac233872281822e0",
  );

  console.log("User:", user1.address);
  console.log();

  // Mint tokens và tạo deposit mới cho user1
  console.log("💰 Setting up new deposit for user1...");
  const mintAmount = ethers.parseEther("10000");
  const depositAmount = ethers.parseEther("3000");

  const tx1 = await token.mint(user1.address, mintAmount);
  await tx1.wait();

  const principalVaultAddress = await savingBank.principalVault();
  const tx2 = await token
    .connect(user1)
    .approve(principalVaultAddress, depositAmount);
  await tx2.wait();

  // Open deposit với Plan 2 (90 ngày - 30% penalty)
  const planId = 2;
  const tx3 = await savingBank
    .connect(user1)
    .openDepositCertificate(planId, depositAmount);
  await tx3.wait();
  console.log("  ✅ Deposit created\n");

  // Get deposit ID (assume it's 2 if this is the second deposit)
  const userDeposits = await savingBank.getUserDepositIds(user1.address);
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

  // // Fast forward time but not to maturity (only 30 days out of 90)
  // console.log("⏰ Fast forwarding 30 days (1/3 of duration)...");
  // await time.increase(30 * 24 * 60 * 60); // 30 days
  // const currentTime = await time.latest();
  // console.log("  Current time:", new Date(currentTime * 1000).toLocaleString());
  // console.log();

  // Check balance before withdraw
  const balanceBefore = await token.balanceOf(user1.address);
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
  const tx = await savingBank.connect(user1).earlyWithdraw(depositId);
  const receipt = await tx.wait();
  console.log("  ✅ Early withdrawal completed\n");

  // Check balance after withdraw
  const balanceAfter = await token.balanceOf(user1.address);
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