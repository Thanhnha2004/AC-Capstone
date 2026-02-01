import { ethers, deployments } from "hardhat";

/**
 * Script: Setup hệ thống sau khi deploy
 * Mục đích: Cấu hình các contract để hoạt động với nhau
 */
async function main() {
  console.log("=== SETUP SYSTEM ===\n");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log();

  // Get deployed contracts - LẤY ĐỘNG TỪ DEPLOYMENTS
  const tokenDeployment = await deployments.get("ERC20Mock");
  const principalVaultDeployment = await deployments.get("PrincipalVault");
  const interestVaultDeployment = await deployments.get("InterestVault");
  const nftDeployment = await deployments.get("SavingBankNFT");
  const savingBankDeployment = await deployments.get("SavingBankV2");

  const token = await ethers.getContractAt("ERC20Mock", tokenDeployment.address);
  const principalVault = await ethers.getContractAt("PrincipalVault", principalVaultDeployment.address);
  const interestVault = await ethers.getContractAt("InterestVault", interestVaultDeployment.address);
  const nft = await ethers.getContractAt("SavingBankNFT", nftDeployment.address);
  const savingBank = await ethers.getContractAt("SavingBankV2", savingBankDeployment.address);

  console.log("📋 Contract Addresses:");
  console.log("  Token:", tokenDeployment.address);
  console.log("  PrincipalVault:", principalVaultDeployment.address);
  console.log("  InterestVault:", interestVaultDeployment.address);
  console.log("  NFT:", nftDeployment.address);
  console.log("  SavingBank:", savingBankDeployment.address);
  console.log();

  // Setup NFT - Grant ADMIN_ROLE quyền set SavingBank
  console.log("⚙️  Setting up NFT...");
  const tx1 = await nft.setSavingBank(savingBankDeployment.address);
  await tx1.wait();
  console.log("  ✅ NFT configured\n");

  // Setup PrincipalVault
  console.log("⚙️  Setting up PrincipalVault...");
  const OPERATOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("OPERATOR_ROLE"));
  const tx2 = await principalVault.grantRole(OPERATOR_ROLE, savingBankDeployment.address);
  await tx2.wait();
  console.log("  ✅ PrincipalVault configured\n");

  // Setup InterestVault
  console.log("⚙️  Setting up InterestVault...");
  const tx3 = await interestVault.grantRole(OPERATOR_ROLE, savingBankDeployment.address);
  await tx3.wait();
  console.log("  ✅ InterestVault configured\n");

  // Mint tokens to deployer
  console.log("💰 Minting tokens...");
  const mintAmount = ethers.parseEther("1000000"); // 1M tokens
  const tx4 = await token.mint(deployer.address, mintAmount);
  await tx4.wait();
  console.log("  ✅ Minted", ethers.formatEther(mintAmount), "tokens\n");

  // Fund InterestVault
  console.log("💰 Funding InterestVault...");
  const fundAmount = ethers.parseEther("100000"); // 100K tokens cho lãi
  const tx5 = await token.approve(interestVaultDeployment.address, fundAmount);
  await tx5.wait();
  const tx6 = await interestVault.depositFund(fundAmount);
  await tx6.wait();
  console.log(
    "  ✅ InterestVault funded with",
    ethers.formatEther(fundAmount),
    "tokens\n",
  );

  console.log("✅ System setup completed!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});