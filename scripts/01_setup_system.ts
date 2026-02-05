import { ethers, deployments } from "hardhat";

/**
 * Script: Setup hệ thống sau khi deploy
 * Mục đích: Cấu hình các contract để hoạt động với nhau
 *
 * ✅ UPDATED FOR UPGRADEABLE CONTRACTS + NFTMetadataUpgradeable
 */
async function main() {
  console.log("=== SETUP SYSTEM (UPGRADEABLE) ===\n");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log();

  // ✅ Get deployed contracts - UPGRADEABLE VERSIONS
  const tokenDeployment = await deployments.get("ERC20Mock");
  const principalVaultDeployment = await deployments.get(
    "PrincipalVaultUpgradeable",
  );
  const interestVaultDeployment = await deployments.get(
    "InterestVaultUpgradeable",
  );
  const nftDeployment = await deployments.get("SavingBankNFT");
  const nftMetadataDeployment = await deployments.get("NFTMetadataUpgradeable"); // ✅ NEW
  const savingBankDeployment = await deployments.get("SavingBankUpgradeable");
  const timelockDeployment = await deployments.get("SavingBankTimelock");

  // ✅ Load contracts with UPGRADEABLE names
  const token = await ethers.getContractAt(
    "ERC20Mock",
    tokenDeployment.address,
  );
  const principalVault = await ethers.getContractAt(
    "PrincipalVaultUpgradeable",
    principalVaultDeployment.address,
  );
  const interestVault = await ethers.getContractAt(
    "InterestVaultUpgradeable",
    interestVaultDeployment.address,
  );
  const nft = await ethers.getContractAt(
    "SavingBankNFT",
    nftDeployment.address,
  );
  const nftMetadata = await ethers.getContractAt(
    "NFTMetadataUpgradeable",
    nftMetadataDeployment.address,
  ); 
  const savingBank = await ethers.getContractAt(
    "SavingBankUpgradeable",
    savingBankDeployment.address,
  );
  const timelock = await ethers.getContractAt(
    "SavingBankTimelock",
    timelockDeployment.address,
  );

  console.log("📋 Contract Addresses:");
  console.log("  Token:", tokenDeployment.address);
  console.log("  PrincipalVault:", principalVaultDeployment.address);
  console.log("  InterestVault:", interestVaultDeployment.address);
  console.log("  NFT:", nftDeployment.address);
  console.log("  NFTMetadata:", nftMetadataDeployment.address); // ✅ NEW
  console.log("  SavingBank:", savingBankDeployment.address);
  console.log("  Timelock:", timelockDeployment.address);
  console.log();

  // ✅ NEW: Setup NFTMetadata - Set NFT contract address
  console.log("⚙️  Setting up NFTMetadata...");
  const tx0 = await nftMetadata.setNFTContract(nftDeployment.address);
  await tx0.wait();
  console.log("  ✅ NFTMetadata.setNFTContract()");
  console.log("     NFT contract address set to:", nftDeployment.address, "\n");

  // Setup NFT - Grant ADMIN_ROLE quyền set SavingBank
  console.log("⚙️  Setting up NFT...");
  const tx1 = await nft.setSavingBank(savingBankDeployment.address);
  await tx1.wait();
  console.log("  ✅ NFT.setSavingBank()");
  console.log("     SavingBank address set to:", savingBankDeployment.address);
  
  // ✅ NEW: Set metadata contract in NFT
  const tx1b = await nft.setMetadataContract(nftMetadataDeployment.address);
  await tx1b.wait();
  console.log("  ✅ NFT.setMetadataContract()");
  console.log("     Metadata contract address set to:", nftMetadataDeployment.address, "\n");

  // Setup PrincipalVault
  console.log("⚙️  Setting up PrincipalVault...");
  const OPERATOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("OPERATOR_ROLE"));
  const tx2 = await principalVault.grantRole(
    OPERATOR_ROLE,
    savingBankDeployment.address,
  );
  await tx2.wait();
  console.log("  ✅ PrincipalVault.grantRole(OPERATOR_ROLE)");
  console.log("     Granted to:", savingBankDeployment.address, "\n");

  // Setup InterestVault
  console.log("⚙️  Setting up InterestVault...");
  const tx3 = await interestVault.grantRole(
    OPERATOR_ROLE,
    savingBankDeployment.address,
  );
  await tx3.wait();
  console.log("  ✅ InterestVault.grantRole(OPERATOR_ROLE)");
  console.log("     Granted to:", savingBankDeployment.address, "\n");

  // Setup Timelock Roles
  console.log("⚙️  Setting up Timelock roles...");
  const EXECUTOR_ROLE = await timelock.EXECUTOR_ROLE();
  const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();

  const tx7 = await timelock.grantRole(EXECUTOR_ROLE, deployer.address);
  await tx7.wait();
  console.log("  ✅ Timelock.grantRole(EXECUTOR_ROLE)");
  console.log("     Granted to:", deployer.address);

  const tx8 = await timelock.grantRole(PROPOSER_ROLE, deployer.address);
  await tx8.wait();
  console.log("  ✅ Timelock.grantRole(PROPOSER_ROLE)");
  console.log("     Granted to:", deployer.address, "\n");

  // Mint tokens to deployer
  console.log("💰 Minting tokens...");
  const mintAmount = ethers.parseEther("1000000"); // 1M tokens
  const tx4 = await token.mint(deployer.address, mintAmount);
  await tx4.wait();
  console.log("  ✅ Minted", ethers.formatEther(mintAmount), "tokens to deployer\n");

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
  console.log("\n📊 Summary:");
  console.log("  - All contracts are UPGRADEABLE (except NFT & Timelock)");
  console.log("  - NFTMetadata ↔ NFT: Connected");
  console.log("  - NFT ↔ SavingBank: Connected");
  console.log("  - Vaults ↔ SavingBank: Roles granted");
  console.log("  - Timelock: Roles configured");
  console.log("  - InterestVault: Funded");
  console.log("  - Ready to create plans!");
  console.log("\n💡 Next steps:");
  console.log("  1. Create saving plans: npx hardhat run scripts/create-plans.js");
  console.log("  2. Start blockchain listener for auto-metadata generation");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});