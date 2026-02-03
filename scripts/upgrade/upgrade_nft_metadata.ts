// test/NFTSeparateMetadata.test.ts
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

describe("NFT with Separate Metadata", function () {
  async function deployFixture() {
    const [admin, operator, user1] = await ethers.getSigners();

    // Deploy Metadata (Upgradeable)
    const NFTMetadata = await ethers.getContractFactory("NFTMetadataUpgradeable");
    const metadataProxy = await upgrades.deployProxy(
      NFTMetadata,
      [admin.address, admin.address],
      { initializer: "initialize", kind: "uups" }
    );
    await metadataProxy.waitForDeployment();
    const metadataAddress = await metadataProxy.getAddress();

    // Deploy NFT (Non-Upgradeable)
    const SavingBankNFT = await ethers.getContractFactory("SavingBankNFT");
    const nft = await SavingBankNFT.deploy(
      admin.address,
      operator.address,
      metadataAddress
    );
    await nft.waitForDeployment();
    const nftAddress = await nft.getAddress();

    // Update metadata with NFT address
    await metadataProxy.setNFTContract(nftAddress);

    // Set SavingBank to admin for testing
    await nft.connect(admin).setSavingBank(admin.address);

    return { nft, metadataProxy, admin, operator, user1, metadataAddress };
  }

  describe("Metadata Upgrade", function () {
    it("Should preserve certificate data after metadata upgrade", async function () {
      const { nft, metadataProxy, admin, metadataAddress } =
        await loadFixture(deployFixture);

      // Mint NFT
      await nft.connect(admin).mint(admin.address, 1, 1, ethers.parseEther("1000"));

      // Get data before upgrade
      const dataBefore = await metadataProxy.getCertificateData(1);
      const uriBefore = await nft.tokenURI(1);

      // Upgrade metadata contract
      const NFTMetadataV2 = await ethers.getContractFactory("NFTMetadataUpgradeable");
      const upgraded = await upgrades.upgradeProxy(metadataAddress, NFTMetadataV2);

      // Get data after upgrade
      const dataAfter = await upgraded.getCertificateData(1);
      const uriAfter = await nft.tokenURI(1);

      expect(dataAfter.depositId).to.equal(dataBefore.depositId);
      expect(dataAfter.planId).to.equal(dataBefore.planId);
      expect(dataAfter.depositAmount).to.equal(dataBefore.depositAmount);
      expect(uriAfter).to.equal(uriBefore);
    });

    it("Should allow minting after metadata upgrade", async function () {
      const { nft, metadataProxy, admin, metadataAddress } =
        await loadFixture(deployFixture);

      // Upgrade metadata first
      const NFTMetadataV2 = await ethers.getContractFactory("NFTMetadataUpgradeable");
      await upgrades.upgradeProxy(metadataAddress, NFTMetadataV2);

      // Mint after upgrade
      await expect(
        nft.connect(admin).mint(admin.address, 1, 1, ethers.parseEther("1000"))
      ).to.not.be.reverted;

      // Verify metadata stored correctly
      const data = await metadataProxy.getCertificateData(1);
      expect(data.depositAmount).to.equal(ethers.parseEther("1000"));
    });

    it("NFT contract remains unchanged during metadata upgrade", async function () {
      const { nft, metadataAddress } = await loadFixture(deployFixture);

      const nftAddressBefore = await nft.getAddress();
      const nameBefore = await nft.name();
      const symbolBefore = await nft.symbol();

      // Upgrade metadata
      const NFTMetadataV2 = await ethers.getContractFactory("NFTMetadataUpgradeable");
      await upgrades.upgradeProxy(metadataAddress, NFTMetadataV2);

      // NFT unchanged
      const nftAddressAfter = await nft.getAddress();
      const nameAfter = await nft.name();
      const symbolAfter = await nft.symbol();

      expect(nftAddressAfter).to.equal(nftAddressBefore);
      expect(nameAfter).to.equal(nameBefore);
      expect(symbolAfter).to.equal(symbolBefore);
    });
  });
});