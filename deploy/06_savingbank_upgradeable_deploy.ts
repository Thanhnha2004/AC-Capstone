import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import "hardhat-deploy";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { ethers, upgrades } = hre as any;
  const { get, save } = deployments;
  const { deployer } = await getNamedAccounts();

  console.log("Deploying SavingBankUpgradeable with account:", deployer);

  const token = await get("ERC20Mock");
const principalVault = await get("PrincipalVaultUpgradeable");
const interestVault = await get("InterestVaultUpgradeable");
  const nft = await get("SavingBankNFT");

  const SavingBank = await ethers.getContractFactory("SavingBankUpgradeable");

  const proxy = await upgrades.deployProxy(
    SavingBank,
    [
      token.address,
      principalVault.address,
      interestVault.address,
      nft.address,
      deployer, // feeReceiver
      deployer, // admin
      deployer, // operator
    ],
    {
      initializer: "initialize",
      kind: "uups",
    },
  );

  await proxy.waitForDeployment();
  const proxyAddress = await proxy.getAddress();
  const implementationAddress = await upgrades.erc1967.getImplementationAddress(
    proxyAddress,
  );

  console.log("Proxy:", proxyAddress);
  console.log("Implementation:", implementationAddress);

  await save("SavingBankUpgradeable", {
    address: proxyAddress,
    abi: JSON.parse(SavingBank.interface.formatJson()),
    implementation: implementationAddress,
  });

  console.log("✅ Deployment completed");
};

export default func;
func.tags = ["SavingBankUpgradeable", "upgradeable"];
func.dependencies = [
  "ERC20Mock",
  "PrincipalVaultUpgradeable",
  "InterestVaultUpgradeable",
  "SavingBankNFT",
];
