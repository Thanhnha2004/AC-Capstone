import { ethers, deployments } from "hardhat";

/**
 * Script: Xem thông tin sổ tiết kiệm của user
 * Mục đích: Hiển thị tất cả deposits và thông tin chi tiết
 */
async function main() {
  console.log("=== VIEW USER DEPOSITS ===\n");

  const [deployer, user1] = await ethers.getSigners();
  
  const nftDeployment = await deployments.get("SavingBankNFT");
  const savingBankDeployment = await deployments.get("SavingBankUpgradeable");
  
  const nft = await ethers.getContractAt("SavingBankNFT", nftDeployment.address);
  const savingBank = await ethers.getContractAt("SavingBankUpgradeable", savingBankDeployment.address);

  const user = user1 || deployer;
  console.log("User:", user.address);
  console.log();

  // Get all deposit IDs for user
  const depositIds = await savingBank.getUserDepositIds(user.address);

  if (depositIds.length === 0) {
    console.log("❌ User has no deposits");
    return;
  }

  console.log("📊 User has", depositIds.length.toString(), "deposit(s)\n");

  // Status mapping
  const statusNames = ["Active", "Withdrawn", "Early Withdrawn", "Renewed"];

  // Display each deposit
  for (let i = 0; i < depositIds.length; i++) {
    const depositId = depositIds[i];
    console.log("═".repeat(60));
    console.log(`📋 DEPOSIT #${depositId.toString()}`);
    console.log("═".repeat(60));

    // Get deposit info
    const deposit = await savingBank.getDepositInfo(depositId);
    const owner = deposit.owner;
    const planId = deposit.planId;
    const principal = deposit.principal;
    const startAt = deposit.startAt;
    const maturityAt = deposit.maturityAt;
    const status = deposit.status;
    const renewedDepositId = deposit.renewedDepositId;

    // Get plan info
    const plan = await savingBank.getPlanInfo(planId);

    console.log("\n📝 Basic Information:");
    console.log("  Deposit ID:", depositId.toString());
    console.log("  Owner:", owner);
    console.log("  Status:", statusNames[Number(status)]);

    console.log("\n💰 Financial Details:");
    console.log("  Principal:", ethers.formatEther(principal), "tokens");

    // Calculate interest if active
    if (status === 0n) {
      // Active
      const expectedInterest = await savingBank.getCalculateInterest(depositId);
      console.log(
        "  Expected Interest:",
        ethers.formatEther(expectedInterest),
        "tokens",
      );
      console.log(
        "  Total at Maturity:",
        ethers.formatEther(principal + expectedInterest),
        "tokens",
      );
    }

    console.log("\n📅 Timeline:");
    console.log(
      "  Start Time:",
      new Date(Number(startAt) * 1000).toLocaleString(),
    );
    console.log(
      "  Maturity Time:",
      new Date(Number(maturityAt) * 1000).toLocaleString(),
    );

    const now = Math.floor(Date.now() / 1000);
    if (status === 0n) {
      // Active
      if (now < Number(maturityAt)) {
        const daysLeft = Math.ceil((Number(maturityAt) - now) / (24 * 60 * 60));
        console.log("  Days Until Maturity:", daysLeft);
      } else {
        console.log("  ✅ Matured - Ready to withdraw");
      }
    }

    console.log("\n📋 Plan Details:");
    console.log("  Plan ID:", planId.toString());
    console.log("  Duration:", plan.tenorDays.toString(), "days");
    console.log("  APR:", (Number(plan.aprBps) / 100).toString() + "%");
    console.log(
      "  Early Withdraw Penalty:",
      (Number(plan.earlyWithdrawPenaltyBps) / 100).toString() + "%",
    );

    // Check NFT status
    console.log("\n🎨 NFT Certificate:");
    try {
      const nftOwner = await nft.ownerOf(depositId);
      console.log("  Token ID:", depositId.toString());
      console.log("  Owner:", nftOwner);
      console.log("  Status: Active");

      // Get NFT metadata
      const certificateData = await nft.getCertificateData(depositId);
      console.log(
        "  Deposit Amount:",
        ethers.formatEther(certificateData.depositAmount),
        "tokens",
      );
      console.log(
        "  Deposit Time:",
        new Date(Number(certificateData.depositTime) * 1000).toLocaleString(),
      );
    } catch (error) {
      console.log("  Status: Burned (deposit closed)");
    }

    if (status === 3n && renewedDepositId > 0n) {
      // Renewed
      console.log("\n🔄 Renewal Information:");
      console.log("  Renewed to Deposit ID:", renewedDepositId.toString());
    }

    console.log();
  }

  console.log("═".repeat(60));
  console.log("✅ Display completed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});