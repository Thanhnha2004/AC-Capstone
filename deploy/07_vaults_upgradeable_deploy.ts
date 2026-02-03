import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import "hardhat-deploy";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { ethers, upgrades } = hre as any;
  const { get, save } = deployments;
  const { deployer, operator } = await getNamedAccounts();

  console.log("Deploying Vaults Upgradeable with account:", deployer);

  // Get token dependency
  const token = await get("ERC20Mock");

  // ====================================
  // 1. Deploy PrincipalVault Upgradeable
  // ====================================
  console.log("\n📦 Deploying PrincipalVaultUpgradeable...");
  
  const PrincipalVault = await ethers.getContractFactory("PrincipalVaultUpgradeable");
  
  const principalProxy = await upgrades.deployProxy(
    PrincipalVault,
    [
      token.address,
      deployer, // admin
      operator, // operator
    ],
    {
      initializer: "initialize",
      kind: "uups",
    }
  );

  await principalProxy.waitForDeployment();
  const principalProxyAddress = await principalProxy.getAddress();
  const principalImplAddress = await upgrades.erc1967.getImplementationAddress(
    principalProxyAddress
  );

  console.log("✅ PrincipalVaultUpgradeable Proxy:", principalProxyAddress);
  console.log("   Implementation:", principalImplAddress);

  await save("PrincipalVaultUpgradeable", {
    address: principalProxyAddress,
    abi: JSON.parse(PrincipalVault.interface.formatJson()),
    implementation: principalImplAddress,
  });

  // ====================================
  // 2. Deploy InterestVault Upgradeable
  // ====================================
  console.log("\n📦 Deploying InterestVaultUpgradeable...");
  
  const InterestVault = await ethers.getContractFactory("InterestVaultUpgradeable");
  
  const interestProxy = await upgrades.deployProxy(
    InterestVault,
    [
      token.address,
      deployer, // admin
      operator, // operator
    ],
    {
      initializer: "initialize",
      kind: "uups",
    }
  );

  await interestProxy.waitForDeployment();
  const interestProxyAddress = await interestProxy.getAddress();
  const interestImplAddress = await upgrades.erc1967.getImplementationAddress(
    interestProxyAddress
  );

  console.log("✅ InterestVaultUpgradeable Proxy:", interestProxyAddress);
  console.log("   Implementation:", interestImplAddress);

  await save("InterestVaultUpgradeable", {
    address: interestProxyAddress,
    abi: JSON.parse(InterestVault.interface.formatJson()),
    implementation: interestImplAddress,
  });

  // ====================================
  // 3. Verify on Etherscan (if not local)
  // ====================================
  if (hre.network.name !== "localhost" && hre.network.name !== "hardhat") {
    console.log("\n⏳ Waiting for block confirmations...");
    await principalProxy.deploymentTransaction()?.wait(6);
    await interestProxy.deploymentTransaction()?.wait(6);

    console.log("\n🔍 Verifying implementations...");
    
    try {
      await hre.run("verify:verify", {
        address: principalImplAddress,
        constructorArguments: [],
      });
      console.log("✅ PrincipalVault implementation verified");
    } catch (error: any) {
      console.log(error.message.includes("already verified") 
        ? "ℹ️  PrincipalVault already verified" 
        : `❌ ${error.message}`);
    }

    try {
      await hre.run("verify:verify", {
        address: interestImplAddress,
        constructorArguments: [],
      });
      console.log("✅ InterestVault implementation verified");
    } catch (error: any) {
      console.log(error.message.includes("already verified") 
        ? "ℹ️  InterestVault already verified" 
        : `❌ ${error.message}`);
    }
  }

  console.log("\n✅ Vaults Deployment completed");
};

export default func;
func.tags = ["VaultsUpgradeable", "upgradeable"];
func.dependencies = ["ERC20Mock"];