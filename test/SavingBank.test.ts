import "@nomicfoundation/hardhat-ethers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { SavingBank, ERC20Mock, LiquidityVault } from "../typechain";

describe("SavingBank", function () {
  let deployer: SignerWithAddress,
    admin: SignerWithAddress,
    vault1: SignerWithAddress,
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

  let savingBank: SavingBank;
  let vault: LiquidityVault;
  let token: ERC20Mock;

  const SECONDS_PER_YEAR = 365 * 86400;
  const BASIS_POINTS = 10000;

  const deploy = async () => {
    [
      deployer,
      admin,
      vault1,
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

    // deploy Staking contract
    savingBank = await (
      await ethers.getContractFactory("SavingBank")
    ).deploy(await token.getAddress(), vault.getAddress(), receiver1);

    // Mint tokens cho users
    await token.mint(deployer.address, ethers.parseEther("10000"));
    await token.mint(addr1.address, ethers.parseEther("10000"));
    await token.mint(addr2.address, ethers.parseEther("10000"));
    await token.mint(addr3.address, ethers.parseEther("10000"));

    // // Approve pool để stake
    await token
      .connect(deployer)
      .approve(await savingBank.getAddress(), ethers.MaxUint256);
    await token
      .connect(deployer)
      .approve(await vault.getAddress(), ethers.MaxUint256);
    await token
      .connect(addr1)
      .approve(await savingBank.getAddress(), ethers.MaxUint256);
    await token
      .connect(addr2)
      .approve(await savingBank.getAddress(), ethers.MaxUint256);
    await token
      .connect(addr3)
      .approve(await savingBank.getAddress(), ethers.MaxUint256);
  };

  const createDefaultPlans = async () => {
    // Plan 1: 7 days, 5% APR
    await savingBank.createPlan(
      7,
      500,
      ethers.parseEther("100"),
      ethers.parseEther("10000"),
      300,
    );

    // Plan 2: 30 days, 8% APR
    await savingBank.createPlan(
      30,
      800,
      ethers.parseEther("100"),
      ethers.parseEther("10000"),
      500,
    );

    // Plan 3: 90 days, 12% APR
    await savingBank.createPlan(90, 1200, ethers.parseEther("100"), 0, 800);
  };

  beforeEach(async () => {
    await deploy();
  });

  describe("Deploy", function () {
    it("Should set deployer as owner", async function () {
      expect(await savingBank.owner()).to.equal(deployer.address);
    });

    it("Should set correct vault address", async function () {
      expect(await savingBank.vault()).to.equal(await vault.getAddress());
    });

    it("Should set correct fee receiver", async function () {
      expect(await savingBank.feeReceiver()).to.equal(receiver1.address);
    });

    it("Should set correct token address", async () => {
      expect(await savingBank.token()).to.equal(await token.getAddress());
    });

    it("Should set correct name and symbol NFT", async () => {
      expect(await savingBank.name()).to.equal("Saving Bank Certificate");
      expect(await savingBank.symbol()).to.equal("SBC");
    });

    it("Should set the initial planId and depositId to 1", async function () {
      const planId = await savingBank.planId();
      const depositId = await savingBank.depositId();
      expect(planId).to.equal(1n);
      expect(depositId).to.equal(1n);
    });

    it("Should deploy saving bank successfully", async () => {
      expect(await savingBank.getAddress()).to.be.properAddress;
    });
  });

});
