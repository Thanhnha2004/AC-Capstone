import "@nomicfoundation/hardhat-ethers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { ERC20Mock, LiquidityVault, SavingBank } from "../typechain";

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
  let savingBank: SavingBank;

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
    token = await ERC20MockFactory.deploy();
    await token.waitForDeployment();

    // deploy LiquidityVault contract
    const VaultFactory = await ethers.getContractFactory("LiquidityVault");
    vault = await VaultFactory.deploy(await token.getAddress());
    await vault.waitForDeployment();

    // deploy SavingBank contract
    const SavingBankFactory = await ethers.getContractFactory("SavingBank");
    savingBank = await SavingBankFactory.deploy(
      await token.getAddress(),
      await vault.getAddress(),
      receiver1.address
    );
    await savingBank.waitForDeployment();

    // Set savingBank in vault
    await vault.setSavingBank(await savingBank.getAddress());

    // Mint tokens cho users
    await token.mint(deployer.address, ethers.parseEther("10000"));
    await token.mint(addr1.address, ethers.parseEther("10000"));
    await token.mint(addr2.address, ethers.parseEther("10000"));
    await token.mint(addr3.address, ethers.parseEther("10000"));

    // Approve vault để transfer tokens
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

  // Helper function to get impersonated savingBank signer
  const getSavingBankSigner = async (): Promise<SignerWithAddress> => {
    const savingBankAddress = await savingBank.getAddress();
    
    // Impersonate savingBank address
    await ethers.provider.send("hardhat_impersonateAccount", [savingBankAddress]);
    
    // Set balance directly using hardhat_setBalance instead of sending ETH
    await ethers.provider.send("hardhat_setBalance", [
      savingBankAddress,
      ethers.toQuantity(ethers.parseEther("100"))
    ]);
    
    const signer = await ethers.getSigner(savingBankAddress);
    return signer;
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

  describe("setSavingBank", function () {
    it("Should revert if not owner", async () => {
      await expect(
        vault.connect(addr1).setSavingBank(newSavingBank.address),
      ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    });

    it("Should revert if address is zero", async () => {
      await expect(
        vault.setSavingBank(ethers.ZeroAddress),
      ).to.be.revertedWithCustomError(vault, "InvalidAddress");
    });

    it("Should update saving bank address", async () => {
      const oldBank = await vault.savingBank();
      await vault.setSavingBank(newSavingBank.address);
      expect(await vault.savingBank()).to.equal(newSavingBank.address);
      expect(oldBank).to.not.equal(newSavingBank.address);
    });

    it("Should emit SavingBankUpdated event", async () => {
      const oldBank = await vault.savingBank();
      await expect(vault.setSavingBank(newSavingBank.address))
        .to.emit(vault, "SavingBankUpdated")
        .withArgs(oldBank, newSavingBank.address);
    });
  });

  describe("fundVault", function () {
    it("Should revert if not owner", async () => {
      await expect(
        vault.connect(addr1).fundVault(ethers.parseEther("100")),
      ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    });

    it("Should revert if amount is zero", async () => {
      await expect(vault.fundVault(0)).to.be.revertedWithCustomError(
        vault,
        "InvalidAmount",
      );
    });

    it("Should fund vault successfully", async () => {
      const amount = ethers.parseEther("100");
      const balanceBefore = await vault.totalBalance();
      const tokenBalanceBefore = await token.balanceOf(
        await vault.getAddress(),
      );

      await vault.fundVault(amount);

      const balanceAfter = await vault.totalBalance();
      const tokenBalanceAfter = await token.balanceOf(await vault.getAddress());

      expect(balanceAfter).to.equal(balanceBefore + amount);
      expect(tokenBalanceAfter).to.equal(tokenBalanceBefore + amount);
    });

    it("Should emit Funded event", async () => {
      const amount = ethers.parseEther("100");
      await expect(vault.fundVault(amount))
        .to.emit(vault, "Funded")
        .withArgs(deployer.address, amount);
    });

    it("Should allow multiple funding", async () => {
      await vault.fundVault(ethers.parseEther("100"));
      await vault.fundVault(ethers.parseEther("50"));

      expect(await vault.totalBalance()).to.equal(ethers.parseEther("150"));
    });
  });

  describe("withdrawVault", function () {
    beforeEach(async () => {
      await fundVault(ethers.parseEther("1000"));
    });

    it("Should revert if not owner", async () => {
      await expect(
        vault.connect(addr1).withdrawVault(ethers.parseEther("100")),
      ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    });

    it("Should revert if amount is zero", async () => {
      await expect(vault.withdrawVault(0)).to.be.revertedWithCustomError(
        vault,
        "InvalidAmount",
      );
    });

    it("Should revert if insufficient balance", async () => {
      await expect(
        vault.withdrawVault(ethers.parseEther("2000")),
      ).to.be.revertedWithCustomError(vault, "InsufficientBalance");
    });

    it("Should withdraw successfully", async () => {
      const amount = ethers.parseEther("100");
      const balanceBefore = await vault.totalBalance();
      const ownerBalanceBefore = await token.balanceOf(deployer.address);

      await vault.withdrawVault(amount);

      const balanceAfter = await vault.totalBalance();
      const ownerBalanceAfter = await token.balanceOf(deployer.address);

      expect(balanceAfter).to.equal(balanceBefore - amount);
      expect(ownerBalanceAfter).to.equal(ownerBalanceBefore + amount);
    });

    it("Should emit Withdrawn event", async () => {
      const amount = ethers.parseEther("100");
      await expect(vault.withdrawVault(amount))
        .to.emit(vault, "Withdrawn")
        .withArgs(deployer.address, amount);
    });

    it("Should allow withdrawing all balance", async () => {
      const totalBalance = await vault.totalBalance();
      await vault.withdrawVault(totalBalance);
      expect(await vault.totalBalance()).to.equal(0);
    });
  });

  describe("payInterest", function () {
    beforeEach(async () => {
      await fundVault(ethers.parseEther("1000"));
    });

    it("Should revert if not saving bank", async () => {
      await expect(
        vault
          .connect(addr1)
          .payInterest(addr1.address, ethers.parseEther("10")),
      ).to.be.revertedWithCustomError(vault, "Unauthorized");
    });

    it("Should revert if user address is zero", async () => {
      const savingBankSigner = await getSavingBankSigner();
      await expect(
        vault
          .connect(savingBankSigner)
          .payInterest(ethers.ZeroAddress, ethers.parseEther("10")),
      ).to.be.revertedWithCustomError(vault, "InvalidAddress");
    });

    it("Should revert if amount is zero", async () => {
      const savingBankSigner = await getSavingBankSigner();
      await expect(
        vault.connect(savingBankSigner).payInterest(addr1.address, 0),
      ).to.be.revertedWithCustomError(vault, "InvalidAmount");
    });

    it("Should revert if insufficient balance", async () => {
      const savingBankSigner = await getSavingBankSigner();
      await expect(
        vault
          .connect(savingBankSigner)
          .payInterest(addr1.address, ethers.parseEther("2000")),
      ).to.be.revertedWithCustomError(vault, "InsufficientBalance");
    });

    it("Should pay interest successfully", async () => {
      const savingBankSigner = await getSavingBankSigner();
      const amount = ethers.parseEther("50");
      const vaultBalanceBefore = await vault.totalBalance();
      const userBalanceBefore = await token.balanceOf(addr1.address);

      await vault.connect(savingBankSigner).payInterest(addr1.address, amount);

      const vaultBalanceAfter = await vault.totalBalance();
      const userBalanceAfter = await token.balanceOf(addr1.address);

      expect(vaultBalanceAfter).to.equal(vaultBalanceBefore - amount);
      expect(userBalanceAfter).to.equal(userBalanceBefore + amount);
    });

    it("Should emit InterestPaid event", async () => {
      const savingBankSigner = await getSavingBankSigner();
      const amount = ethers.parseEther("50");
      await expect(
        vault.connect(savingBankSigner).payInterest(addr1.address, amount),
      )
        .to.emit(vault, "InterestPaid")
        .withArgs(addr1.address, amount);
    });

    it("Should revert when paused", async () => {
      const savingBankSigner = await getSavingBankSigner();
      await pause();
      await expect(
        vault
          .connect(savingBankSigner)
          .payInterest(addr1.address, ethers.parseEther("10")),
      ).to.be.revertedWithCustomError(vault, "EnforcedPause");
    });
  });

  describe("deductInterest", function () {
    beforeEach(async () => {
      await fundVault(ethers.parseEther("1000"));
    });

    it("Should revert if not saving bank", async () => {
      await expect(
        vault
          .connect(addr1)
          .deductInterest(addr1.address, ethers.parseEther("10")),
      ).to.be.revertedWithCustomError(vault, "Unauthorized");
    });

    it("Should revert if user address is zero", async () => {
      const savingBankSigner = await getSavingBankSigner();
      await expect(
        vault
          .connect(savingBankSigner)
          .deductInterest(ethers.ZeroAddress, ethers.parseEther("10")),
      ).to.be.revertedWithCustomError(vault, "InvalidAddress");
    });

    it("Should revert if amount is zero", async () => {
      const savingBankSigner = await getSavingBankSigner();
      await expect(
        vault.connect(savingBankSigner).deductInterest(addr1.address, 0),
      ).to.be.revertedWithCustomError(vault, "InvalidAmount");
    });

    it("Should revert if insufficient balance", async () => {
      const savingBankSigner = await getSavingBankSigner();
      await expect(
        vault
          .connect(savingBankSigner)
          .deductInterest(addr1.address, ethers.parseEther("2000")),
      ).to.be.revertedWithCustomError(vault, "InsufficientBalance");
    });

    it("Should deduct interest successfully (no transfer)", async () => {
      const savingBankSigner = await getSavingBankSigner();
      const amount = ethers.parseEther("50");
      const vaultBalanceBefore = await vault.totalBalance();
      const userBalanceBefore = await token.balanceOf(addr1.address);

      await vault
        .connect(savingBankSigner)
        .deductInterest(addr1.address, amount);

      const vaultBalanceAfter = await vault.totalBalance();
      const userBalanceAfter = await token.balanceOf(addr1.address);

      expect(vaultBalanceAfter).to.equal(vaultBalanceBefore - amount);
      expect(userBalanceAfter).to.equal(userBalanceBefore); // No transfer
    });

    it("Should emit InterestRenewed event", async () => {
      const savingBankSigner = await getSavingBankSigner();
      const amount = ethers.parseEther("50");
      await expect(
        vault.connect(savingBankSigner).deductInterest(addr1.address, amount),
      )
        .to.emit(vault, "InterestRenewed")
        .withArgs(addr1.address, amount);
    });

    it("Should revert when paused", async () => {
      const savingBankSigner = await getSavingBankSigner();
      await pause();
      await expect(
        vault
          .connect(savingBankSigner)
          .deductInterest(addr1.address, ethers.parseEther("10")),
      ).to.be.revertedWithCustomError(vault, "EnforcedPause");
    });
  });

  describe("Pause and Unpause", function () {
    beforeEach(async () => {
      await fundVault(ethers.parseEther("1000"));
    });

    it("Should revert if non-owner tries to pause", async () => {
      await expect(vault.connect(addr1).pause()).to.be.revertedWithCustomError(
        vault,
        "OwnableUnauthorizedAccount",
      );
    });

    it("Should revert if non-owner tries to unpause", async () => {
      await pause();
      await expect(
        vault.connect(addr1).unpause(),
      ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    });

    it("Should pause successfully", async () => {
      await vault.pause();
      expect(await vault.paused()).to.equal(true);
    });

    it("Should unpause successfully", async () => {
      await vault.pause();
      await vault.unpause();
      expect(await vault.paused()).to.equal(false);
    });

    it("Should emit Paused event", async () => {
      await expect(vault.pause())
        .to.emit(vault, "Paused")
        .withArgs(deployer.address);
    });

    it("Should emit Unpaused event", async () => {
      await vault.pause();
      await expect(vault.unpause())
        .to.emit(vault, "Unpaused")
        .withArgs(deployer.address);
    });

    it("Should block payInterest when paused", async () => {
      const savingBankSigner = await getSavingBankSigner();
      await vault.pause();
      await expect(
        vault
          .connect(savingBankSigner)
          .payInterest(addr1.address, ethers.parseEther("10")),
      ).to.be.revertedWithCustomError(vault, "EnforcedPause");
    });

    it("Should block deductInterest when paused", async () => {
      const savingBankSigner = await getSavingBankSigner();
      await vault.pause();
      await expect(
        vault
          .connect(savingBankSigner)
          .deductInterest(addr1.address, ethers.parseEther("10")),
      ).to.be.revertedWithCustomError(vault, "EnforcedPause");
    });

    it("Should allow operations after unpause", async () => {
      const savingBankSigner = await getSavingBankSigner();
      await vault.pause();
      await vault.unpause();

      await expect(
        vault
          .connect(savingBankSigner)
          .payInterest(addr1.address, ethers.parseEther("10")),
      ).to.not.be.reverted;
    });
  });

  describe("View Functions", function () {
    it("Should return correct total balance", async () => {
      expect(await vault.totalBalance()).to.equal(0);

      await fundVault(ethers.parseEther("500"));
      expect(await vault.totalBalance()).to.equal(ethers.parseEther("500"));
    });

    it("Should return correct actual balance", async () => {
      await fundVault(ethers.parseEther("500"));
      expect(await vault.getActualBalance()).to.equal(ethers.parseEther("500"));
      expect(await vault.getActualBalance()).to.equal(
        await token.balanceOf(await vault.getAddress()),
      );
    });

    it("Should return correct balance", async () => {
      await fundVault(ethers.parseEther("500"));
      expect(await vault.getBalance()).to.equal(ethers.parseEther("500"));
      expect(await vault.getBalance()).to.equal(await vault.totalBalance());
    });

    it("Should track balance changes correctly", async () => {
      const savingBankSigner = await getSavingBankSigner();
      await fundVault(ethers.parseEther("1000"));
      expect(await vault.totalBalance()).to.equal(ethers.parseEther("1000"));

      await vault
        .connect(savingBankSigner)
        .payInterest(addr1.address, ethers.parseEther("100"));
      expect(await vault.totalBalance()).to.equal(ethers.parseEther("900"));

      await vault.withdrawVault(ethers.parseEther("200"));
      expect(await vault.totalBalance()).to.equal(ethers.parseEther("700"));
    });
  });
});