import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { ethers, upgrades } = hre as any;
  const { get, save } = deployments;
  const { deployer, operator } = await getNamedAccounts();

  const token = await get("ERC20Mock");

  // Deploy PrincipalVault
  const PrincipalVault = await ethers.getContractFactory("PrincipalVaultUpgradeable");
  const principalProxy = await upgrades.deployProxy(
    PrincipalVault,
    [token.address, deployer, operator],
    { initializer: "initialize", kind: "uups" }
  );
  await principalProxy.waitForDeployment();

  await save("PrincipalVaultUpgradeable", {
    address: await principalProxy.getAddress(),
    abi: JSON.parse(PrincipalVault.interface.formatJson()),
  });

  // Deploy InterestVault
  const InterestVault = await ethers.getContractFactory("InterestVaultUpgradeable");
  const interestProxy = await upgrades.deployProxy(
    InterestVault,
    [token.address, deployer, operator],
    { initializer: "initialize", kind: "uups" }
  );
  await interestProxy.waitForDeployment();

  await save("InterestVaultUpgradeable", {
    address: await interestProxy.getAddress(),
    abi: JSON.parse(InterestVault.interface.formatJson()),
  });
};

export default func;
func.tags = ["VaultsUpgradeable"];
func.dependencies = ["ERC20Mock"];