import "@nomicfoundation/hardhat-ethers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { ERC20Mock, LiquidityVault } from "../typechain";

describe("LiquidityVault", function () {
  let deployer: SignerWithAddress,
    admin: SignerWithAddress,
    newSavingBank: SignerWithAddress,
    receiver1: SignerWithAddress,
    receiver2: SignerWithAddress,
    addr1: SignerWithAddress,
    addr2: SignerWithAddress,
    addr3: SignerWithAddress,
    addr4: SignerWithAddress,
    addr5: SignerWithAddress,
    addr6: SignerWithAddress,
    addr7: SignerWithAddress,
    addr8: SignerWithAddress,
    addr9: SignerWithAddress;

  let vault: LiquidityVault;
  let token: ERC20Mock;

  const SECONDS_PER_YEAR = 365 * 86400;
  const BASIS_POINTS = 10000;

  const deploy = async () => {
    [
      deployer,
      admin,
      newSavingBank,
      receiver1,
      receiver2,
      addr1,
      addr2,
      addr3,
      addr4,
      addr5,
      addr6,
      addr7,
      addr8,
      addr9,
    ] = await ethers.getSigners();

    // Deploy Mock ERC20 Tokens
    const ERC20MockFactory = await ethers.getContractFactory("ERC20Mock");

    token = (await ERC20MockFactory.deploy()) as ERC20Mock;
    await token.waitForDeployment();

    // deploy LiquidityVault contract
    vault = await (
      await ethers.getContractFactory("LiquidityVault")
    ).deploy(await token.getAddress());

    // Mint tokens cho users
    await token.mint(deployer.address, ethers.parseEther("10000"));
    await token.mint(addr1.address, ethers.parseEther("10000"));
    await token.mint(addr2.address, ethers.parseEther("10000"));
    await token.mint(addr3.address, ethers.parseEther("10000"));

    // // Approve pool để stake
    await token
      .connect(deployer)
      .approve(await vault.getAddress(), ethers.MaxUint256);
    await token
      .connect(addr1)
      .approve(await vault.getAddress(), ethers.MaxUint256);
    await token
      .connect(addr2)
      .approve(await vault.getAddress(), ethers.MaxUint256);
    await token
      .connect(addr3)
      .approve(await vault.getAddress(), ethers.MaxUint256);

  };

  const fundVault = async (amount: bigint) => {
    await vault.fundVault(amount);
  };

  const pause = async () => {
    await vault.pause();
  };

  beforeEach(async () => {
    await deploy();
  });

  describe("Deploy", function () {
    it("Should revert if token address is zero", async () => {
      const VaultFactory = await ethers.getContractFactory("LiquidityVault");

      await expect(
        VaultFactory.deploy(ethers.ZeroAddress),
      ).to.be.revertedWithCustomError(vault, "InvalidToken");
    });

    it("Should set deployer as owner", async function () {
      expect(await vault.owner()).to.equal(deployer.address);
    });

    it("Should set correct token address", async () => {
      expect(await vault.token()).to.equal(await token.getAddress());
    });

    it("Should have zero initial balance", async () => {
      expect(await vault.totalBalance()).to.equal(0);
    });

    it("Should set correct SavingBank address", async () => {
      expect(await vault.savingBank()).to.equal(await savingBank.getAddress());
    });

    it("Should deploy vault successfully", async () => {
      expect(await vault.getAddress()).to.be.properAddress;
    });
  });
});
