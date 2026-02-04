import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { ethers, upgrades } = hre as any;
  const { get, save } = deployments;
  const { deployer } = await getNamedAccounts();

  const token = await get("ERC20Mock");
  const principalVault = await get("PrincipalVaultUpgradeable");
  const interestVault = await get("InterestVaultUpgradeable");
  const nft = await get("SavingBankNFT");
  const timelock = await get("SavingBankTimelock");

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
      timelock.address, 
    ],
    { initializer: "initialize", kind: "uups" }
  );
  await proxy.waitForDeployment();

  await save("SavingBankUpgradeable", {
    address: await proxy.getAddress(),
    abi: JSON.parse(SavingBank.interface.formatJson()),
  });
};

export default func;
func.tags = ["SavingBankUpgradeable"];
func.dependencies = ["ERC20Mock", "PrincipalVaultUpgradeable", "InterestVaultUpgradeable", "SavingBankNFT"];