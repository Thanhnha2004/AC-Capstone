import { ethers } from "hardhat";
import { expect } from "chai";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { SavingBankNFT } from "../typechain";

describe("SavingBankNFT Tests", function () {
  let admin: SignerWithAddress,
    operator: SignerWithAddress,
    savingBank: SignerWithAddress,
    user1: SignerWithAddress,
    user2: SignerWithAddress;
  let nft: SavingBankNFT;

  const ADMIN_ROLE = ethers.keccak256(ethers.toUtf8Bytes("ADMIN_ROLE"));
  const OPERATOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("OPERATOR_ROLE"));

  beforeEach(async function () {
    [admin, operator, savingBank, user1, user2] = await ethers.getSigners();

    const NFTFactory = await ethers.getContractFactory("SavingBankNFT");
    nft = await NFTFactory.deploy(admin.address, operator.address);
  });

  describe("Deployment", function () {
    it("Should deploy with correct name and symbol", async function () {
      expect(await nft.name()).to.equal("Saving Bank Certificate");
      expect(await nft.symbol()).to.equal("SBC");
    });

    it("Should grant correct roles", async function () {
      expect(await nft.hasRole(ADMIN_ROLE, admin.address)).to.be.true;
      expect(await nft.hasRole(OPERATOR_ROLE, operator.address)).to.be.true;
      expect(
        await nft.hasRole(await nft.DEFAULT_ADMIN_ROLE(), admin.address),
      ).to.be.true;
    });

    it("Should revert if admin is zero address", async function () {
      const NFTFactory = await ethers.getContractFactory("SavingBankNFT");
      await expect(
        NFTFactory.deploy(ethers.ZeroAddress, operator.address),
      ).to.be.revertedWithCustomError(nft, "InvalidAddress");
    });

    it("Should revert if operator is zero address", async function () {
      const NFTFactory = await ethers.getContractFactory("SavingBankNFT");
      await expect(
        NFTFactory.deploy(admin.address, ethers.ZeroAddress),
      ).to.be.revertedWithCustomError(nft, "InvalidAddress");
    });

    it("Should have savingBank as zero initially", async function () {
      expect(await nft.savingBank()).to.equal(ethers.ZeroAddress);
    });
  });

  describe("Admin Functions", function () {
    it("Should allow admin to set saving bank", async function () {
      await expect(nft.connect(admin).setSavingBank(savingBank.address))
        .to.emit(nft, "SavingBankUpdated")
        .withArgs(ethers.ZeroAddress, savingBank.address);
      expect(await nft.savingBank()).to.equal(savingBank.address);
    });

    it("Should revert if non-admin tries to set saving bank", async function () {
      await expect(nft.connect(user1).setSavingBank(savingBank.address)).to.be
        .reverted;
    });

    it("Should revert if setting zero address as saving bank", async function () {
      await expect(
        nft.connect(admin).setSavingBank(ethers.ZeroAddress),
      ).to.be.revertedWithCustomError(nft, "InvalidAddress");
    });

    it("Should allow updating saving bank multiple times", async function () {
      await nft.connect(admin).setSavingBank(savingBank.address);
      await expect(nft.connect(admin).setSavingBank(user1.address))
        .to.emit(nft, "SavingBankUpdated")
        .withArgs(savingBank.address, user1.address);
      expect(await nft.savingBank()).to.equal(user1.address);
    });
  });

  describe("Minting", function () {
    beforeEach(async function () {
      await nft.connect(admin).setSavingBank(savingBank.address);
    });

    it("Should mint NFT from saving bank", async function () {
      await expect(
        nft.connect(savingBank).mint(user1.address, 1, 1, ethers.parseEther("1000")),
      )
        .to.emit(nft, "CertificateMinted")
        .withArgs(1, user1.address);

      expect(await nft.ownerOf(1)).to.equal(user1.address);
      expect(await nft.balanceOf(user1.address)).to.equal(1);
    });

    it("Should store certificate data correctly", async function () {
      await nft
        .connect(savingBank)
        .mint(user1.address, 1, 2, ethers.parseEther("5000"));

      const certData = await nft.getCertificateData(1);
      expect(certData.depositId).to.equal(1);
      expect(certData.planId).to.equal(2);
      expect(certData.depositAmount).to.equal(ethers.parseEther("5000"));
      expect(certData.depositTime).to.be.gt(0);
    });

    it("Should generate token URI", async function () {
      await nft
        .connect(savingBank)
        .mint(user1.address, 1, 1, ethers.parseEther("1000"));
      const uri = await nft.tokenURI(1);
      expect(uri).to.include("data:application/json;base64,");
    });

    it("Should revert if non-saving-bank tries to mint", async function () {
      await expect(
        nft.connect(user1).mint(user1.address, 1, 1, ethers.parseEther("1000")),
      ).to.be.revertedWithCustomError(nft, "Unauthorized");
    });

    it("Should revert if admin tries to mint", async function () {
      await expect(
        nft.connect(admin).mint(user1.address, 1, 1, ethers.parseEther("1000")),
      ).to.be.revertedWithCustomError(nft, "Unauthorized");
    });

    it("Should mint multiple NFTs", async function () {
      await nft
        .connect(savingBank)
        .mint(user1.address, 1, 1, ethers.parseEther("1000"));
      await nft
        .connect(savingBank)
        .mint(user1.address, 2, 2, ethers.parseEther("2000"));
      await nft
        .connect(savingBank)
        .mint(user2.address, 3, 1, ethers.parseEther("1500"));

      expect(await nft.balanceOf(user1.address)).to.equal(2);
      expect(await nft.balanceOf(user2.address)).to.equal(1);
    });
  });

  describe("Burning", function () {
    beforeEach(async function () {
      await nft.connect(admin).setSavingBank(savingBank.address);
      await nft
        .connect(savingBank)
        .mint(user1.address, 1, 1, ethers.parseEther("1000"));
    });

    it("Should burn NFT from saving bank", async function () {
      await expect(nft.connect(savingBank).burn(1))
        .to.emit(nft, "CertificateBurned")
        .withArgs(1);

      await expect(nft.ownerOf(1)).to.be.reverted;
      expect(await nft.balanceOf(user1.address)).to.equal(0);
    });

    it("Should delete certificate data on burn", async function () {
      await nft.connect(savingBank).burn(1);
      const certData = await nft.getCertificateData(1);
      expect(certData.depositId).to.equal(0);
      expect(certData.planId).to.equal(0);
      expect(certData.depositAmount).to.equal(0);
    });

    it("Should revert if non-saving-bank tries to burn", async function () {
      await expect(
        nft.connect(user1).burn(1),
      ).to.be.revertedWithCustomError(nft, "Unauthorized");
    });

    it("Should revert if admin tries to burn", async function () {
      await expect(
        nft.connect(admin).burn(1),
      ).to.be.revertedWithCustomError(nft, "Unauthorized");
    });

    it("Should revert if burning non-existent token", async function () {
      await expect(
        nft.connect(savingBank).burn(999),
      ).to.be.revertedWithCustomError(nft, "TokenNotExists");
    });

    it("Should revert if burning already burned token", async function () {
      await nft.connect(savingBank).burn(1);
      await expect(
        nft.connect(savingBank).burn(1),
      ).to.be.revertedWithCustomError(nft, "TokenNotExists");
    });
  });

  describe("Soulbound Functionality", function () {
    beforeEach(async function () {
      await nft.connect(admin).setSavingBank(savingBank.address);
      await nft
        .connect(savingBank)
        .mint(user1.address, 1, 1, ethers.parseEther("1000"));
    });

    it("Should prevent transfer between users", async function () {
      await expect(
        nft.connect(user1).transferFrom(user1.address, user2.address, 1),
      ).to.be.revertedWithCustomError(nft, "Unauthorized");
    });

    it("Should prevent safeTransferFrom", async function () {
      await expect(
        nft
          .connect(user1)
          ["safeTransferFrom(address,address,uint256)"](
            user1.address,
            user2.address,
            1,
          ),
      ).to.be.revertedWithCustomError(nft, "Unauthorized");
    });

    it("Should prevent approve", async function () {
      // approve is allowed but transfer will fail
      await nft.connect(user1).approve(user2.address, 1);
      await expect(
        nft.connect(user2).transferFrom(user1.address, user2.address, 1),
      ).to.be.revertedWithCustomError(nft, "Unauthorized");
    });
  });

  describe("Certificate Data", function () {
    beforeEach(async function () {
      await nft.connect(admin).setSavingBank(savingBank.address);
    });

    it("Should retrieve correct certificate data", async function () {
      await nft
        .connect(savingBank)
        .mint(user1.address, 1, 3, ethers.parseEther("7500"));

      const data = await nft.getCertificateData(1);
      expect(data.depositId).to.equal(1);
      expect(data.planId).to.equal(3);
      expect(data.depositAmount).to.equal(ethers.parseEther("7500"));
    });

    it("Should return empty data for non-existent token", async function () {
      const data = await nft.getCertificateData(999);
      expect(data.depositId).to.equal(0);
      expect(data.planId).to.equal(0);
      expect(data.depositAmount).to.equal(0);
      expect(data.depositTime).to.equal(0);
    });

    it("Should maintain data for multiple tokens", async function () {
      await nft
        .connect(savingBank)
        .mint(user1.address, 1, 1, ethers.parseEther("1000"));
      await nft
        .connect(savingBank)
        .mint(user1.address, 2, 2, ethers.parseEther("2000"));

      const data1 = await nft.getCertificateData(1);
      const data2 = await nft.getCertificateData(2);

      expect(data1.planId).to.equal(1);
      expect(data2.planId).to.equal(2);
      expect(data1.depositAmount).to.equal(ethers.parseEther("1000"));
      expect(data2.depositAmount).to.equal(ethers.parseEther("2000"));
    });
  });

  describe("Access Control Integration", function () {
    it("Should allow admin to grant roles", async function () {
      await nft.connect(admin).grantRole(ADMIN_ROLE, user1.address);
      expect(await nft.hasRole(ADMIN_ROLE, user1.address)).to.be.true;
    });

    it("Should allow admin to revoke roles", async function () {
      await nft.connect(admin).grantRole(ADMIN_ROLE, user1.address);
      await nft.connect(admin).revokeRole(ADMIN_ROLE, user1.address);
      expect(await nft.hasRole(ADMIN_ROLE, user1.address)).to.be.false;
    });

    it("Should prevent non-admin from granting roles", async function () {
      await expect(nft.connect(user1).grantRole(ADMIN_ROLE, user2.address)).to
        .be.reverted;
    });

    it("Should allow new admin to set saving bank", async function () {
      await nft.connect(admin).grantRole(ADMIN_ROLE, user1.address);
      await nft.connect(user1).setSavingBank(savingBank.address);
      expect(await nft.savingBank()).to.equal(savingBank.address);
    });
  });

  describe("SupportsInterface", function () {
    it("Should support ERC721 interface", async function () {
      // ERC721 interface ID: 0x80ac58cd
      expect(await nft.supportsInterface("0x80ac58cd")).to.be.true;
    });

    it("Should support AccessControl interface", async function () {
      // AccessControl interface ID: 0x7965db0b
      expect(await nft.supportsInterface("0x7965db0b")).to.be.true;
    });

    it("Should support ERC165 interface", async function () {
      // ERC165 interface ID: 0x01ffc9a7
      expect(await nft.supportsInterface("0x01ffc9a7")).to.be.true;
    });
  });

  describe("Edge Cases", function () {
    beforeEach(async function () {
      await nft.connect(admin).setSavingBank(savingBank.address);
    });

    it("Should handle large deposit amounts in metadata", async function () {
      await nft
        .connect(savingBank)
        .mint(
          user1.address,
          1,
          1,
          ethers.parseEther("999999999999999999"),
        );
      const uri = await nft.tokenURI(1);
      expect(uri).to.be.a("string");
    });

    it("Should handle zero plan ID", async function () {
      await nft
        .connect(savingBank)
        .mint(user1.address, 1, 0, ethers.parseEther("1000"));
      const data = await nft.getCertificateData(1);
      expect(data.planId).to.equal(0);
    });

    it("Should handle changing saving bank with existing NFTs", async function () {
      await nft
        .connect(savingBank)
        .mint(user1.address, 1, 1, ethers.parseEther("1000"));
      await nft.connect(admin).setSavingBank(user2.address);

      // Old saving bank can't burn
      await expect(
        nft.connect(savingBank).burn(1),
      ).to.be.revertedWithCustomError(nft, "Unauthorized");

      // New saving bank can burn
      await nft.connect(user2).burn(1);
      await expect(nft.ownerOf(1)).to.be.reverted;
    });
  });
});