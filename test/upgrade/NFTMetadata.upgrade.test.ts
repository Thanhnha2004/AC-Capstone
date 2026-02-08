import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { NFTMetadataUpgradeable } from "../../typechain";

describe("NFTMetadataUpgradeable Upgrade Tests", function () {
  let admin: SignerWithAddress;
  let nftContract: SignerWithAddress;
  let user1: SignerWithAddress;
  let metadata: NFTMetadataUpgradeable;
  let proxyAddress: string;

  const BASE_URI = "ipfs://QmTestBaseHash/";

  async function deployMetadataFixture() {
    [admin, nftContract, user1] = await ethers.getSigners();

    const NFTMetadata = await ethers.getContractFactory(
      "NFTMetadataUpgradeable",
    );

    const proxy = await upgrades.deployProxy(
      NFTMetadata,
      [admin.address, nftContract.address, BASE_URI],
      { initializer: "initialize", kind: "uups" },
    );

    await proxy.waitForDeployment();
    proxyAddress = await proxy.getAddress();

    metadata = (await ethers.getContractAt(
      "NFTMetadataUpgradeable",
      proxyAddress,
    )) as NFTMetadataUpgradeable;

    return { metadata, admin, nftContract, user1, proxyAddress };
  }

  describe("Critical Metadata State Preservation", function () {
    it("Should preserve certificate data after upgrade", async function () {
      const { metadata, nftContract, proxyAddress } = await loadFixture(
        deployMetadataFixture,
      );

      // Set certificate data before upgrade
      const tokenId = 1;
      const planId = 5;
      const depositAmount = ethers.parseEther("1000");

      await metadata
        .connect(nftContract)
        .setCertificateData(tokenId, planId, depositAmount);

      // Get data before upgrade
      const dataBefore = await metadata.getCertificateData(tokenId);

      // Upgrade
      const NFTMetadataV2 = await ethers.getContractFactory(
        "NFTMetadataUpgradeable",
      );
      await upgrades.upgradeProxy(proxyAddress, NFTMetadataV2);

      const upgraded = (await ethers.getContractAt(
        "NFTMetadataUpgradeable",
        proxyAddress,
      )) as NFTMetadataUpgradeable;

      // Get data after upgrade
      const dataAfter = await upgraded.getCertificateData(tokenId);

      expect(dataAfter.depositId).to.equal(dataBefore.depositId);
      expect(dataAfter.planId).to.equal(dataBefore.planId);
      expect(dataAfter.depositAmount).to.equal(dataBefore.depositAmount);
      expect(dataAfter.depositTime).to.equal(dataBefore.depositTime);
    });

    it("Should preserve multiple certificate data mappings", async function () {
      const { metadata, nftContract, proxyAddress } = await loadFixture(
        deployMetadataFixture,
      );

      // Set multiple certificates
      const tokens = [
        { id: 1, planId: 1, amount: ethers.parseEther("1000") },
        { id: 2, planId: 2, amount: ethers.parseEther("2000") },
        { id: 3, planId: 3, amount: ethers.parseEther("3000") },
      ];

      for (const token of tokens) {
        await metadata
          .connect(nftContract)
          .setCertificateData(token.id, token.planId, token.amount);
      }

      // Capture data before upgrade
      const dataBefore = await Promise.all(
        tokens.map((t) => metadata.getCertificateData(t.id)),
      );

      // Upgrade
      const NFTMetadataV2 = await ethers.getContractFactory(
        "NFTMetadataUpgradeable",
      );
      await upgrades.upgradeProxy(proxyAddress, NFTMetadataV2);

      const upgraded = (await ethers.getContractAt(
        "NFTMetadataUpgradeable",
        proxyAddress,
      )) as NFTMetadataUpgradeable;

      // Verify all data preserved
      const dataAfter = await Promise.all(
        tokens.map((t) => upgraded.getCertificateData(t.id)),
      );

      for (let i = 0; i < tokens.length; i++) {
        expect(dataAfter[i].depositId).to.equal(dataBefore[i].depositId);
        expect(dataAfter[i].planId).to.equal(dataBefore[i].planId);
        expect(dataAfter[i].depositAmount).to.equal(
          dataBefore[i].depositAmount,
        );
        expect(dataAfter[i].depositTime).to.equal(dataBefore[i].depositTime);
      }
    });

    it("Should preserve custom IPFS hashes after upgrade", async function () {
      const { metadata, admin, nftContract, proxyAddress } = await loadFixture(
        deployMetadataFixture,
      );

      const tokenId = 1;
      const customHash = "QmCustomHash123";

      // Set certificate data and custom IPFS hash
      await metadata
        .connect(nftContract)
        .setCertificateData(tokenId, 1, ethers.parseEther("1000"));
      await metadata.connect(admin).setTokenIPFSHash(tokenId, customHash);

      // Get token URI before upgrade
      const uriBefore = await metadata.tokenURI(tokenId);

      // Upgrade
      const NFTMetadataV2 = await ethers.getContractFactory(
        "NFTMetadataUpgradeable",
      );
      await upgrades.upgradeProxy(proxyAddress, NFTMetadataV2);

      const upgraded = (await ethers.getContractAt(
        "NFTMetadataUpgradeable",
        proxyAddress,
      )) as NFTMetadataUpgradeable;

      // Get token URI after upgrade
      const uriAfter = await upgraded.tokenURI(tokenId);

      expect(uriAfter).to.equal(uriBefore);
      expect(uriAfter).to.equal(`ipfs://${customHash}`);
    });

    it("Should preserve baseURI after upgrade", async function () {
      const { metadata, proxyAddress } = await loadFixture(
        deployMetadataFixture,
      );

      const baseURIBefore = await metadata.baseURI();

      // Upgrade
      const NFTMetadataV2 = await ethers.getContractFactory(
        "NFTMetadataUpgradeable",
      );
      await upgrades.upgradeProxy(proxyAddress, NFTMetadataV2);

      const upgraded = (await ethers.getContractAt(
        "NFTMetadataUpgradeable",
        proxyAddress,
      )) as NFTMetadataUpgradeable;

      const baseURIAfter = await upgraded.baseURI();

      expect(baseURIAfter).to.equal(baseURIBefore);
      expect(baseURIAfter).to.equal(BASE_URI);
    });

    it("Should preserve NFT contract address after upgrade", async function () {
      const { metadata, nftContract, proxyAddress } = await loadFixture(
        deployMetadataFixture,
      );

      const nftAddressBefore = await metadata.nftContract();

      // Upgrade
      const NFTMetadataV2 = await ethers.getContractFactory(
        "NFTMetadataUpgradeable",
      );
      await upgrades.upgradeProxy(proxyAddress, NFTMetadataV2);

      const upgraded = (await ethers.getContractAt(
        "NFTMetadataUpgradeable",
        proxyAddress,
      )) as NFTMetadataUpgradeable;

      const nftAddressAfter = await upgraded.nftContract();

      expect(nftAddressAfter).to.equal(nftAddressBefore);
      expect(nftAddressAfter).to.equal(nftContract.address);
    });
  });

  describe("Old Functions After Upgrade", function () {
    it("Should allow setting certificate data after upgrade", async function () {
      const { nftContract, proxyAddress } = await loadFixture(
        deployMetadataFixture,
      );

      // Upgrade first
      const NFTMetadataV2 = await ethers.getContractFactory(
        "NFTMetadataUpgradeable",
      );
      await upgrades.upgradeProxy(proxyAddress, NFTMetadataV2);

      const upgraded = (await ethers.getContractAt(
        "NFTMetadataUpgradeable",
        proxyAddress,
      )) as NFTMetadataUpgradeable;

      // Set certificate data after upgrade
      await expect(
        upgraded
          .connect(nftContract)
          .setCertificateData(1, 1, ethers.parseEther("1000")),
      ).to.emit(upgraded, "CertificateDataSet");
    });

    it("Should allow deleting old certificate data after upgrade", async function () {
      const { metadata, nftContract, proxyAddress } = await loadFixture(
        deployMetadataFixture,
      );

      // Set data BEFORE upgrade
      await metadata
        .connect(nftContract)
        .setCertificateData(1, 1, ethers.parseEther("1000"));

      // Upgrade
      const NFTMetadataV2 = await ethers.getContractFactory(
        "NFTMetadataUpgradeable",
      );
      await upgrades.upgradeProxy(proxyAddress, NFTMetadataV2);

      const upgraded = (await ethers.getContractAt(
        "NFTMetadataUpgradeable",
        proxyAddress,
      )) as NFTMetadataUpgradeable;

      // Delete AFTER upgrade
      await expect(
        upgraded.connect(nftContract).deleteCertificateData(1),
      ).to.emit(upgraded, "CertificateDataDeleted");

      // Verify data deleted
      await expect(
        upgraded.getCertificateData(1),
      ).to.be.revertedWithCustomError(upgraded, "TokenNotExists");
    });

    it("Should allow updating baseURI after upgrade", async function () {
      const { admin, proxyAddress } = await loadFixture(deployMetadataFixture);

      // Upgrade
      const NFTMetadataV2 = await ethers.getContractFactory(
        "NFTMetadataUpgradeable",
      );
      await upgrades.upgradeProxy(proxyAddress, NFTMetadataV2);

      const upgraded = (await ethers.getContractAt(
        "NFTMetadataUpgradeable",
        proxyAddress,
      )) as NFTMetadataUpgradeable;

      // Update baseURI after upgrade
      const newBaseURI = "ipfs://QmNewBaseHash/";
      await expect(upgraded.connect(admin).setBaseURI(newBaseURI))
        .to.emit(upgraded, "BaseURIUpdated")
        .withArgs(newBaseURI);

      expect(await upgraded.baseURI()).to.equal(newBaseURI);
    });

    it("Should maintain access control after upgrade", async function () {
      const { user1, proxyAddress } = await loadFixture(deployMetadataFixture);

      // Upgrade
      const NFTMetadataV2 = await ethers.getContractFactory(
        "NFTMetadataUpgradeable",
      );
      await upgrades.upgradeProxy(proxyAddress, NFTMetadataV2);

      const upgraded = (await ethers.getContractAt(
        "NFTMetadataUpgradeable",
        proxyAddress,
      )) as NFTMetadataUpgradeable;

      // Try to set certificate data as non-NFT contract - should fail
      await expect(
        upgraded
          .connect(user1)
          .setCertificateData(1, 1, ethers.parseEther("1000")),
      ).to.be.revertedWithCustomError(upgraded, "Unauthorized");

      // Try to set baseURI as non-admin - should fail
      await expect(upgraded.connect(user1).setBaseURI("ipfs://NewHash/")).to.be
        .reverted;
    });

    it("Should allow setting custom IPFS hash after upgrade", async function () {
      const { admin, nftContract, proxyAddress } = await loadFixture(
        deployMetadataFixture,
      );

      // Upgrade
      const NFTMetadataV2 = await ethers.getContractFactory(
        "NFTMetadataUpgradeable",
      );
      await upgrades.upgradeProxy(proxyAddress, NFTMetadataV2);

      const upgraded = (await ethers.getContractAt(
        "NFTMetadataUpgradeable",
        proxyAddress,
      )) as NFTMetadataUpgradeable;

      // Set certificate data
      await upgraded
        .connect(nftContract)
        .setCertificateData(1, 1, ethers.parseEther("1000"));

      // Set custom IPFS hash after upgrade
      const customHash = "QmNewCustomHash456";
      await expect(upgraded.connect(admin).setTokenIPFSHash(1, customHash))
        .to.emit(upgraded, "TokenIPFSHashSet")
        .withArgs(1, customHash);

      const tokenURI = await upgraded.tokenURI(1);
      expect(tokenURI).to.equal(`ipfs://${customHash}`);
    });
  });

  describe("TokenURI Generation", function () {
    it("Should generate correct tokenURI without custom hash after upgrade", async function () {
      const { metadata, nftContract, proxyAddress } = await loadFixture(
        deployMetadataFixture,
      );

      const tokenId = 42;
      await metadata
        .connect(nftContract)
        .setCertificateData(tokenId, 1, ethers.parseEther("1000"));

      // Upgrade
      const NFTMetadataV2 = await ethers.getContractFactory(
        "NFTMetadataUpgradeable",
      );
      await upgrades.upgradeProxy(proxyAddress, NFTMetadataV2);

      const upgraded = (await ethers.getContractAt(
        "NFTMetadataUpgradeable",
        proxyAddress,
      )) as NFTMetadataUpgradeable;

      const tokenURI = await upgraded.tokenURI(tokenId);
      expect(tokenURI).to.equal(`${BASE_URI}${tokenId}.json`);
    });

    it("Should prioritize custom IPFS hash over baseURI", async function () {
      const { metadata, admin, nftContract, proxyAddress } = await loadFixture(
        deployMetadataFixture,
      );

      const tokenId = 1;
      const customHash = "QmCustomPriorityHash";

      await metadata
        .connect(nftContract)
        .setCertificateData(tokenId, 1, ethers.parseEther("1000"));
      await metadata.connect(admin).setTokenIPFSHash(tokenId, customHash);

      // Upgrade
      const NFTMetadataV2 = await ethers.getContractFactory(
        "NFTMetadataUpgradeable",
      );
      await upgrades.upgradeProxy(proxyAddress, NFTMetadataV2);

      const upgraded = (await ethers.getContractAt(
        "NFTMetadataUpgradeable",
        proxyAddress,
      )) as NFTMetadataUpgradeable;

      const tokenURI = await upgraded.tokenURI(tokenId);
      expect(tokenURI).to.equal(`ipfs://${customHash}`);
      expect(tokenURI).to.not.include(BASE_URI);
    });
  });

  describe("Upgrade Authorization", function () {
    it("Should only allow ADMIN to upgrade", async function () {
      const { user1, proxyAddress } = await loadFixture(deployMetadataFixture);

      const NFTMetadataV2 = await ethers.getContractFactory(
        "NFTMetadataUpgradeable",
      );

      await expect(
        upgrades.upgradeProxy(proxyAddress, NFTMetadataV2.connect(user1)),
      ).to.be.reverted;
    });

    it("Should allow ADMIN to upgrade", async function () {
      const { admin, proxyAddress } = await loadFixture(deployMetadataFixture);

      const NFTMetadataV2 = await ethers.getContractFactory(
        "NFTMetadataUpgradeable",
      );

      await expect(
        upgrades.upgradeProxy(proxyAddress, NFTMetadataV2.connect(admin)),
      ).to.not.be.reverted;
    });
  });

  describe("Storage Layout Validation", function () {
    it("Should validate storage layout before upgrade", async function () {
      const { proxyAddress } = await loadFixture(deployMetadataFixture);

      const NFTMetadataV2 = await ethers.getContractFactory(
        "NFTMetadataUpgradeable",
      );

      // This should not throw
      await expect(
        upgrades.validateUpgrade(proxyAddress, NFTMetadataV2, { kind: "uups" }),
      ).to.not.be.rejected;
    });
  });

  describe("Data Integrity After Multiple Operations", function () {
    it("Should maintain data integrity through set, upgrade, and delete operations", async function () {
      const { metadata, admin, nftContract, proxyAddress } = await loadFixture(
        deployMetadataFixture,
      );

      // Set initial data
      await metadata
        .connect(nftContract)
        .setCertificateData(1, 1, ethers.parseEther("1000"));
      await metadata
        .connect(nftContract)
        .setCertificateData(2, 2, ethers.parseEther("2000"));

      // Set custom hash for token 1
      await metadata.connect(admin).setTokenIPFSHash(1, "QmHash1");

      // Upgrade
      const NFTMetadataV2 = await ethers.getContractFactory(
        "NFTMetadataUpgradeable",
      );
      await upgrades.upgradeProxy(proxyAddress, NFTMetadataV2);

      const upgraded = (await ethers.getContractAt(
        "NFTMetadataUpgradeable",
        proxyAddress,
      )) as NFTMetadataUpgradeable;

      // Add new token after upgrade
      await upgraded
        .connect(nftContract)
        .setCertificateData(3, 3, ethers.parseEther("3000"));

      // Delete token 2
      await upgraded.connect(nftContract).deleteCertificateData(2);

      // Verify final state
      const data1 = await upgraded.getCertificateData(1);
      expect(data1.depositAmount).to.equal(ethers.parseEther("1000"));

      await expect(
        upgraded.getCertificateData(2),
      ).to.be.revertedWithCustomError(upgraded, "TokenNotExists");

      const data3 = await upgraded.getCertificateData(3);
      expect(data3.depositAmount).to.equal(ethers.parseEther("3000"));

      // Verify custom hash still works
      const uri1 = await upgraded.tokenURI(1);
      expect(uri1).to.equal("ipfs://QmHash1");
    });
  });

  describe("Role Management After Upgrade", function () {
    it("Should preserve roles after upgrade", async function () {
      const { metadata, admin, nftContract, proxyAddress } = await loadFixture(
        deployMetadataFixture,
      );

      const ADMIN_ROLE = await metadata.ADMIN_ROLE();
      const NFT_ROLE = await metadata.NFT_ROLE();

      const hasAdminBefore = await metadata.hasRole(ADMIN_ROLE, admin.address);
      const hasNFTBefore = await metadata.hasRole(
        NFT_ROLE,
        nftContract.address,
      );

      // Upgrade
      const NFTMetadataV2 = await ethers.getContractFactory(
        "NFTMetadataUpgradeable",
      );
      await upgrades.upgradeProxy(proxyAddress, NFTMetadataV2);

      const upgraded = (await ethers.getContractAt(
        "NFTMetadataUpgradeable",
        proxyAddress,
      )) as NFTMetadataUpgradeable;

      const hasAdminAfter = await upgraded.hasRole(ADMIN_ROLE, admin.address);
      const hasNFTAfter = await upgraded.hasRole(NFT_ROLE, nftContract.address);

      expect(hasAdminAfter).to.equal(hasAdminBefore);
      expect(hasNFTAfter).to.equal(hasNFTBefore);
      expect(hasAdminAfter).to.be.true;
      expect(hasNFTAfter).to.be.true;
    });

    it("Should allow updating NFT contract after upgrade", async function () {
      const { metadata, admin, user1, proxyAddress } = await loadFixture(
        deployMetadataFixture,
      );

      // Upgrade
      const NFTMetadataV2 = await ethers.getContractFactory(
        "NFTMetadataUpgradeable",
      );
      await upgrades.upgradeProxy(proxyAddress, NFTMetadataV2);

      const upgraded = (await ethers.getContractAt(
        "NFTMetadataUpgradeable",
        proxyAddress,
      )) as NFTMetadataUpgradeable;

      // Update NFT contract
      const newNFTContract = user1.address;
      await expect(
        upgraded.connect(admin).setNFTContract(newNFTContract),
      ).to.emit(upgraded, "NFTContractUpdated");

      expect(await upgraded.nftContract()).to.equal(newNFTContract);

      // New NFT contract should have NFT_ROLE
      const NFT_ROLE = await upgraded.NFT_ROLE();
      expect(await upgraded.hasRole(NFT_ROLE, newNFTContract)).to.be.true;
    });
  });
});
