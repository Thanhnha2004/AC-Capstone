import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { ethers, upgrades } = hre as any;
  const { deploy, save } = deployments;
  const { deployer, operator } = await getNamedAccounts();

  // Deploy Metadata (with deployer as temp NFT address)
  const NFTMetadata = await ethers.getContractFactory("NFTMetadataUpgradeable");
  const metadataProxy = await upgrades.deployProxy(
    NFTMetadata,
    [deployer, deployer, "ipfs://QmYourBaseHash/"],
    { initializer: "initialize", kind: "uups" }
  );
  await metadataProxy.waitForDeployment();
  const metadataAddress = await metadataProxy.getAddress();

  await save("NFTMetadataUpgradeable", {
    address: metadataAddress,
    abi: JSON.parse(NFTMetadata.interface.formatJson()),
  });

  // Deploy NFT
  const nftDeployment = await deploy("SavingBankNFT", {
    from: deployer,
    args: [deployer, operator || deployer, metadataAddress],
    log: true,
  });

  // Update metadata to point to real NFT
  const metadataContract = await ethers.getContractAt("NFTMetadataUpgradeable", metadataAddress);
  await (await metadataContract.setNFTContract(nftDeployment.address)).wait();
};

export default func;
func.tags = ["NFT"];
func.dependencies = [];