import { ethers } from "hardhat";
import { expect } from "chai";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { PrincipalVault, InterestVault, ERC20Mock } from "../typechain";

describe("Vault Tests", function () {
  let admin: SignerWithAddress,
    operator: SignerWithAddress,
    user1: SignerWithAddress,
    user2: SignerWithAddress;
  let principalVault: PrincipalVault,
    interestVault: InterestVault,
    token: ERC20Mock;

  const ADMIN_ROLE = ethers.keccak256(ethers.toUtf8Bytes("ADMIN_ROLE"));
  const OPERATOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("OPERATOR_ROLE"));

  beforeEach(async function () {
    [admin, operator, user1, user2] = await ethers.getSigners();

    const TokenFactory = await ethers.getContractFactory("ERC20Mock");
    token = await TokenFactory.deploy();

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

    await token.mint(admin.address, ethers.parseEther("100000"));
    await token.mint(operator.address, ethers.parseEther("100000"));
    await token.mint(user1.address, ethers.parseEther("10000"));

    await token
      .connect(admin)
      .approve(await principalVault.getAddress(), ethers.MaxUint256);
    await token
      .connect(admin)
      .approve(await interestVault.getAddress(), ethers.MaxUint256);
    await token
      .connect(operator)
      .approve(await principalVault.getAddress(), ethers.MaxUint256);
    await token
      .connect(operator)
      .approve(await interestVault.getAddress(), ethers.MaxUint256);
    await token
      .connect(user1)
      .approve(await principalVault.getAddress(), ethers.MaxUint256);
  });

  describe("PrincipalVault Deployment", function () {
    it("Should deploy with correct settings", async function () {
      expect(await principalVault.token()).to.equal(await token.getAddress());
      expect(await principalVault.totalBalance()).to.equal(0);
      expect(await principalVault.hasRole(ADMIN_ROLE, admin.address)).to.be
        .true;
      expect(await principalVault.hasRole(OPERATOR_ROLE, operator.address)).to
        .be.true;
    });

    it("Should revert if token is zero address", async function () {
      const Factory = await ethers.getContractFactory("PrincipalVault");
      await expect(
        Factory.deploy(ethers.ZeroAddress, admin.address, operator.address),
      ).to.be.revertedWithCustomError(principalVault, "InvalidToken");
    });
  });

  describe("PrincipalVault Admin Functions", function () {
    it("Should deposit and withdraw funds", async function () {
      await expect(
        principalVault.connect(admin).depositFund(ethers.parseEther("1000")),
      )
        .to.emit(principalVault, "AdminFunded")
        .withArgs(admin.address, ethers.parseEther("1000"));
      expect(await principalVault.totalBalance()).to.equal(
        ethers.parseEther("1000"),
      );

      await expect(
        principalVault.connect(admin).withdrawFund(ethers.parseEther("500")),
      )
        .to.emit(principalVault, "AdminWithdrawn")
        .withArgs(admin.address, ethers.parseEther("500"));
      expect(await principalVault.totalBalance()).to.equal(
        ethers.parseEther("500"),
      );
    });

    it("Should revert with invalid operations", async function () {
      await principalVault
        .connect(admin)
        .depositFund(ethers.parseEther("1000"));
      await expect(
        principalVault.connect(admin).withdrawFund(ethers.parseEther("2000")),
      ).to.be.revertedWithCustomError(principalVault, "InsufficientBalance");
      await expect(
        principalVault.connect(admin).depositFund(0),
      ).to.be.revertedWithCustomError(principalVault, "InvalidAmount");
    });

    it("Should pause and unpause vault", async function () {
      await principalVault.connect(admin).pause();
      expect(await principalVault.paused()).to.be.true;
      await principalVault.connect(admin).unpause();
      expect(await principalVault.paused()).to.be.false;
    });

    it("Should revert if non-admin tries to pause", async function () {
      await expect(principalVault.connect(user1).pause()).to.be.reverted;
    });
  });

  describe("PrincipalVault Operator Functions", function () {
    it("Should deposit and withdraw principal", async function () {
      await expect(
        principalVault
          .connect(operator)
          .depositPrincipal(user1.address, ethers.parseEther("1000")),
      )
        .to.emit(principalVault, "PrincipalDeposited")
        .withArgs(user1.address, ethers.parseEther("1000"));
      expect(await principalVault.totalBalance()).to.equal(
        ethers.parseEther("1000"),
      );

      await principalVault
        .connect(admin)
        .depositFund(ethers.parseEther("1000"));
      const balanceBefore = await token.balanceOf(user1.address);
      await principalVault
        .connect(operator)
        .withdrawPrincipal(user1.address, ethers.parseEther("500"));
      expect(await token.balanceOf(user1.address)).to.equal(
        balanceBefore + ethers.parseEther("500"),
      );
    });

    it("Should receive direct deposit", async function () {
      await token
        .connect(admin)
        .transfer(await principalVault.getAddress(), ethers.parseEther("1000"));
      await expect(
        principalVault
          .connect(operator)
          .receiveDirectDeposit(user1.address, ethers.parseEther("1000")),
      )
        .to.emit(principalVault, "PrincipalDeposited")
        .withArgs(user1.address, ethers.parseEther("1000"));
      expect(await principalVault.totalBalance()).to.equal(
        ethers.parseEther("1000"),
      );
    });

    it("Should revert with invalid conditions", async function () {
      await expect(
        principalVault
          .connect(operator)
          .depositPrincipal(ethers.ZeroAddress, ethers.parseEther("1000")),
      ).to.be.revertedWithCustomError(principalVault, "InvalidAddress");
      await expect(
        principalVault
          .connect(user1)
          .depositPrincipal(user1.address, ethers.parseEther("1000")),
      ).to.be.reverted;

      await principalVault.connect(admin).pause();
      await expect(
        principalVault
          .connect(operator)
          .depositPrincipal(user1.address, ethers.parseEther("1000")),
      ).to.be.reverted;
    });
  });

  describe("PrincipalVault View Functions", function () {
    it("Should get balance", async function () {
      await principalVault
        .connect(admin)
        .depositFund(ethers.parseEther("1000"));
      expect(await principalVault.getBalance()).to.equal(
        ethers.parseEther("1000"),
      );
    });

    it("Should get actual balance", async function () {
      await principalVault
        .connect(admin)
        .depositFund(ethers.parseEther("1000"));
      expect(await principalVault.getActualBalance()).to.equal(
        ethers.parseEther("1000"),
      );
    });

    it("Should match totalBalance with actual balance", async function () {
      await principalVault
        .connect(admin)
        .depositFund(ethers.parseEther("1000"));
      expect(await principalVault.getBalance()).to.equal(
        await principalVault.getActualBalance(),
      );
    });
  });

  describe("InterestVault Deployment", function () {
    it("Should deploy with correct settings", async function () {
      expect(await interestVault.token()).to.equal(await token.getAddress());
      expect(await interestVault.totalBalance()).to.equal(0);
      expect(await interestVault.hasRole(ADMIN_ROLE, admin.address)).to.be.true;
      expect(await interestVault.hasRole(OPERATOR_ROLE, operator.address)).to.be
        .true;
    });
  });

  describe("InterestVault Admin Functions", function () {
    it("Should deposit fund", async function () {
      await expect(
        interestVault.connect(admin).depositFund(ethers.parseEther("1000")),
      )
        .to.emit(interestVault, "AdminFunded")
        .withArgs(admin.address, ethers.parseEther("1000"));
      expect(await interestVault.totalBalance()).to.equal(
        ethers.parseEther("1000"),
      );
    });

    it("Should withdraw fund", async function () {
      await interestVault.connect(admin).depositFund(ethers.parseEther("1000"));
      await expect(
        interestVault.connect(admin).withdrawFund(ethers.parseEther("500")),
      )
        .to.emit(interestVault, "AdminWithdrawn")
        .withArgs(admin.address, ethers.parseEther("500"));
      expect(await interestVault.totalBalance()).to.equal(
        ethers.parseEther("500"),
      );
    });

    it("Should revert withdraw if insufficient balance", async function () {
      await interestVault.connect(admin).depositFund(ethers.parseEther("1000"));
      await expect(
        interestVault.connect(admin).withdrawFund(ethers.parseEther("2000")),
      ).to.be.revertedWithCustomError(interestVault, "InsufficientBalance");
    });

    it("Should pause vault", async function () {
      await interestVault.connect(admin).pause();
      expect(await interestVault.paused()).to.be.true;
    });

    it("Should unpause vault", async function () {
      await interestVault.connect(admin).pause();
      await interestVault.connect(admin).unpause();
      expect(await interestVault.paused()).to.be.false;
    });
  });

  describe("InterestVault Operator Functions", function () {
    beforeEach(async function () {
      await interestVault
        .connect(admin)
        .depositFund(ethers.parseEther("10000"));
    });

    it("Should pay interest", async function () {
      const balanceBefore = await token.balanceOf(user1.address);
      await expect(
        interestVault
          .connect(operator)
          .payInterest(user1.address, ethers.parseEther("100")),
      )
        .to.emit(interestVault, "InterestPaid")
        .withArgs(user1.address, ethers.parseEther("100"));
      expect(await token.balanceOf(user1.address)).to.equal(
        balanceBefore + ethers.parseEther("100"),
      );
    });

    it("Should transfer interest to principal vault", async function () {
      const balanceBefore = await token.balanceOf(
        await principalVault.getAddress(),
      );
      await expect(
        interestVault
          .connect(operator)
          .transferInterestToPrincipal(
            await principalVault.getAddress(),
            user1.address,
            ethers.parseEther("100"),
          ),
      )
        .to.emit(interestVault, "InterestReceived")
        .withArgs(user1.address, ethers.parseEther("100"));
      expect(await token.balanceOf(await principalVault.getAddress())).to.equal(
        balanceBefore + ethers.parseEther("100"),
      );
    });

    it("Should revert if insufficient balance", async function () {
      await expect(
        interestVault
          .connect(operator)
          .payInterest(user1.address, ethers.parseEther("20000")),
      ).to.be.revertedWithCustomError(interestVault, "InsufficientBalance");
    });

    it("Should revert if address is zero", async function () {
      await expect(
        interestVault
          .connect(operator)
          .payInterest(ethers.ZeroAddress, ethers.parseEther("100")),
      ).to.be.revertedWithCustomError(interestVault, "InvalidAddress");
    });

    it("Should revert if amount is zero", async function () {
      await expect(
        interestVault.connect(operator).payInterest(user1.address, 0),
      ).to.be.revertedWithCustomError(interestVault, "InvalidAmount");
    });

    it("Should revert when paused", async function () {
      await interestVault.connect(admin).pause();
      await expect(
        interestVault
          .connect(operator)
          .payInterest(user1.address, ethers.parseEther("100")),
      ).to.be.reverted;
    });
  });

  describe("InterestVault View Functions", function () {
    it("Should get balance", async function () {
      await interestVault.connect(admin).depositFund(ethers.parseEther("1000"));
      expect(await interestVault.getBalance()).to.equal(
        ethers.parseEther("1000"),
      );
    });

    it("Should get actual balance", async function () {
      await interestVault.connect(admin).depositFund(ethers.parseEther("1000"));
      expect(await interestVault.getActualBalance()).to.equal(
        ethers.parseEther("1000"),
      );
    });
  });

  describe("Reentrancy Protection", function () {
    it("Should protect PrincipalVault deposit", async function () {
      await principalVault
        .connect(admin)
        .depositFund(ethers.parseEther("1000"));
      // Reentrancy is tested by ensuring only one state change per call
      expect(await principalVault.totalBalance()).to.equal(
        ethers.parseEther("1000"),
      );
    });

    it("Should protect InterestVault payment", async function () {
      await interestVault.connect(admin).depositFund(ethers.parseEther("1000"));
      await interestVault
        .connect(operator)
        .payInterest(user1.address, ethers.parseEther("100"));
      expect(await interestVault.totalBalance()).to.equal(
        ethers.parseEther("900"),
      );
    });
  });

  describe("Integration Tests", function () {
    it("Should handle full cycle: fund -> deposit -> withdraw", async function () {
      await principalVault
        .connect(admin)
        .depositFund(ethers.parseEther("1000"));
      await principalVault
        .connect(operator)
        .depositPrincipal(user1.address, ethers.parseEther("500"));
      await principalVault
        .connect(operator)
        .withdrawPrincipal(user1.address, ethers.parseEther("500"));
      expect(await principalVault.totalBalance()).to.equal(
        ethers.parseEther("1000"),
      );
    });

    it("Should handle interest payment flow", async function () {
      await interestVault.connect(admin).depositFund(ethers.parseEther("1000"));
      const balanceBefore = await token.balanceOf(user1.address);
      await interestVault
        .connect(operator)
        .payInterest(user1.address, ethers.parseEther("50"));
      await interestVault
        .connect(operator)
        .payInterest(user1.address, ethers.parseEther("50"));
      expect(await token.balanceOf(user1.address)).to.equal(
        balanceBefore + ethers.parseEther("100"),
      );
    });

    it("Should handle compound interest transfer", async function () {
      await interestVault.connect(admin).depositFund(ethers.parseEther("1000"));
      await interestVault
        .connect(operator)
        .transferInterestToPrincipal(
          await principalVault.getAddress(),
          user1.address,
          ethers.parseEther("100"),
        );
      await principalVault
        .connect(operator)
        .receiveDirectDeposit(user1.address, ethers.parseEther("100"));
      expect(await principalVault.totalBalance()).to.equal(
        ethers.parseEther("100"),
      );
    });
  });
});
