import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import "hardhat-deploy";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployments, getNamedAccounts, ethers } = hre as any;
    const { deploy } = deployments;
    const { deployer, admin, operator } = await getNamedAccounts();

    // Proposers: người đề xuất
    const PROPOSERS = [admin, operator];
    
    // Executors: ZeroAddress = ai cũng execute được sau delay
    const EXECUTORS = [ethers.ZeroAddress];
    
    // Admin: quản lý roles
    const ADMIN = admin;

    const timelock = await deploy("SavingBankTimelock", {
        from: deployer,
        args: [PROPOSERS, EXECUTORS, ADMIN],
        log: true,
    });

    console.log("✅ Timelock deployed:", timelock.address);
};

export default func;
func.tags = ["Timelock"];