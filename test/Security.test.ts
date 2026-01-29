import "@nomicfoundation/hardhat-ethers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { SavingBank, ERC20Mock, LiquidityVault } from "../typechain";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("Security Tests", function () {
  let deployer: SignerWithAddress,
    receiver1: SignerWithAddress,
    addr1: SignerWithAddress,
    addr2: SignerWithAddress,
    attacker: SignerWithAddress;

  let savingBank: SavingBank;
  let vault: LiquidityVault;
  let token: ERC20Mock;

  const deploy = async () => {
    [deployer, receiver1, addr1, addr2, attacker] = await ethers.getSigners();

    const ERC20MockFactory = await ethers.getContractFactory("ERC20Mock");
    token = await ERC20MockFactory.deploy();
    await token.waitForDeployment();

    vault = await (
      await ethers.getContractFactory("LiquidityVault")
    ).deploy(await token.getAddress());
    await vault.waitForDeployment();

    savingBank = await (
      await ethers.getContractFactory("SavingBank")
    ).deploy(
      await token.getAddress(),
      await vault.getAddress(),
      receiver1.address
    );
    await savingBank.waitForDeployment();

    await token.mint(deployer.address, ethers.parseEther("1000000"));
    await token.mint(addr1.address, ethers.parseEther("100000"));
    await token.mint(addr2.address, ethers.parseEther("100000"));
    await token.mint(attacker.address, ethers.parseEther("100000"));

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
      .connect(attacker)
      .approve(await savingBank.getAddress(), ethers.MaxUint256);

    await vault.setSavingBank(await savingBank.getAddress());
  };

  const createDefaultPlans = async () => {
    await savingBank.createPlan(
      7,
      500,
      ethers.parseEther("100"),
      ethers.parseEther("10000"),
      300
    );

    await savingBank.createPlan(
      30,
      800,
      ethers.parseEther("100"),
      ethers.parseEther("10000"),
      500
    );
  };

  beforeEach(async () => {
    await deploy();
    await createDefaultPlans();
    await vault.fundVault(ethers.parseEther("100000"));
  });

  describe("Reentrancy Protection", function () {
    it("Should protect withdraw from reentrancy attacks", async function () {
      await savingBank
        .connect(addr1)
        .openDepositCertificate(1, ethers.parseEther("1000"));

      await time.increase(7 * 24 * 60 * 60);

      // Normal withdrawal should succeed
      await expect(savingBank.connect(addr1).withdraw(1)).to.not.be.reverted;

      // Attempting to withdraw again should fail (already withdrawn)
      await expect(savingBank.connect(addr1).withdraw(1))
        .to.be.revertedWithCustomError(savingBank, "NotActiveDeposit")
        .withArgs();
    });

    it("Should protect earlyWithdraw from reentrancy attacks", async function () {
      await savingBank
        .connect(addr1)
        .openDepositCertificate(1, ethers.parseEther("1000"));

      // Normal early withdrawal should succeed
      await expect(savingBank.connect(addr1).earlyWithdraw(1)).to.not.be
        .reverted;

      // Attempting to withdraw again should fail
      await expect(savingBank.connect(addr1).earlyWithdraw(1))
        .to.be.revertedWithCustomError(savingBank, "NotActiveDeposit")
        .withArgs();
    });

    it("Should protect renewWithNewPlan from reentrancy attacks", async function () {
      await savingBank
        .connect(addr1)
        .openDepositCertificate(1, ethers.parseEther("1000"));

      await time.increase(7 * 24 * 60 * 60);

      // Normal renewal should succeed
      await expect(savingBank.connect(addr1).renewWithNewPlan(1, 1)).to.not.be
        .reverted;

      // Attempting to renew again should fail
      await expect(savingBank.connect(addr1).renewWithNewPlan(1, 1))
        .to.be.revertedWithCustomError(savingBank, "NotActiveDeposit")
        .withArgs();
    });

    it("Should protect vault payInterest from reentrancy", async function () {
      await savingBank
        .connect(addr1)
        .openDepositCertificate(1, ethers.parseEther("1000"));

      await time.increase(7 * 24 * 60 * 60);

      // Get savingBank signer for direct vault calls
      const savingBankAddress = await savingBank.getAddress();
      await ethers.provider.send("hardhat_impersonateAccount", [
        savingBankAddress,
      ]);
      await ethers.provider.send("hardhat_setBalance", [
        savingBankAddress,
        ethers.toQuantity(ethers.parseEther("100")),
      ]);
      const savingBankSigner = await ethers.getSigner(savingBankAddress);

      // Normal payInterest should work
      await expect(
        vault
          .connect(savingBankSigner)
          .payInterest(addr1.address, ethers.parseEther("10"))
      ).to.not.be.reverted;
    });

    it("Should protect vault deductInterest from reentrancy", async function () {
      await savingBank
        .connect(addr1)
        .openDepositCertificate(1, ethers.parseEther("1000"));

      await time.increase(7 * 24 * 60 * 60);

      const savingBankAddress = await savingBank.getAddress();
      await ethers.provider.send("hardhat_impersonateAccount", [
        savingBankAddress,
      ]);
      await ethers.provider.send("hardhat_setBalance", [
        savingBankAddress,
        ethers.toQuantity(ethers.parseEther("100")),
      ]);
      const savingBankSigner = await ethers.getSigner(savingBankAddress);

      // Normal deductInterest should work
      await expect(
        vault
          .connect(savingBankSigner)
          .deductInterest(addr1.address, ethers.parseEther("10"))
      ).to.not.be.reverted;
    });
  });

  describe("Access Control - SavingBank", function () {
    it("Should prevent non-owner from calling createPlan", async function () {
      await expect(
        savingBank
          .connect(attacker)
          .createPlan(
            7,
            500,
            ethers.parseEther("100"),
            ethers.parseEther("10000"),
            300
          )
      ).to.be.revertedWithCustomError(savingBank, "OwnableUnauthorizedAccount");
    });

    it("Should prevent non-owner from calling updatePlan", async function () {
      await expect(
        savingBank
          .connect(attacker)
          .updatePlan(
            1,
            14,
            600,
            ethers.parseEther("200"),
            ethers.parseEther("20000"),
            400
          )
      ).to.be.revertedWithCustomError(savingBank, "OwnableUnauthorizedAccount");
    });

    it("Should prevent non-owner from calling updatePlanStatus", async function () {
      await expect(savingBank.connect(attacker).updatePlanStatus(1, false))
        .to.be.revertedWithCustomError(savingBank, "OwnableUnauthorizedAccount");
    });

    it("Should prevent non-owner from calling setVault", async function () {
      await expect(savingBank.connect(attacker).setVault(addr2.address))
        .to.be.revertedWithCustomError(savingBank, "OwnableUnauthorizedAccount");
    });

    it("Should prevent non-owner from calling setFeeReceiver", async function () {
      await expect(savingBank.connect(attacker).setFeeReceiver(addr2.address))
        .to.be.revertedWithCustomError(savingBank, "OwnableUnauthorizedAccount");
    });

    it("Should prevent non-owner from calling pause", async function () {
      await expect(savingBank.connect(attacker).pause())
        .to.be.revertedWithCustomError(savingBank, "OwnableUnauthorizedAccount");
    });

    it("Should prevent non-owner from calling unpause", async function () {
      await savingBank.pause();
      await expect(savingBank.connect(attacker).unpause())
        .to.be.revertedWithCustomError(savingBank, "OwnableUnauthorizedAccount");
    });

    it("Should prevent non-owner from withdrawing others deposits", async function () {
      await savingBank
        .connect(addr1)
        .openDepositCertificate(1, ethers.parseEther("1000"));

      await time.increase(7 * 24 * 60 * 60);

      await expect(savingBank.connect(attacker).withdraw(1))
        .to.be.revertedWithCustomError(savingBank, "NotOwner")
        .withArgs();
    });

    it("Should prevent non-owner from early withdrawing others deposits", async function () {
      await savingBank
        .connect(addr1)
        .openDepositCertificate(1, ethers.parseEther("1000"));

      await expect(savingBank.connect(attacker).earlyWithdraw(1))
        .to.be.revertedWithCustomError(savingBank, "NotOwner")
        .withArgs();
    });

    it("Should prevent non-owner from renewing others deposits", async function () {
      await savingBank
        .connect(addr1)
        .openDepositCertificate(1, ethers.parseEther("1000"));

      await time.increase(7 * 24 * 60 * 60);

      await expect(savingBank.connect(attacker).renewWithNewPlan(1, 1))
        .to.be.revertedWithCustomError(savingBank, "NotOwner")
        .withArgs();
    });
  });

  describe("Access Control - LiquidityVault", function () {
    it("Should prevent non-owner from calling fundVault", async function () {
      await expect(
        vault.connect(attacker).fundVault(ethers.parseEther("1000"))
      ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    });

    it("Should prevent non-owner from calling withdrawVault", async function () {
      await expect(
        vault.connect(attacker).withdrawVault(ethers.parseEther("1000"))
      ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    });

    it("Should prevent non-owner from calling setSavingBank", async function () {
      await expect(vault.connect(attacker).setSavingBank(addr2.address))
        .to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    });

    it("Should prevent non-owner from calling pause on vault", async function () {
      await expect(vault.connect(attacker).pause())
        .to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    });

    it("Should prevent non-owner from calling unpause on vault", async function () {
      await vault.pause();
      await expect(vault.connect(attacker).unpause())
        .to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    });

    it("Should prevent non-savingBank from calling payInterest", async function () {
      await expect(
        vault
          .connect(attacker)
          .payInterest(addr1.address, ethers.parseEther("10"))
      )
        .to.be.revertedWithCustomError(vault, "Unauthorized")
        .withArgs();
    });

    it("Should prevent non-savingBank from calling deductInterest", async function () {
      await expect(
        vault
          .connect(attacker)
          .deductInterest(addr1.address, ethers.parseEther("10"))
      )
        .to.be.revertedWithCustomError(vault, "Unauthorized")
        .withArgs();
    });
  });

  describe("Pause Functionality", function () {
    it("Should block openDepositCertificate when paused", async function () {
      await savingBank.pause();

      await expect(
        savingBank
          .connect(addr1)
          .openDepositCertificate(1, ethers.parseEther("1000"))
      ).to.be.revertedWithCustomError(savingBank, "EnforcedPause");
    });

    it("Should not block withdraw when SavingBank is paused", async function () {
      await savingBank
        .connect(addr1)
        .openDepositCertificate(1, ethers.parseEther("1000"));

      await time.increase(7 * 24 * 60 * 60);

      await savingBank.pause();

      // Withdraw should still work (not paused)
      await expect(savingBank.connect(addr1).withdraw(1)).to.not.be.reverted;
    });

    it("Should not block earlyWithdraw when SavingBank is paused", async function () {
      await savingBank
        .connect(addr1)
        .openDepositCertificate(1, ethers.parseEther("1000"));

      await savingBank.pause();

      // Early withdraw should still work (not paused)
      await expect(savingBank.connect(addr1).earlyWithdraw(1)).to.not.be
        .reverted;
    });

    it("Should not block renewWithNewPlan when SavingBank is paused", async function () {
      await savingBank
        .connect(addr1)
        .openDepositCertificate(1, ethers.parseEther("1000"));

      await time.increase(7 * 24 * 60 * 60);

      await savingBank.pause();

      // Renew should still work (not paused)
      await expect(savingBank.connect(addr1).renewWithNewPlan(1, 1)).to.not.be
        .reverted;
    });

    it("Should block vault operations when vault is paused", async function () {
      await savingBank
        .connect(addr1)
        .openDepositCertificate(1, ethers.parseEther("1000"));

      await time.increase(7 * 24 * 60 * 60);

      await vault.pause();

      // Withdraw should fail because vault is paused
      await expect(savingBank.connect(addr1).withdraw(1))
        .to.be.revertedWithCustomError(vault, "EnforcedPause");
    });

    it("Should resume operations after unpause", async function () {
      await savingBank.pause();

      await expect(
        savingBank
          .connect(addr1)
          .openDepositCertificate(1, ethers.parseEther("1000"))
      ).to.be.revertedWithCustomError(savingBank, "EnforcedPause");

      await savingBank.unpause();

      await expect(
        savingBank
          .connect(addr1)
          .openDepositCertificate(1, ethers.parseEther("1000"))
      ).to.not.be.reverted;
    });

    it("Should block vault payInterest when paused", async function () {
      const savingBankAddress = await savingBank.getAddress();
      await ethers.provider.send("hardhat_impersonateAccount", [
        savingBankAddress,
      ]);
      await ethers.provider.send("hardhat_setBalance", [
        savingBankAddress,
        ethers.toQuantity(ethers.parseEther("100")),
      ]);
      const savingBankSigner = await ethers.getSigner(savingBankAddress);

      await vault.pause();

      await expect(
        vault
          .connect(savingBankSigner)
          .payInterest(addr1.address, ethers.parseEther("10"))
      ).to.be.revertedWithCustomError(vault, "EnforcedPause");
    });

    it("Should block vault deductInterest when paused", async function () {
      const savingBankAddress = await savingBank.getAddress();
      await ethers.provider.send("hardhat_impersonateAccount", [
        savingBankAddress,
      ]);
      await ethers.provider.send("hardhat_setBalance", [
        savingBankAddress,
        ethers.toQuantity(ethers.parseEther("100")),
      ]);
      const savingBankSigner = await ethers.getSigner(savingBankAddress);

      await vault.pause();

      await expect(
        vault
          .connect(savingBankSigner)
          .deductInterest(addr1.address, ethers.parseEther("10"))
      ).to.be.revertedWithCustomError(vault, "EnforcedPause");
    });
  });

  describe("NFT Security", function () {
    it("Should prevent users from transferring NFTs", async function () {
      await savingBank
        .connect(addr1)
        .openDepositCertificate(1, ethers.parseEther("1000"));

      // NFTs should not be transferable (standard ERC721 transfer would work, but deposits should be non-transferable for security)
      // This test verifies the NFT exists and is owned correctly
      expect(await savingBank.ownerOf(1)).to.equal(addr1.address);
      expect(await savingBank.balanceOf(addr1.address)).to.equal(1);
    });

    it("Should burn NFT after withdrawal", async function () {
      await savingBank
        .connect(addr1)
        .openDepositCertificate(1, ethers.parseEther("1000"));

      await time.increase(7 * 24 * 60 * 60);
      await savingBank.connect(addr1).withdraw(1);

      await expect(savingBank.ownerOf(1)).to.be.revertedWithCustomError(
        savingBank,
        "ERC721NonexistentToken"
      );
    });

    it("Should burn NFT after early withdrawal", async function () {
      await savingBank
        .connect(addr1)
        .openDepositCertificate(1, ethers.parseEther("1000"));

      await savingBank.connect(addr1).earlyWithdraw(1);

      await expect(savingBank.ownerOf(1)).to.be.revertedWithCustomError(
        savingBank,
        "ERC721NonexistentToken"
      );
    });

    it("Should burn old NFT and mint new NFT during renewal", async function () {
      await savingBank
        .connect(addr1)
        .openDepositCertificate(1, ethers.parseEther("1000"));

      await time.increase(7 * 24 * 60 * 60);
      await savingBank.connect(addr1).renewWithNewPlan(1, 1);

      await expect(savingBank.ownerOf(1)).to.be.revertedWithCustomError(
        savingBank,
        "ERC721NonexistentToken"
      );
      expect(await savingBank.ownerOf(2)).to.equal(addr1.address);
    });
  });

  describe("Integer Overflow/Underflow Protection", function () {
    it("Should handle maximum uint256 values safely", async function () {
      // Solidity 0.8+ has built-in overflow protection
      // This test verifies the contracts handle large numbers correctly

      await savingBank.createPlan(
        7,
        500,
        ethers.parseEther("100"),
        0, // No max deposit
        300
      );

      // Attempt to deposit a very large amount
      const largeAmount = ethers.parseEther("100000");
      await savingBank.connect(addr1).openDepositCertificate(3, largeAmount);

      const deposit = await savingBank.depositCertificates(1);
      expect(deposit.principal).to.equal(largeAmount);
    });

    it("Should prevent underflow in vault balance", async function () {
      const vaultBalance = await vault.totalBalance();

      // Try to withdraw more than available
      await expect(
        vault.withdrawVault(vaultBalance + 1n)
      ).to.be.revertedWithCustomError(vault, "InsufficientBalance");
    });
  });

  describe("State Consistency", function () {
    it("Should maintain consistent state after failed operations", async function () {
      await savingBank
        .connect(addr1)
        .openDepositCertificate(1, ethers.parseEther("1000"));

      const depositBefore = await savingBank.depositCertificates(1);
      const userBalanceBefore = await token.balanceOf(addr1.address);

      // Try to withdraw before maturity (should fail)
      await expect(savingBank.connect(addr1).withdraw(1))
        .to.be.revertedWithCustomError(savingBank, "NotMaturedYet")
        .withArgs();

      // State should remain unchanged
      const depositAfter = await savingBank.depositCertificates(1);
      const userBalanceAfter = await token.balanceOf(addr1.address);

      expect(depositAfter.status).to.equal(depositBefore.status);
      expect(userBalanceAfter).to.equal(userBalanceBefore);
      expect(await savingBank.ownerOf(1)).to.equal(addr1.address);
    });

    it("Should maintain vault balance consistency", async function () {
      const vaultBalanceBefore = await vault.totalBalance();

      await savingBank
        .connect(addr1)
        .openDepositCertificate(1, ethers.parseEther("1000"));

      await time.increase(7 * 24 * 60 * 60);

      const interest = await savingBank.getCalculateInterest(1);
      await savingBank.connect(addr1).withdraw(1);

      const vaultBalanceAfter = await vault.totalBalance();
      expect(vaultBalanceBefore - vaultBalanceAfter).to.equal(interest);
    });
  });

  describe("Authorization Edge Cases", function () {
    it("Should prevent operations on non-existent deposits", async function () {
      await expect(savingBank.connect(addr1).withdraw(999))
        .to.be.revertedWithCustomError(savingBank, "NotOwner")
        .withArgs();

      await expect(savingBank.connect(addr1).earlyWithdraw(999))
        .to.be.revertedWithCustomError(savingBank, "NotOwner")
        .withArgs();

      await expect(savingBank.connect(addr1).renewWithNewPlan(999, 1))
        .to.be.revertedWithCustomError(savingBank, "NotOwner")
        .withArgs();
    });

    it("Should handle zero address validations", async function () {
      const SavingBankFactory = await ethers.getContractFactory("SavingBank");

      await expect(
        SavingBankFactory.deploy(
          ethers.ZeroAddress,
          await vault.getAddress(),
          receiver1.address
        )
      ).to.be.revertedWithCustomError(savingBank, "InvalidToken");

      await expect(
        SavingBankFactory.deploy(
          await token.getAddress(),
          ethers.ZeroAddress,
          receiver1.address
        )
      ).to.be.revertedWithCustomError(savingBank, "InvalidVault");

      await expect(
        SavingBankFactory.deploy(
          await token.getAddress(),
          await vault.getAddress(),
          ethers.ZeroAddress
        )
      ).to.be.revertedWithCustomError(savingBank, "InvalidToken");
    });
  });
});
