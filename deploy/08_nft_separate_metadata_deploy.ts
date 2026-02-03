import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import "hardhat-deploy";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { ethers, upgrades } = hre as any;
  const { deploy, save } = deployments;
  const { deployer, operator } = await getNamedAccounts();

  console.log("Deploying NFT with Separate Metadata...");

  // 1. Deploy Metadata Contract (Upgradeable)
  const NFTMetadata = await ethers.getContractFactory("NFTMetadataUpgradeable");

  const metadataProxy = await upgrades.deployProxy(
    NFTMetadata,
    [deployer, deployer], // admin, temporary nftContract
    { initializer: "initialize", kind: "uups" },
  );

  await metadataProxy.waitForDeployment();
  const metadataProxyAddress = await metadataProxy.getAddress();

  await save("NFTMetadataUpgradeable", {
    address: metadataProxyAddress,
    abi: JSON.parse(NFTMetadata.interface.formatJson()),
  });

  // 2. Deploy NFT Contract (Non-Upgradeable)
  const nftDeployment = await deploy("SavingBankNFT", {
    from: deployer,
    args: [deployer, operator, metadataProxyAddress],
    log: true,
  });

  // 3. Update Metadata with NFT address
  const metadataInstance = await ethers.getContractAt(
    "NFTMetadataUpgradeable",
    metadataProxyAddress,
  );
  await metadataInstance.setNFTContract(nftDeployment.address);

  console.log("✅ NFT deployed:", nftDeployment.address);
  console.log("✅ Metadata deployed:", metadataProxyAddress);
};

export default func;
func.tags = ["NFTSeparateMetadata", "nft"];
func.dependencies = [];
