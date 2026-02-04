import { ethers, deployments } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

/**
 * Script: Rút tiền đúng hạn
 * Mục đích: User rút tiền sau khi đến hạn (maturity)
 */
async function main() {
  console.log("=== WITHDRAW AT MATURITY ===\n");

  const [deployer, user1] = await ethers.getSigners();

  const tokenDeployment = await deployments.get("ERC20Mock");
  const nftDeployment = await deployments.get("SavingBankNFT");
  const savingBankDeployment = await deployments.get("SavingBankUpgradeable");

  const token = await ethers.getContractAt(
    "ERC20Mock",
    tokenDeployment.address,
  );
  const nft = await ethers.getContractAt(
    "SavingBankNFT",
    nftDeployment.address,
  );
  const savingBank = await ethers.getContractAt(
    "SavingBankUpgradeable",
    savingBankDeployment.address,
  );

  const user = user1 || deployer;
  console.log("User:", user.address);
  console.log();

  const depositId = 1n;

  // ---------- Check deposit info ----------
  console.log("📋 Deposit Certificate Info:");
  const depositBefore = await savingBank.getDepositInfo(depositId);
  console.log("  Deposit ID:", depositId.toString());
  console.log("  Owner:", depositBefore.owner);
  console.log(
    "  Principal:",
    ethers.formatEther(depositBefore.principal),
    "tokens",
  );
  console.log(
    "  Maturity:",
    new Date(Number(depositBefore.maturityAt) * 1000).toLocaleString(),
  );
  console.log("  Status:", depositBefore.status);
  console.log();

  // ---------- Calculate interest ----------
  const expectedInterest = await savingBank.getCalculateInterest(depositId);
  console.log(
    "💰 Expected Interest:",
    ethers.formatEther(expectedInterest),
    "tokens",
  );
  console.log();

  // ---------- Fast-forward time nếu chưa đến maturity ----------
  const currentTime = (await ethers.provider.getBlock("latest"))!.timestamp;
  const maturityTime = Number(depositBefore.maturityAt);

  if (currentTime < maturityTime) {
    const secondsToIncrease = maturityTime - currentTime + 1;
    console.log("⏰ Fast-forwarding time...");
    console.log(
      "  Current block time:",
      new Date(currentTime * 1000).toLocaleString(),
    );
    console.log(
      "  Maturity time:     ",
      new Date(maturityTime * 1000).toLocaleString(),
    );
    console.log("  Increasing by:", secondsToIncrease, "seconds");

    await time.increase(secondsToIncrease);

    const newTime = (await ethers.provider.getBlock("latest"))!.timestamp;
    console.log(
      "  New block time:    ",
      new Date(newTime * 1000).toLocaleString(),
    );
    console.log("  ✅ Time fast-forwarded past maturity\n");
  } else {
    console.log("✅ Deposit already matured, no need to fast-forward\n");
  }

  // ---------- Withdraw ----------
  const balanceBefore = await token.balanceOf(user.address);
  console.log("💼 User Balance Before:");
  console.log("  Balance:", ethers.formatEther(balanceBefore), "tokens");
  console.log();

  console.log("💸 Withdrawing...");
  const tx = user1
    ? await savingBank.connect(user1).withdraw(depositId)
    : await savingBank.withdraw(depositId);
  await tx.wait();
  console.log("  ✅ Withdrawn successfully\n");

  // ---------- Check results ----------
  const balanceAfter = await token.balanceOf(user.address);
  const received = balanceAfter - balanceBefore;

  console.log("💼 User Balance After:");
  console.log("  Balance:", ethers.formatEther(balanceAfter), "tokens");
  console.log("  Received:", ethers.formatEther(received), "tokens");
  console.log(
    "  Principal:",
    ethers.formatEther(depositBefore.principal),
    "tokens",
  );
  console.log(
    "  Interest:",
    ethers.formatEther(received - depositBefore.principal),
    "tokens",
  );
  console.log();

  // ---------- Check deposit status ----------
  const depositAfter = await savingBank.getDepositInfo(depositId);
  console.log("📋 Deposit Status After:");
  console.log("  Status:", depositAfter.status); // 1 = Withdrawn
  console.log();

  // ---------- Check NFT burned ----------
  console.log("🎨 NFT Status:");
  try {
    await nft.ownerOf(depositId);
    console.log("  NFT still exists (should not happen)");
  } catch {
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
