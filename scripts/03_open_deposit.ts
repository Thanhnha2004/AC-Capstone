import { ethers, deployments } from "hardhat";

/**
 * Script: Mở sổ tiết kiệm
 * Mục đích: User mở sổ tiết kiệm với plan đã có
 */
async function main() {
  console.log("=== OPEN DEPOSIT CERTIFICATE ===\n");

  const [deployer, user1] = await ethers.getSigners();
  
  const tokenDeployment = await deployments.get("ERC20Mock");
  const nftDeployment = await deployments.get("SavingBankNFT");
  const savingBankDeployment = await deployments.get("SavingBankUpgradeable");
  
  const token = await ethers.getContractAt("ERC20Mock", tokenDeployment.address);
  const nft = await ethers.getContractAt("SavingBankNFT", nftDeployment.address);
  const savingBank = await ethers.getContractAt("SavingBankUpgradeable", savingBankDeployment.address);

  if (!user1) {
    console.error("❌ No user1 account available");
    console.log("Using deployer account instead...");
    const user = deployer;
    
    console.log("User:", user.address);
    console.log("SavingBank:", savingBankDeployment.address);
    console.log();

    // Mint tokens to user
    const mintAmount = ethers.parseEther("10000");
    console.log("💰 Minting tokens to user...");
    const tx1 = await token.mint(user.address, mintAmount);
    await tx1.wait();
    console.log("  ✅ Minted", ethers.formatEther(mintAmount), "tokens\n");

    // User chọn Plan 2 (90 ngày - 8% APR)
    const planId = 2;
    const depositAmount = ethers.parseEther("5000");

    console.log("📋 Selected Plan Info:");
    const plan = await savingBank.getPlanInfo(planId);
    console.log("  Plan ID:", planId);
    console.log("  Duration:", plan.tenorDays.toString(), "days");
    console.log("  APR:", (Number(plan.aprBps) / 100).toString() + "%");
    console.log("  Deposit Amount:", ethers.formatEther(depositAmount), "tokens");
    console.log();

    // Approve tokens
    console.log("✅ Approving tokens...");
    const principalVaultAddress = await savingBank.principalVault();
    const tx2 = await token.approve(principalVaultAddress, depositAmount);
    await tx2.wait();
    console.log("  ✅ Approved for PrincipalVault\n");

    // Open deposit
    console.log("📝 Opening deposit certificate...");
    const tx3 = await savingBank.openDepositCertificate(planId, depositAmount);
    const receipt = await tx3.wait();

    if (!receipt) {
      console.error("❌ Transaction failed - no receipt");
      return;
    }

    console.log("  ✅ Deposit opened\n");

    // Get deposit ID from event
    const event = receipt.logs.find((log: any) => {
      try {
        return (
          savingBank.interface.parseLog(log)?.name === "DepositCertificateOpened"
        );
      } catch {
        return false;
      }
    });

    let depositId = 1n; // default
    if (event) {
      const parsed = savingBank.interface.parseLog(event);
      depositId = parsed?.args[0];
    }

    console.log("📊 Deposit Certificate Info:");
    const deposit = await savingBank.getDepositInfo(depositId);
    console.log("  Deposit ID:", depositId.toString());
    console.log("  Owner:", deposit.owner);
    console.log("  Plan ID:", deposit.planId.toString());
    console.log("  Principal:", ethers.formatEther(deposit.principal), "tokens");
    console.log(
      "  Start Time:",
      new Date(Number(deposit.startAt) * 1000).toLocaleString(),
    );
    console.log(
      "  Maturity Time:",
      new Date(Number(deposit.maturityAt) * 1000).toLocaleString(),
    );
    console.log("  Status:", deposit.status); // 0 = Active
    console.log();

    // Calculate expected interest
    const expectedInterest = await savingBank.getCalculateInterest(depositId);
    console.log(
      "💰 Expected Interest:",
      ethers.formatEther(expectedInterest),
      "tokens",
    );
    console.log();

    // Check NFT ownership
    console.log("🎨 NFT Certificate:");
    const nftOwner = await nft.ownerOf(depositId);
    console.log("  Token ID:", depositId.toString());
    console.log("  Owner:", nftOwner);
    console.log("  Owner matches user:", nftOwner === user.address);
    console.log();

    console.log("✅ Deposit certificate opened successfully!");
    return;
  }

  console.log("User:", user1.address);
  console.log("SavingBank:", savingBankDeployment.address);
  console.log();

  // Mint tokens to user
  const mintAmount = ethers.parseEther("10000");
  console.log("💰 Minting tokens to user...");
  const tx1 = await token.mint(user1.address, mintAmount);
  await tx1.wait();
  console.log("  ✅ Minted", ethers.formatEther(mintAmount), "tokens\n");

  // User chọn Plan 2 (90 ngày - 8% APR)
  const planId = 2;
  const depositAmount = ethers.parseEther("5000");

  console.log("📋 Selected Plan Info:");
  const plan = await savingBank.getPlanInfo(planId);
  console.log("  Plan ID:", planId);
  console.log("  Duration:", plan.tenorDays.toString(), "days");
  console.log("  APR:", (Number(plan.aprBps) / 100).toString() + "%");
  console.log("  Deposit Amount:", ethers.formatEther(depositAmount), "tokens");
  console.log();

  // Approve tokens
  console.log("✅ Approving tokens...");
  const principalVaultAddress = await savingBank.principalVault();
  const tx2 = await token
    .connect(user1)
    .approve(principalVaultAddress, depositAmount);
  await tx2.wait();
  console.log("  ✅ Approved for PrincipalVault\n");

  // Open deposit
  console.log("📝 Opening deposit certificate...");
  const tx3 = await savingBank
    .connect(user1)
    .openDepositCertificate(planId, depositAmount);
  const receipt = await tx3.wait();

  if (!receipt) {
    console.error("❌ Transaction failed - no receipt");
    return;
  }

  console.log("  ✅ Deposit opened\n");

  // Get deposit ID from event
  const event = receipt.logs.find((log: any) => {
    try {
      return (
        savingBank.interface.parseLog(log)?.name === "DepositCertificateOpened"
      );
    } catch {
      return false;
    }
  });

  let depositId = 1n; // default
  if (event) {
    const parsed = savingBank.interface.parseLog(event);
    depositId = parsed?.args[0];
  }

  console.log("📊 Deposit Certificate Info:");
  const deposit = await savingBank.getDepositInfo(depositId);
  console.log("  Deposit ID:", depositId.toString());
  console.log("  Owner:", deposit.owner);
  console.log("  Plan ID:", deposit.planId.toString());
  console.log("  Principal:", ethers.formatEther(deposit.principal), "tokens");
  console.log(
    "  Start Time:",
    new Date(Number(deposit.startAt) * 1000).toLocaleString(),
  );
  console.log(
    "  Maturity Time:",
    new Date(Number(deposit.maturityAt) * 1000).toLocaleString(),
  );
  console.log("  Status:", deposit.status); // 0 = Active
  console.log();

  // Calculate expected interest
  const expectedInterest = await savingBank.getCalculateInterest(depositId);
  console.log(
    "💰 Expected Interest:",
    ethers.formatEther(expectedInterest),
    "tokens",
  );
  console.log();

  // Check NFT ownership
  console.log("🎨 NFT Certificate:");
  const nftOwner = await nft.ownerOf(depositId);
  console.log("  Token ID:", depositId.toString());
  console.log("  Owner:", nftOwner);
  console.log("  Owner matches user:", nftOwner === user1.address);
  console.log();

  console.log("✅ Deposit certificate opened successfully!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});