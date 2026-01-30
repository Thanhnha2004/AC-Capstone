import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import "hardhat-deploy";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy, get } = deployments;
  const { deployer } = await getNamedAccounts();

  const token = await get("ERC20Mock");
  const principalVault = await get("PrincipalVault");
  const interestVault = await get("InterestVault");
  const nft = await get("SavingBankNFT");

  await deploy("SavingBankV2", {
    from: deployer,
    args: [
      token.address,
      principalVault.address,
      interestVault.address,
      nft.address,
      deployer,
      deployer,
      deployer,
    ],
    log: true,
  });
};

export default func;
func.tags = ["SavingBankV2", "deploy"];
func.dependencies = ["ERC20Mock", "PrincipalVault", "InterestVault", "SavingBankNFT"];