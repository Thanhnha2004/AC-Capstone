import { ethers, deployments } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

/**
 * Script: Gia hạn sổ tiết kiệm
 * Mục đích: User gia hạn sổ khi đến hạn (lãi cũ cộng vào gốc mới)
 */
async function main() {
  console.log("=== RENEW DEPOSIT ===\n");

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

  // Setup: Tạo deposit mới cho user1
  console.log("💰 Setting up new deposit for user1...");
  const mintAmount = ethers.parseEther("10000");
  const depositAmount = ethers.parseEther("5000");

  const tx1 = await token.mint(user1.address, mintAmount);
  await tx1.wait();

  const principalVaultAddress = await savingBank.principalVault();
  const tx2 = await token
    .connect(user1)
    .approve(principalVaultAddress, depositAmount);
  await tx2.wait();

  // Open deposit với Plan 1 (30 ngày - 5% APR)
  const oldPlanId = 1;
  const tx3 = await savingBank
    .connect(user1)
    .openDepositCertificate(oldPlanId, depositAmount);
  await tx3.wait();
  console.log("  ✅ Initial deposit created\n");

  // Get deposit ID
  const userDeposits = await savingBank.getUserDepositIds(user1.address);
  const oldDepositId = userDeposits[userDeposits.length - 1];

  // Check old deposit info
  console.log("📋 Original Deposit Info:");
  const oldDeposit = await savingBank.getDepositInfo(oldDepositId);
  console.log("  Deposit ID:", oldDepositId.toString());
  console.log("  Plan ID:", oldDeposit.planId.toString());
  console.log(
    "  Principal:",
    ethers.formatEther(oldDeposit.principal),
    "tokens",
  );
  console.log(
    "  Maturity:",
    new Date(Number(oldDeposit.maturityAt) * 1000).toLocaleString(),
  );
  console.log();

  // Calculate expected interest
  const expectedInterest = await savingBank.getCalculateInterest(oldDepositId);
  console.log("💰 Expected Interest:");
  console.log("  Interest:", ethers.formatEther(expectedInterest), "tokens");
  console.log(
    "  New Principal (if renewed):",
    ethers.formatEther(oldDeposit.principal + expectedInterest),
    "tokens",
  );
  console.log();

  // Fast forward to maturity
  const maturityTime = oldDeposit.maturityAt;
  const currentTime = await time.latest();
  const timeToForward = Number(maturityTime) - currentTime + 1;

  console.log("⏰ Fast forwarding to maturity...");
  await time.increase(timeToForward);
  console.log("  ✅ Reached maturity time\n");

  // Renew deposit với Plan 2 (90 ngày - 8% APR)
  const newPlanId = 2;
  console.log("📝 Renewing deposit...");
  console.log("  Old Plan:", oldPlanId, "(30 days - 5% APR)");
  console.log("  New Plan:", newPlanId, "(90 days - 8% APR)");

  const tx4 = await savingBank.connect(user1).renew(oldDepositId, newPlanId);
  const receipt = await tx4.wait();
  console.log("  ✅ Deposit renewed\n");

  // Get new deposit ID from user deposits
  const newUserDeposits = await savingBank.getUserDepositIds(user1.address);
  const newDepositId = newUserDeposits[newUserDeposits.length - 1];

  // Check old deposit status
  console.log("📋 Old Deposit Status:");
  const oldDepositAfter = await savingBank.getDepositInfo(oldDepositId);
  console.log("  Status:", oldDepositAfter.status); // 3 = Renewed
  console.log(
    "  Renewed Deposit ID:",
    oldDepositAfter.renewedDepositId.toString(),
  );
  console.log();

  // Check new deposit info
  console.log("📋 New Deposit Info:");
  const newDeposit = await savingBank.getDepositInfo(newDepositId);
  console.log("  Deposit ID:", newDepositId.toString());
  console.log("  Plan ID:", newDeposit.planId.toString());
  console.log(
    "  Principal:",
    ethers.formatEther(newDeposit.principal),
    "tokens",
  );
  console.log(
    "  Start Time:",
    new Date(Number(newDeposit.startAt) * 1000).toLocaleString(),
  );
  console.log(
    "  Maturity Time:",
    new Date(Number(newDeposit.maturityAt) * 1000).toLocaleString(),
  );
  console.log("  Status:", newDeposit.status); // 0 = Active
  console.log();

  // Verify principal increase
  const principalIncrease = newDeposit.principal - oldDeposit.principal;
  console.log("💰 Principal Comparison:");
  console.log(
    "  Old Principal:",
    ethers.formatEther(oldDeposit.principal),
    "tokens",
  );
  console.log(
    "  Interest Added:",
    ethers.formatEther(principalIncrease),
    "tokens",
  );
  console.log(
    "  New Principal:",
    ethers.formatEther(newDeposit.principal),
    "tokens",
  );
  console.log();

  // Check NFT
  console.log("🎨 NFT Status:");
  try {
    await nft.ownerOf(oldDepositId);
    console.log("  Old NFT still exists (should not happen)");
  } catch (error) {
    console.log("  ✅ Old NFT burned");
  }

  const newNftOwner = await nft.ownerOf(newDepositId);
  console.log("  ✅ New NFT minted");
  console.log("  New NFT Owner:", newNftOwner);
  console.log("  Owner matches user:", newNftOwner === user1.address);
  console.log();

  // Calculate new expected interest
  const newExpectedInterest = await savingBank.getCalculateInterest(
    newDepositId,
  );
  console.log("💰 New Expected Interest (at maturity):");
  console.log("  Interest:", ethers.formatEther(newExpectedInterest), "tokens");
  console.log(
    "  Total at maturity:",
    ethers.formatEther(newDeposit.principal + newExpectedInterest),
    "tokens",
  );
  console.log();

  console.log("✅ Deposit renewed successfully!");
  console.log("  🔄 Old deposit marked as renewed");
  console.log("  📝 New deposit created with compounded principal");
  console.log("  🎨 NFT updated");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
