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

  // Get deployed contracts
  const token = await ethers.getContractAt(
    "ERC20Mock",
    "0xe264592FC0402d449E9388108E85C13ED8c76D5a",
  );
  const principalVault = await ethers.getContractAt(
    "PrincipalVault",
    "0x2a0dEb355ac0F1008375e57e93871Bef408B3436",
  );
  const interestVault = await ethers.getContractAt(
    "InterestVault",
    "0x386a5c3308c10c7A5A1F65EAAEf0ec1665Dc3b0E",
  );
  const nft = await ethers.getContractAt(
    "SavingBankNFT",
    "0x396b84f8Ff1cF125Da399F9a7D5A34179c06C81F",
  );
  const savingBank = await ethers.getContractAt(
    "SavingBankV2",
    "0x88A4805e23ceF4DC0Aeb881Dac233872281822e0",
  );

  console.log("📋 Contract Addresses:");
  console.log("  Token:", await token.getAddress());
  console.log("  PrincipalVault:", await principalVault.getAddress());
  console.log("  InterestVault:", await interestVault.getAddress());
  console.log("  NFT:", await nft.getAddress());
  console.log("  SavingBank:", await savingBank.getAddress());
  console.log();

  // Setup NFT
  console.log("⚙️  Setting up NFT...");
  const tx1 = await nft.setSavingBank(await savingBank.getAddress());
  await tx1.wait();
  console.log("  ✅ NFT configured\n");

  // Setup PrincipalVault
  console.log("⚙️  Setting up PrincipalVault...");
  const OPERATOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("OPERATOR_ROLE"));
  const tx2 = await principalVault.grantRole(
    OPERATOR_ROLE,
    await savingBank.getAddress(),
  );
  await tx2.wait();
  console.log("  ✅ PrincipalVault configured\n");

  // Setup InterestVault
  console.log("⚙️  Setting up InterestVault...");
  const tx3 = await interestVault.grantRole(
    OPERATOR_ROLE,
    await savingBank.getAddress(),
  );
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
  const tx5 = await token.approve(await interestVault.getAddress(), fundAmount);
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
