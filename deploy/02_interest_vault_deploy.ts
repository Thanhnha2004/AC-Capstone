import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import "hardhat-deploy";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy, get } = deployments;
  const { deployer } = await getNamedAccounts();

  const token = await get("ERC20Mock");

  await deploy("InterestVault", {
    from: deployer,
    args: [token.address, deployer, deployer],
    log: true,
  });
};

export default func;
func.tags = ["InterestVault", "deploy"];
func.dependencies = ["ERC20Mock"];