import { ethers, upgrades, run } from "hardhat";

async function main() {
  console.log("Starting SavingBank upgrade...");

  const PROXY_ADDRESS = process.env.PROXY_ADDRESS || "";
  if (!PROXY_ADDRESS) {
    throw new Error("Please set PROXY_ADDRESS in .env");
  }

  console.log("Proxy address:", PROXY_ADDRESS);

  // Load new implementation
  console.log("\n📦 Preparing new implementation: SavingBankUpgradeable");
  const SavingBank = await ethers.getContractFactory("SavingBankUpgradeable");

  // Validate upgrade
  console.log("\n🔍 Validating upgrade...");
  try {
    await upgrades.validateUpgrade(PROXY_ADDRESS, SavingBank, {
      kind: "uups",
    });
    console.log("✅ Upgrade validation passed");
  } catch (error) {
    console.error("❌ Upgrade validation failed:");
    throw error;
  }

  // Upgrade proxy
  console.log("\n⬆️  Upgrading proxy...");
  const upgraded = await upgrades.upgradeProxy(PROXY_ADDRESS, SavingBank, {
    kind: "uups",
  });
  await upgraded.waitForDeployment();
  console.log("✅ Proxy upgraded successfully");

  // Get addresses
  const proxyAddress = await upgraded.getAddress();
  const newImplementationAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);

  // Verify
  const network = await ethers.provider.getNetwork();
  if (network.chainId !== 31337n && network.chainId !== 1337n) {
    console.log("\n⏳ Waiting for confirmations...");
    await upgraded.deploymentTransaction()?.wait(6);

    console.log("🔍 Verifying implementation...");
    try {
      await run("verify:verify", {
        address: newImplementationAddress,
        constructorArguments: [],
      });
      console.log("✅ Verified");
    } catch (error: any) {
      console.log(
        error.message.includes("already verified")
          ? "ℹ️  Already verified"
          : `❌ ${error.message}`
      );
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log("🎉 Upgrade completed!");
  console.log("=".repeat(50));
  console.log("Proxy:", proxyAddress);
  console.log("New Implementation:", newImplementationAddress);
  console.log("=".repeat(50));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });