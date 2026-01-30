import { ethers, deployments } from "hardhat";

/**
 * Script: Rút tiền đúng hạn
 * Mục đích: User rút tiền sau khi đến hạn (maturity)
 */
async function main() {
  console.log("=== WITHDRAW AT MATURITY ===\n");

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

  // Giả sử đã có deposit ID = 1 từ script trước
  const depositId = 1n;

  // Check deposit info
  console.log("📋 Deposit Certificate Info:");
  const depositBefore = await savingBank.getDepositInfo(depositId);
  console.log("  Deposit ID:", depositId.toString());
  console.log("  Owner:", depositBefore.owner);
  console.log("  Principal:", ethers.formatEther(depositBefore.principal), "tokens");
  console.log("  Maturity:", new Date(Number(depositBefore.maturityAt) * 1000).toLocaleString());
  console.log("  Status:", depositBefore.status); // 0 = Active
  console.log();

  // Calculate interest
  const expectedInterest = await savingBank.getCalculateInterest(depositId);
  console.log("💰 Expected Interest:", ethers.formatEther(expectedInterest), "tokens");
  console.log();

  // Check if matured
  const currentTime = Math.floor(Date.now() / 1000);
  const maturityTime = Number(depositBefore.maturityAt);
  
  if (currentTime < maturityTime) {
    const daysLeft = Math.ceil((maturityTime - currentTime) / 86400);
    console.log("⚠️  Deposit not matured yet!");
    console.log("  Days left:", daysLeft);
    console.log("  Maturity date:", new Date(maturityTime * 1000).toLocaleString());
    console.log("\n❌ Cannot withdraw before maturity on testnet.");
    console.log("💡 To test withdraw, run this script on localhost with time.increase()");
    return;
  }

  // Check balance before withdraw
  const balanceBefore = await token.balanceOf(user1.address);
  console.log("💼 User Balance Before:");
  console.log("  Balance:", ethers.formatEther(balanceBefore), "tokens");
  console.log();

  // Withdraw
  console.log("💸 Withdrawing...");
  const tx = await savingBank.connect(user1).withdraw(depositId);
  const receipt = await tx.wait();
  console.log("  ✅ Withdrawn successfully\n");

  // Check balance after withdraw
  const balanceAfter = await token.balanceOf(user1.address);
  const received = balanceAfter - balanceBefore;
  console.log("💼 User Balance After:");
  console.log("  Balance:", ethers.formatEther(balanceAfter), "tokens");
  console.log("  Received:", ethers.formatEther(received), "tokens");
  console.log("  Principal:", ethers.formatEther(depositBefore.principal), "tokens");
  console.log("  Interest:", ethers.formatEther(received - depositBefore.principal), "tokens");
  console.log();

  // Check deposit status
  const depositAfter = await savingBank.getDepositInfo(depositId);
  console.log("📋 Deposit Status After:");
  console.log("  Status:", depositAfter.status); // 1 = Withdrawn
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

  console.log("✅ Withdrawal completed successfully!");
  console.log("  Total received:", ethers.formatEther(received), "tokens");
  console.log("  (Principal + Interest)");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});