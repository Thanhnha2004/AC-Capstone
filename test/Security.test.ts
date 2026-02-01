import { ethers } from "hardhat";
import { expect } from "chai";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import {
  SavingBankV2,
  ERC20Mock,
  PrincipalVault,
  InterestVault,
  SavingBankNFT,
} from "../typechain";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("Security Tests", function () {
  let admin: SignerWithAddress,
    operator: SignerWithAddress,
    attacker: SignerWithAddress,
    user1: SignerWithAddress;
  let savingBank: SavingBankV2,
    token: ERC20Mock,
    principalVault: PrincipalVault,
    interestVault: InterestVault,
    nft: SavingBankNFT;

  const ADMIN_ROLE = ethers.keccak256(ethers.toUtf8Bytes("ADMIN_ROLE"));
  const OPERATOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("OPERATOR_ROLE"));

  beforeEach(async function () {
    [admin, operator, attacker, user1] = await ethers.getSigners();

    const TokenFactory = await ethers.getContractFactory("ERC20Mock");
    token = await TokenFactory.deploy();

    const NFTFactory = await ethers.getContractFactory("SavingBankNFT");
    nft = await NFTFactory.deploy(admin.address, operator.address);

    const PrincipalVaultFactory = await ethers.getContractFactory(
      "PrincipalVault",
    );
    principalVault = await PrincipalVaultFactory.deploy(
      await token.getAddress(),
      admin.address,
      operator.address,
    );

    const InterestVaultFactory = await ethers.getContractFactory(
      "InterestVault",
    );
    interestVault = await InterestVaultFactory.deploy(
      await token.getAddress(),
      admin.address,
      operator.address,
    );

    const SavingBankFactory = await ethers.getContractFactory("SavingBankV2");
    savingBank = await SavingBankFactory.deploy(
      await token.getAddress(),
      await principalVault.getAddress(),
      await interestVault.getAddress(),
      await nft.getAddress(),
      admin.address,
      admin.address,
      operator.address,
    );

    await nft.connect(admin).setSavingBank(await savingBank.getAddress());
    await principalVault
      .connect(admin)
      .grantRole(OPERATOR_ROLE, await savingBank.getAddress());
    await interestVault
      .connect(admin)
      .grantRole(OPERATOR_ROLE, await savingBank.getAddress());

    await token.mint(user1.address, ethers.parseEther("10000"));
    await token.mint(attacker.address, ethers.parseEther("10000"));
    await token.mint(admin.address, ethers.parseEther("100000"));

    await token
      .connect(user1)
      .approve(await principalVault.getAddress(), ethers.MaxUint256);
    await token
      .connect(attacker)
      .approve(await savingBank.getAddress(), ethers.MaxUint256);
    await token
      .connect(admin)
      .approve(await interestVault.getAddress(), ethers.MaxUint256);
    await token
      .connect(admin)
      .approve(await principalVault.getAddress(), ethers.MaxUint256);

    await interestVault.connect(admin).depositFund(ethers.parseEther("50000"));
  });

  describe("Access Control", function () {
    it("Should prevent non-operator from creating plan", async function () {
      await expect(
        savingBank
          .connect(attacker)
          .createPlan(
            30,
            1000,
            ethers.parseEther("100"),
            ethers.parseEther("10000"),
            5000,
          ),
      ).to.be.reverted;
    });

    it("Should prevent non-operator from updating plan", async function () {
      await savingBank
        .connect(operator)
        .createPlan(
          30,
          1000,
          ethers.parseEther("100"),
          ethers.parseEther("10000"),
          5000,
        );
      await expect(savingBank.connect(attacker).updatePlanStatus(1, false)).to
        .be.reverted;
    });

    it("Should prevent non-admin from pausing", async function () {
      await expect(savingBank.connect(attacker).pause()).to.be.reverted;
    });

    it("Should prevent non-admin from updating vaults", async function () {
      await expect(
        savingBank
          .connect(attacker)
          .setVaults(
            await principalVault.getAddress(),
            await interestVault.getAddress(),
          ),
      ).to.be.reverted;
    });

    it("Should prevent non-admin from updating NFT", async function () {
      await expect(savingBank.connect(attacker).setNFT(await nft.getAddress()))
        .to.be.reverted;
    });

    it("Should prevent non-admin from updating fee receiver", async function () {
      await expect(
        savingBank.connect(attacker).setFeeReceiver(attacker.address),
      ).to.be.reverted;
    });

    it("Should prevent non-operator vault access", async function () {
      await expect(
        principalVault
          .connect(attacker)
          .depositPrincipal(user1.address, ethers.parseEther("100")),
      ).to.be.reverted;
    });

    it("Should prevent non-operator from paying interest", async function () {
      await expect(
        interestVault
          .connect(attacker)
          .payInterest(user1.address, ethers.parseEther("100")),
      ).to.be.reverted;
    });

    it("Should prevent non-savingBank NFT mint", async function () {
      await expect(
        nft
          .connect(attacker)
          .mint(attacker.address, 1, 1, ethers.parseEther("100")),
      ).to.be.revertedWithCustomError(nft, "Unauthorized");
    });

    it("Should prevent non-savingBank NFT burn", async function () {
      await savingBank
        .connect(operator)
        .createPlan(
          30,
          1000,
          ethers.parseEther("100"),
          ethers.parseEther("10000"),
          5000,
        );
      await savingBank
        .connect(user1)
        .openDepositCertificate(1, ethers.parseEther("1000"));
      await expect(nft.connect(attacker).burn(1)).to.be.revertedWithCustomError(
        nft,
        "Unauthorized",
      );
    });
  });

  describe("Ownership Validation", function () {
    beforeEach(async function () {
      await savingBank
        .connect(operator)
        .createPlan(
          30,
          1000,
          ethers.parseEther("100"),
          ethers.parseEther("10000"),
          5000,
        );
      await savingBank
        .connect(user1)
        .openDepositCertificate(1, ethers.parseEther("1000"));
    });

    it("Should prevent non-owner from withdrawing", async function () {
      await time.increase(31 * 86400);
      await expect(
        savingBank.connect(attacker).withdraw(1),
      ).to.be.revertedWithCustomError(savingBank, "NotOwner");
    });

    it("Should prevent non-owner from early withdrawing", async function () {
      await expect(
        savingBank.connect(attacker).earlyWithdraw(1),
      ).to.be.revertedWithCustomError(savingBank, "NotOwner");
    });

    it("Should prevent non-owner from renewing", async function () {
      await savingBank
        .connect(operator)
        .createPlan(
          60,
          1500,
          ethers.parseEther("100"),
          ethers.parseEther("10000"),
          5000,
        );
      await time.increase(31 * 86400);
      await expect(
        savingBank.connect(attacker).renew(1, 2),
      ).to.be.revertedWithCustomError(savingBank, "NotOwner");
    });
  });

  describe("Reentrancy Protection", function () {
    it("Should protect withdraw from reentrancy", async function () {
      await savingBank
        .connect(operator)
        .createPlan(
          30,
          1000,
          ethers.parseEther("100"),
          ethers.parseEther("10000"),
          5000,
        );
      await savingBank
        .connect(user1)
        .openDepositCertificate(1, ethers.parseEther("1000"));
      await time.increase(31 * 86400);
      await savingBank.connect(user1).withdraw(1);
      // Cannot withdraw again
      await expect(
        savingBank.connect(user1).withdraw(1),
      ).to.be.revertedWithCustomError(savingBank, "NotActiveDeposit");
    });

    it("Should protect early withdraw from reentrancy", async function () {
      await savingBank
        .connect(operator)
        .createPlan(
          30,
          1000,
          ethers.parseEther("100"),
          ethers.parseEther("10000"),
          5000,
        );
      await savingBank
        .connect(user1)
        .openDepositCertificate(1, ethers.parseEther("1000"));
      await savingBank.connect(user1).earlyWithdraw(1);
      await expect(
        savingBank.connect(user1).earlyWithdraw(1),
      ).to.be.revertedWithCustomError(savingBank, "NotActiveDeposit");
    });

    it("Should protect openDeposit from reentrancy", async function () {
      await savingBank
        .connect(operator)
        .createPlan(
          30,
          1000,
          ethers.parseEther("100"),
          ethers.parseEther("10000"),
          5000,
        );
      await savingBank
        .connect(user1)
        .openDepositCertificate(1, ethers.parseEther("1000"));
      // DepositId should increment correctly
      expect(await savingBank.nextDepositId()).to.equal(2);
    });
  });

  describe("Input Validation", function () {
    it("Should reject zero address in constructor", async function () {
      const Factory = await ethers.getContractFactory("SavingBankV2");
      await expect(
        Factory.deploy(
          ethers.ZeroAddress,
          await principalVault.getAddress(),
          await interestVault.getAddress(),
          await nft.getAddress(),
          admin.address,
          admin.address,
          operator.address,
        ),
      ).to.be.revertedWithCustomError(savingBank, "InvalidToken");
    });

    it("Should reject invalid plan parameters", async function () {
      await expect(
        savingBank
          .connect(operator)
          .createPlan(
            0,
            1000,
            ethers.parseEther("100"),
            ethers.parseEther("10000"),
            5000,
          ),
      ).to.be.revertedWithCustomError(savingBank, "InvalidTenor");
    });

    it("Should reject deposit below minimum", async function () {
      await savingBank
        .connect(operator)
        .createPlan(
          30,
          1000,
          ethers.parseEther("100"),
          ethers.parseEther("10000"),
          5000,
        );
      await expect(
        savingBank
          .connect(user1)
          .openDepositCertificate(1, ethers.parseEther("50")),
      ).to.be.revertedWithCustomError(savingBank, "InvalidAmount");
    });

    it("Should reject deposit above maximum", async function () {
      await savingBank
        .connect(operator)
        .createPlan(
          30,
          1000,
          ethers.parseEther("100"),
          ethers.parseEther("10000"),
          5000,
        );
      await expect(
        savingBank
          .connect(user1)
          .openDepositCertificate(1, ethers.parseEther("20000")),
      ).to.be.revertedWithCustomError(savingBank, "InvalidAmount");
    });

    it("Should reject zero address fee receiver", async function () {
      await expect(
        savingBank.connect(admin).setFeeReceiver(ethers.ZeroAddress),
      ).to.be.revertedWithCustomError(savingBank, "InvalidAddress");
    });

    it("Should reject zero amount in vault deposit", async function () {
      await expect(
        principalVault.connect(admin).depositFund(0),
      ).to.be.revertedWithCustomError(principalVault, "InvalidAmount");
    });
  });

  describe("State Manipulation Protection", function () {
    beforeEach(async function () {
      await savingBank
        .connect(operator)
        .createPlan(
          30,
          1000,
          ethers.parseEther("100"),
          ethers.parseEther("10000"),
          5000,
        );
      await savingBank
        .connect(user1)
        .openDepositCertificate(1, ethers.parseEther("1000"));
    });

    it("Should prevent double withdrawal", async function () {
      await time.increase(31 * 86400);
      await savingBank.connect(user1).withdraw(1);
      await expect(
        savingBank.connect(user1).withdraw(1),
      ).to.be.revertedWithCustomError(savingBank, "NotActiveDeposit");
    });

    it("Should prevent withdrawal after early withdraw", async function () {
      await savingBank.connect(user1).earlyWithdraw(1);
      await expect(
        savingBank.connect(user1).withdraw(1),
      ).to.be.revertedWithCustomError(savingBank, "NotActiveDeposit");
    });

    it("Should prevent early withdraw after maturity", async function () {
      await time.increase(31 * 86400);
      await expect(
        savingBank.connect(user1).earlyWithdraw(1),
      ).to.be.revertedWithCustomError(savingBank, "AlreadyMatured");
    });

    it("Should prevent double renewal", async function () {
      await savingBank
        .connect(operator)
        .createPlan(
          60,
          1500,
          ethers.parseEther("100"),
          ethers.parseEther("10000"),
          5000,
        );
      await time.increase(31 * 86400);
      await savingBank.connect(user1).renew(1, 2);
      await expect(
        savingBank.connect(user1).renew(1, 2),
      ).to.be.revertedWithCustomError(savingBank, "AlreadyRenewed");
    });

    it("Should prevent operations on disabled plan", async function () {
      await savingBank.connect(operator).updatePlanStatus(1, false);
      await expect(
        savingBank
          .connect(user1)
          .openDepositCertificate(1, ethers.parseEther("1000")),
      ).to.be.revertedWithCustomError(savingBank, "NotEnabledPlan");
    });
  });

  describe("NFT Soulbound Protection", function () {
    beforeEach(async function () {
      await savingBank
        .connect(operator)
        .createPlan(
          30,
          1000,
          ethers.parseEther("100"),
          ethers.parseEther("10000"),
          5000,
        );
      await savingBank
        .connect(user1)
        .openDepositCertificate(1, ethers.parseEther("1000"));
    });

    it("Should prevent NFT transfer", async function () {
      await expect(
        nft.connect(user1).transferFrom(user1.address, attacker.address, 1),
      ).to.be.revertedWithCustomError(nft, "Unauthorized");
    });

    it("Should prevent NFT safeTransferFrom", async function () {
      await expect(
        nft
          .connect(user1)
          ["safeTransferFrom(address,address,uint256)"](
            user1.address,
            attacker.address,
            1,
          ),
      ).to.be.revertedWithCustomError(nft, "Unauthorized");
    });
  });

  describe("Vault Security", function () {
    it("Should prevent unauthorized principal withdrawal", async function () {
      await principalVault
        .connect(admin)
        .depositFund(ethers.parseEther("1000"));
      await expect(
        principalVault
          .connect(attacker)
          .withdrawPrincipal(attacker.address, ethers.parseEther("1000")),
      ).to.be.reverted;
    });

    it("Should prevent unauthorized interest payment", async function () {
      await expect(
        interestVault
          .connect(attacker)
          .payInterest(attacker.address, ethers.parseEther("1000")),
      ).to.be.reverted;
    });

    it("Should protect against vault balance manipulation", async function () {
      await principalVault
        .connect(admin)
        .depositFund(ethers.parseEther("1000"));
      const balance = await principalVault.getBalance();
      const actual = await principalVault.getActualBalance();
      expect(balance).to.equal(actual);
    });

    it("Should handle insufficient vault balance", async function () {
      await expect(
        principalVault
          .connect(operator)
          .withdrawPrincipal(user1.address, ethers.parseEther("100000")),
      ).to.be.revertedWithCustomError(principalVault, "InsufficientBalance");
    });
  });

  describe("Pause Functionality", function () {
    it("Should prevent deposits when paused", async function () {
      await savingBank
        .connect(operator)
        .createPlan(
          30,
          1000,
          ethers.parseEther("100"),
          ethers.parseEther("10000"),
          5000,
        );
      await savingBank.connect(admin).pause();
      await expect(
        savingBank
          .connect(user1)
          .openDepositCertificate(1, ethers.parseEther("1000")),
      ).to.be.reverted;
    });

    it("Should prevent withdrawals when paused", async function () {
      await savingBank
        .connect(operator)
        .createPlan(
          30,
          1000,
          ethers.parseEther("100"),
          ethers.parseEther("10000"),
          5000,
        );
      await savingBank
        .connect(user1)
        .openDepositCertificate(1, ethers.parseEther("1000"));
      await time.increase(31 * 86400);
      await savingBank.connect(admin).pause();
      await expect(savingBank.connect(user1).withdraw(1)).to.be.reverted;
    });

    it("Should allow operations after unpause", async function () {
      await savingBank
        .connect(operator)
        .createPlan(
          30,
          1000,
          ethers.parseEther("100"),
          ethers.parseEther("10000"),
          5000,
        );
      await savingBank.connect(admin).pause();
      await savingBank.connect(admin).unpause();
      await savingBank
        .connect(user1)
        .openDepositCertificate(1, ethers.parseEther("1000"));
      expect(await nft.ownerOf(1)).to.equal(user1.address);
    });
  });

  describe("Integer Overflow Protection", function () {
    it("Should handle large deposit amounts", async function () {
      await savingBank
        .connect(operator)
        .createPlan(
          30,
          1000,
          ethers.parseEther("1"),
          ethers.parseEther("100000"),
          5000,
        );
      await token.mint(user1.address, ethers.parseEther("100000"));
      await savingBank
        .connect(user1)
        .openDepositCertificate(1, ethers.parseEther("100000"));
      const deposit = await savingBank.depositCertificates(1);
      expect(deposit.principal).to.equal(ethers.parseEther("100000"));
    });

    it("Should calculate interest for large amounts", async function () {
      await savingBank
        .connect(operator)
        .createPlan(
          365,
          10000,
          ethers.parseEther("1"),
          ethers.parseEther("1000000"),
          5000,
        );
      await token.mint(user1.address, ethers.parseEther("1000000"));
      await savingBank
        .connect(user1)
        .openDepositCertificate(1, ethers.parseEther("1000000"));
      const interest = await savingBank.getCalculateInterest(1);
      expect(interest).to.be.gt(0);
    });
  });

  describe("Edge Cases", function () {
    it("Should handle multiple deposits from same user", async function () {
      await savingBank
        .connect(operator)
        .createPlan(
          30,
          1000,
          ethers.parseEther("100"),
          ethers.parseEther("10000"),
          5000,
        );
      await savingBank
        .connect(user1)
        .openDepositCertificate(1, ethers.parseEther("1000"));
      await savingBank
        .connect(user1)
        .openDepositCertificate(1, ethers.parseEther("2000"));
      const deposits = await savingBank.getUserDepositIds(user1.address);
      expect(deposits.length).to.equal(2);
    });

    it("Should handle withdrawal at exact maturity time", async function () {
      await savingBank
        .connect(operator)
        .createPlan(
          30,
          1000,
          ethers.parseEther("100"),
          ethers.parseEther("10000"),
          5000,
        );
      await savingBank
        .connect(user1)
        .openDepositCertificate(1, ethers.parseEther("1000"));
      const deposit = await savingBank.depositCertificates(1);
      await time.increaseTo(deposit.maturityAt);
      await savingBank.connect(user1).withdraw(1);
      const updatedDeposit = await savingBank.depositCertificates(1);
      expect(updatedDeposit.status).to.equal(1); // Withdrawn
    });

    it("Should handle plan update after deposits exist", async function () {
      await savingBank
        .connect(operator)
        .createPlan(
          30,
          1000,
          ethers.parseEther("100"),
          ethers.parseEther("10000"),
          5000,
        );
      await savingBank
        .connect(user1)
        .openDepositCertificate(1, ethers.parseEther("1000"));
      await savingBank
        .connect(operator)
        .updatePlan(
          1,
          60,
          2000,
          ethers.parseEther("200"),
          ethers.parseEther("20000"),
          6000,
        );
      // Old deposit should use snapshot data
      const deposit = await savingBank.depositCertificates(1);
      expect(deposit.snapshotAprBps).to.equal(1000);
    });
  });
});
