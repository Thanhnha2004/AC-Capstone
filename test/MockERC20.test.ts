import { ethers } from "hardhat";
import { expect } from "chai";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { ERC20Mock } from "../typechain";

describe("MockERC20 Tests", function () {
  let owner: SignerWithAddress,
    user1: SignerWithAddress,
    user2: SignerWithAddress;
  let token: ERC20Mock;

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();

    const TokenFactory = await ethers.getContractFactory("ERC20Mock");
    token = await TokenFactory.deploy();
  });

  describe("Deployment", function () {
    it("Should deploy with correct name", async function () {
      expect(await token.name()).to.equal("Mock Token");
    });

    it("Should deploy with correct symbol", async function () {
      expect(await token.symbol()).to.equal("MOCK");
    });

    it("Should deploy with 18 decimals", async function () {
      expect(await token.decimals()).to.equal(18);
    });

    it("Should start with zero total supply", async function () {
      expect(await token.totalSupply()).to.equal(0);
    });
  });

  describe("Minting", function () {
    it("Should mint tokens to an address", async function () {
      await token.mint(user1.address, ethers.parseEther("1000"));
      expect(await token.balanceOf(user1.address)).to.equal(
        ethers.parseEther("1000"),
      );
    });

    it("Should increase total supply on mint", async function () {
      await token.mint(user1.address, ethers.parseEther("1000"));
      expect(await token.totalSupply()).to.equal(ethers.parseEther("1000"));
    });

    it("Should mint to multiple addresses", async function () {
      await token.mint(user1.address, ethers.parseEther("1000"));
      await token.mint(user2.address, ethers.parseEther("2000"));
      expect(await token.balanceOf(user1.address)).to.equal(
        ethers.parseEther("1000"),
      );
      expect(await token.balanceOf(user2.address)).to.equal(
        ethers.parseEther("2000"),
      );
    });

    it("Should mint multiple times to same address", async function () {
      await token.mint(user1.address, ethers.parseEther("1000"));
      await token.mint(user1.address, ethers.parseEther("2000"));
      expect(await token.balanceOf(user1.address)).to.equal(
        ethers.parseEther("3000"),
      );
    });
  });

  describe("Transfers", function () {
    beforeEach(async function () {
      await token.mint(user1.address, ethers.parseEther("10000"));
    });

    it("Should transfer tokens between accounts", async function () {
      await token
        .connect(user1)
        .transfer(user2.address, ethers.parseEther("1000"));
      expect(await token.balanceOf(user2.address)).to.equal(
        ethers.parseEther("1000"),
      );
      expect(await token.balanceOf(user1.address)).to.equal(
        ethers.parseEther("9000"),
      );
    });

    it("Should emit Transfer event", async function () {
      await expect(
        token.connect(user1).transfer(user2.address, ethers.parseEther("1000")),
      )
        .to.emit(token, "Transfer")
        .withArgs(user1.address, user2.address, ethers.parseEther("1000"));
    });

    it("Should fail transfer with insufficient balance", async function () {
      await expect(
        token.connect(user2).transfer(user1.address, ethers.parseEther("1000")),
      ).to.be.reverted;
    });
  });

  describe("Allowances", function () {
    beforeEach(async function () {
      await token.mint(user1.address, ethers.parseEther("10000"));
    });

    it("Should approve tokens for spending", async function () {
      await token
        .connect(user1)
        .approve(user2.address, ethers.parseEther("1000"));
      expect(await token.allowance(user1.address, user2.address)).to.equal(
        ethers.parseEther("1000"),
      );
    });

    it("Should emit Approval event", async function () {
      await expect(
        token.connect(user1).approve(user2.address, ethers.parseEther("1000")),
      )
        .to.emit(token, "Approval")
        .withArgs(user1.address, user2.address, ethers.parseEther("1000"));
    });

    it("Should transferFrom with approval", async function () {
      await token
        .connect(user1)
        .approve(user2.address, ethers.parseEther("1000"));
      await token
        .connect(user2)
        .transferFrom(user1.address, user2.address, ethers.parseEther("500"));
      expect(await token.balanceOf(user2.address)).to.equal(
        ethers.parseEther("500"),
      );
    });

    it("Should decrease allowance after transferFrom", async function () {
      await token
        .connect(user1)
        .approve(user2.address, ethers.parseEther("1000"));
      await token
        .connect(user2)
        .transferFrom(user1.address, user2.address, ethers.parseEther("500"));
      expect(await token.allowance(user1.address, user2.address)).to.equal(
        ethers.parseEther("500"),
      );
    });

    it("Should fail transferFrom with insufficient allowance", async function () {
      await token
        .connect(user1)
        .approve(user2.address, ethers.parseEther("500"));
      await expect(
        token
          .connect(user2)
          .transferFrom(
            user1.address,
            user2.address,
            ethers.parseEther("1000"),
          ),
      ).to.be.reverted;
    });
  });
});
