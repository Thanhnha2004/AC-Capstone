import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, ethers } = hre as any;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const PROPOSERS = [deployer];
  const EXECUTORS = [ethers.ZeroAddress]; // Anyone can execute
  const ADMIN = deployer;

  await deploy("SavingBankTimelock", {
    from: deployer,
    args: [PROPOSERS, EXECUTORS, ADMIN],
    log: true,
  });
};

export default func;
func.tags = ["Timelock"];
func.dependencies = [];