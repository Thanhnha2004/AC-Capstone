import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import {
  ERC20Mock,
  PrincipalVaultUpgradeable,
  InterestVaultUpgradeable,
} from "../../typechain";

describe("Vaults Upgrade Tests", function () {
  // Signers
  let admin: SignerWithAddress;
  let operator: SignerWithAddress;
  let user1: SignerWithAddress;

  // Contract instances with TypeChain types
  let token: ERC20Mock;
  let principalVault: PrincipalVaultUpgradeable;
  let interestVault: InterestVaultUpgradeable;
  let upgradedPrincipalVault: PrincipalVaultUpgradeable;
  let upgradedInterestVault: InterestVaultUpgradeable;

  /**
   * Deploy fixture for testing
   */
  async function deployVaultsFixture() {
    [admin, operator, user1] = await ethers.getSigners();

    // 1. Deploy Mock Token
    const ERC20MockFactory = await ethers.getContractFactory("ERC20Mock");
    token = (await ERC20MockFactory.deploy()) as ERC20Mock;
    await token.waitForDeployment();

    // 2. Deploy PrincipalVault as Proxy
    const PrincipalVaultFactory = await ethers.getContractFactory(
      "PrincipalVaultUpgradeable",
    );
    const principalProxy = await upgrades.deployProxy(
      PrincipalVaultFactory,
      [await token.getAddress(), admin.address, operator.address],
      { initializer: "initialize", kind: "uups" },
    );
    await principalProxy.waitForDeployment();
    principalVault = principalProxy as unknown as PrincipalVaultUpgradeable;

    // 3. Deploy InterestVault as Proxy
    const InterestVaultFactory = await ethers.getContractFactory(
      "InterestVaultUpgradeable",
    );
    const interestProxy = await upgrades.deployProxy(
      InterestVaultFactory,
      [await token.getAddress(), admin.address, operator.address],
      { initializer: "initialize", kind: "uups" },
    );
    await interestProxy.waitForDeployment();
    interestVault = interestProxy as unknown as InterestVaultUpgradeable;

    // 4. Mint tokens
    await token.mint(admin.address, ethers.parseEther("10000"));
    await token.mint(user1.address, ethers.parseEther("10000"));

    return {
      token,
      principalVault,
      interestVault,
      admin,
      operator,
      user1,
    };
  }

  describe("PrincipalVault Upgrade", function () {
    it("Should preserve state after upgrade", async function () {
      const { principalVault, token, admin } = await loadFixture(
        deployVaultsFixture,
      );

      // Deposit funds before upgrade
      await token
        .connect(admin)
        .approve(await principalVault.getAddress(), ethers.parseEther("1000"));
      await principalVault
        .connect(admin)
        .depositFund(ethers.parseEther("1000"));

      // Capture state before upgrade
      const balanceBefore = await principalVault.totalBalance();
      const tokenAddressBefore = await principalVault.token();
      const actualBalanceBefore = await principalVault.getActualBalance();

      console.log("\n📊 PrincipalVault State before upgrade:");
      console.log("  Total Balance:", ethers.formatEther(balanceBefore));
      console.log("  Actual Balance:", ethers.formatEther(actualBalanceBefore));
      console.log("  Token Address:", tokenAddressBefore);

      // Upgrade
      console.log("\n⬆️  Upgrading PrincipalVault...");
      const PrincipalVaultFactory = await ethers.getContractFactory(
        "PrincipalVaultUpgradeable",
      );
      const upgraded = await upgrades.upgradeProxy(
        await principalVault.getAddress(),
        PrincipalVaultFactory,
        { kind: "uups" },
      );
      await upgraded.waitForDeployment();
      upgradedPrincipalVault = upgraded as unknown as PrincipalVaultUpgradeable;
      console.log("✅ Upgrade completed");

      // Verify state after upgrade
      const balanceAfter = await upgradedPrincipalVault.totalBalance();
      const tokenAddressAfter = await upgradedPrincipalVault.token();
      const actualBalanceAfter =
        await upgradedPrincipalVault.getActualBalance();

      console.log("\n📊 PrincipalVault State after upgrade:");
      console.log("  Total Balance:", ethers.formatEther(balanceAfter));
      console.log("  Actual Balance:", ethers.formatEther(actualBalanceAfter));
      console.log("  Token Address:", tokenAddressAfter);

      // Assertions
      expect(balanceAfter).to.equal(balanceBefore);
      expect(tokenAddressAfter).to.equal(tokenAddressBefore);
      expect(actualBalanceAfter).to.equal(actualBalanceBefore);

      console.log("\n✅ All state preserved!");
    });

    it("Should allow admin to upgrade", async function () {
      const { principalVault, admin } = await loadFixture(deployVaultsFixture);

      const PrincipalVaultFactory = await ethers.getContractFactory(
        "PrincipalVaultUpgradeable",
      );

      await expect(
        upgrades.upgradeProxy(
          await principalVault.getAddress(),
          PrincipalVaultFactory.connect(admin),
          { kind: "uups" },
        ),
      ).to.not.be.reverted;
    });

    it("Should prevent non-admin from upgrading", async function () {
      const { principalVault, user1 } = await loadFixture(deployVaultsFixture);

      const PrincipalVaultFactory = await ethers.getContractFactory(
        "PrincipalVaultUpgradeable",
      );

      await expect(
        upgrades.upgradeProxy(
          await principalVault.getAddress(),
          PrincipalVaultFactory.connect(user1),
          { kind: "uups" },
        ),
      ).to.be.reverted;
    });

    it("Should allow deposits after upgrade", async function () {
      const { principalVault, token, admin } = await loadFixture(
        deployVaultsFixture,
      );

      // Upgrade first
      const PrincipalVaultFactory = await ethers.getContractFactory(
        "PrincipalVaultUpgradeable",
      );
      const upgraded = await upgrades.upgradeProxy(
        await principalVault.getAddress(),
        PrincipalVaultFactory,
        { kind: "uups" },
      );
      upgradedPrincipalVault = upgraded as unknown as PrincipalVaultUpgradeable;

      // Test deposit after upgrade
      await token
        .connect(admin)
        .approve(
          await upgradedPrincipalVault.getAddress(),
          ethers.parseEther("500"),
        );

      await expect(
        upgradedPrincipalVault
          .connect(admin)
          .depositFund(ethers.parseEther("500")),
      )
        .to.emit(upgradedPrincipalVault, "AdminFunded")
        .withArgs(admin.address, ethers.parseEther("500"));

      expect(await upgradedPrincipalVault.totalBalance()).to.equal(
        ethers.parseEther("500"),
      );
    });

    it("Should allow withdrawals after upgrade", async function () {
      const { principalVault, token, admin } = await loadFixture(
        deployVaultsFixture,
      );

      // Deposit before upgrade
      await token
        .connect(admin)
        .approve(await principalVault.getAddress(), ethers.parseEther("1000"));
      await principalVault
        .connect(admin)
        .depositFund(ethers.parseEther("1000"));

      // Upgrade
      const PrincipalVaultFactory = await ethers.getContractFactory(
        "PrincipalVaultUpgradeable",
      );
      const upgraded = await upgrades.upgradeProxy(
        await principalVault.getAddress(),
        PrincipalVaultFactory,
        { kind: "uups" },
      );
      upgradedPrincipalVault = upgraded as unknown as PrincipalVaultUpgradeable;

      // Withdraw after upgrade
      await expect(
        upgradedPrincipalVault
          .connect(admin)
          .withdrawFund(ethers.parseEther("500")),
      )
        .to.emit(upgradedPrincipalVault, "AdminWithdrawn")
        .withArgs(admin.address, ethers.parseEther("500"));

      expect(await upgradedPrincipalVault.totalBalance()).to.equal(
        ethers.parseEther("500"),
      );
    });

    it("Should allow operator functions after upgrade", async function () {
      const { principalVault, token, admin, operator, user1 } =
        await loadFixture(deployVaultsFixture);

      // Fund vault before upgrade
      await token
        .connect(admin)
        .approve(await principalVault.getAddress(), ethers.parseEther("1000"));
      await principalVault
        .connect(admin)
        .depositFund(ethers.parseEther("1000"));

      // Upgrade
      const PrincipalVaultFactory = await ethers.getContractFactory(
        "PrincipalVaultUpgradeable",
      );
      const upgraded = await upgrades.upgradeProxy(
        await principalVault.getAddress(),
        PrincipalVaultFactory,
        { kind: "uups" },
      );
      upgradedPrincipalVault = upgraded as unknown as PrincipalVaultUpgradeable;

      // Test withdrawPrincipal after upgrade
      await expect(
        upgradedPrincipalVault
          .connect(operator)
          .withdrawPrincipal(user1.address, ethers.parseEther("100")),
      )
        .to.emit(upgradedPrincipalVault, "PrincipalWithdrawn")
        .withArgs(user1.address, ethers.parseEther("100"));

      expect(await upgradedPrincipalVault.totalBalance()).to.equal(
        ethers.parseEther("900"),
      );
    });

    it("Should preserve pause state after upgrade", async function () {
      const { principalVault, admin } = await loadFixture(deployVaultsFixture);

      // Pause before upgrade
      await principalVault.connect(admin).pause();
      expect(await principalVault.paused()).to.be.true;

      // Upgrade
      const PrincipalVaultFactory = await ethers.getContractFactory(
        "PrincipalVaultUpgradeable",
      );
      const upgraded = await upgrades.upgradeProxy(
        await principalVault.getAddress(),
        PrincipalVaultFactory,
        { kind: "uups" },
      );
      upgradedPrincipalVault = upgraded as unknown as PrincipalVaultUpgradeable;

      // Verify pause state preserved
      expect(await upgradedPrincipalVault.paused()).to.be.true;

      // Should be able to unpause
      await upgradedPrincipalVault.connect(admin).unpause();
      expect(await upgradedPrincipalVault.paused()).to.be.false;
    });
  });

  describe("InterestVault Upgrade", function () {
    it("Should preserve state after upgrade", async function () {
      const { interestVault, token, admin } = await loadFixture(
        deployVaultsFixture,
      );

      // Deposit funds before upgrade
      await token
        .connect(admin)
        .approve(await interestVault.getAddress(), ethers.parseEther("2000"));
      await interestVault.connect(admin).depositFund(ethers.parseEther("2000"));

      // Capture state before upgrade
      const balanceBefore = await interestVault.totalBalance();
      const tokenAddressBefore = await interestVault.token();
      const actualBalanceBefore = await interestVault.getActualBalance();

      console.log("\n📊 InterestVault State before upgrade:");
      console.log("  Total Balance:", ethers.formatEther(balanceBefore));
      console.log("  Actual Balance:", ethers.formatEther(actualBalanceBefore));

      // Upgrade
      console.log("\n⬆️  Upgrading InterestVault...");
      const InterestVaultFactory = await ethers.getContractFactory(
        "InterestVaultUpgradeable",
      );
      const upgraded = await upgrades.upgradeProxy(
        await interestVault.getAddress(),
        InterestVaultFactory,
        { kind: "uups" },
      );
      await upgraded.waitForDeployment();
      upgradedInterestVault = upgraded as unknown as InterestVaultUpgradeable;
      console.log("✅ Upgrade completed");

      // Verify state after upgrade
      const balanceAfter = await upgradedInterestVault.totalBalance();
      const tokenAddressAfter = await upgradedInterestVault.token();
      const actualBalanceAfter = await upgradedInterestVault.getActualBalance();

      console.log("\n📊 InterestVault State after upgrade:");
      console.log("  Total Balance:", ethers.formatEther(balanceAfter));
      console.log("  Actual Balance:", ethers.formatEther(actualBalanceAfter));

      // Assertions
      expect(balanceAfter).to.equal(balanceBefore);
      expect(tokenAddressAfter).to.equal(tokenAddressBefore);
      expect(actualBalanceAfter).to.equal(actualBalanceBefore);

      console.log("\n✅ All state preserved!");
    });

    it("Should allow payInterest after upgrade", async function () {
      const { interestVault, token, admin, operator, user1 } =
        await loadFixture(deployVaultsFixture);

      // Fund vault before upgrade
      await token
        .connect(admin)
        .approve(await interestVault.getAddress(), ethers.parseEther("1000"));
      await interestVault.connect(admin).depositFund(ethers.parseEther("1000"));

      // Upgrade
      const InterestVaultFactory = await ethers.getContractFactory(
        "InterestVaultUpgradeable",
      );
      const upgraded = await upgrades.upgradeProxy(
        await interestVault.getAddress(),
        InterestVaultFactory,
        { kind: "uups" },
      );
      upgradedInterestVault = upgraded as unknown as InterestVaultUpgradeable;

      // Test payInterest after upgrade
      await expect(
        upgradedInterestVault
          .connect(operator)
          .payInterest(user1.address, ethers.parseEther("100")),
      )
        .to.emit(upgradedInterestVault, "InterestPaid")
        .withArgs(user1.address, ethers.parseEther("100"));

      expect(await upgradedInterestVault.totalBalance()).to.equal(
        ethers.parseEther("900"),
      );
    });

    it("Should allow transferInterestToPrincipal after upgrade", async function () {
      const { interestVault, principalVault, token, admin, operator } =
        await loadFixture(deployVaultsFixture);

      // Fund interest vault
      await token
        .connect(admin)
        .approve(await interestVault.getAddress(), ethers.parseEther("1000"));
      await interestVault.connect(admin).depositFund(ethers.parseEther("1000"));

      // Upgrade
      const InterestVaultFactory = await ethers.getContractFactory(
        "InterestVaultUpgradeable",
      );
      const upgraded = await upgrades.upgradeProxy(
        await interestVault.getAddress(),
        InterestVaultFactory,
        { kind: "uups" },
      );
      upgradedInterestVault = upgraded as unknown as InterestVaultUpgradeable;

      // Test transferInterestToPrincipal
      const principalVaultAddress = await principalVault.getAddress();

      await expect(
        upgradedInterestVault
          .connect(operator)
          .transferInterestToPrincipal(
            principalVaultAddress,
            admin.address,
            ethers.parseEther("200"),
          ),
      )
        .to.emit(upgradedInterestVault, "InterestReceived")
        .withArgs(admin.address, ethers.parseEther("200"));

      expect(await upgradedInterestVault.totalBalance()).to.equal(
        ethers.parseEther("800"),
      );
    });

    it("Should maintain role permissions after upgrade", async function () {
      const { interestVault, admin, user1 } = await loadFixture(
        deployVaultsFixture,
      );

      // Upgrade
      const InterestVaultFactory = await ethers.getContractFactory(
        "InterestVaultUpgradeable",
      );
      const upgraded = await upgrades.upgradeProxy(
        await interestVault.getAddress(),
        InterestVaultFactory,
        { kind: "uups" },
      );
      upgradedInterestVault = upgraded as unknown as InterestVaultUpgradeable;

      // Admin should still have ADMIN_ROLE
      const ADMIN_ROLE = await upgradedInterestVault.ADMIN_ROLE();
      expect(await upgradedInterestVault.hasRole(ADMIN_ROLE, admin.address)).to
        .be.true;

      // User1 should not have ADMIN_ROLE
      expect(await upgradedInterestVault.hasRole(ADMIN_ROLE, user1.address)).to
        .be.false;
    });
  });

  describe("Both Vaults Interaction After Upgrade", function () {
    it("Should allow transfer between vaults after upgrade", async function () {
      const { principalVault, interestVault, token, admin, operator } =
        await loadFixture(deployVaultsFixture);

      // Fund both vaults before upgrade
      await token
        .connect(admin)
        .approve(await principalVault.getAddress(), ethers.parseEther("1000"));
      await principalVault
        .connect(admin)
        .depositFund(ethers.parseEther("1000"));

      await token
        .connect(admin)
        .approve(await interestVault.getAddress(), ethers.parseEther("500"));
      await interestVault.connect(admin).depositFund(ethers.parseEther("500"));

      // Upgrade both vaults
      const PrincipalVaultFactory = await ethers.getContractFactory(
        "PrincipalVaultUpgradeable",
      );
      const InterestVaultFactory = await ethers.getContractFactory(
        "InterestVaultUpgradeable",
      );

      const upgradedPrincipal = await upgrades.upgradeProxy(
        await principalVault.getAddress(),
        PrincipalVaultFactory,
        { kind: "uups" },
      );
      upgradedPrincipalVault =
        upgradedPrincipal as unknown as PrincipalVaultUpgradeable;

      const upgradedInterest = await upgrades.upgradeProxy(
        await interestVault.getAddress(),
        InterestVaultFactory,
        { kind: "uups" },
      );
      upgradedInterestVault =
        upgradedInterest as unknown as InterestVaultUpgradeable;

      // Test interaction: transfer from interest to principal
      const principalBalanceBefore =
        await upgradedPrincipalVault.totalBalance();
      const interestBalanceBefore = await upgradedInterestVault.totalBalance();

      await expect(
        upgradedInterestVault
          .connect(operator)
          .transferInterestToPrincipal(
            await upgradedPrincipalVault.getAddress(),
            admin.address,
            ethers.parseEther("100"),
          ),
      ).to.not.be.reverted;

      // Interest vault balance should decrease
      expect(await upgradedInterestVault.totalBalance()).to.equal(
        interestBalanceBefore - ethers.parseEther("100"),
      );

      console.log("\n✅ Both vaults working together after upgrade!");
    });
  });

  describe("Storage Layout Validation", function () {
    it("Should validate PrincipalVault storage layout", async function () {
      const { principalVault } = await loadFixture(deployVaultsFixture);

      const PrincipalVaultFactory = await ethers.getContractFactory(
        "PrincipalVaultUpgradeable",
      );

      await expect(
        upgrades.validateUpgrade(
          await principalVault.getAddress(),
          PrincipalVaultFactory,
          { kind: "uups" },
        ),
      ).to.not.be.rejected;
    });

    it("Should validate InterestVault storage layout", async function () {
      const { interestVault } = await loadFixture(deployVaultsFixture);

      const InterestVaultFactory = await ethers.getContractFactory(
        "InterestVaultUpgradeable",
      );

      await expect(
        upgrades.validateUpgrade(
          await interestVault.getAddress(),
          InterestVaultFactory,
          { kind: "uups" },
        ),
      ).to.not.be.rejected;
    });
  });

  describe("Proxy Address Consistency", function () {
    it("Should keep same proxy addresses after upgrade", async function () {
      const { principalVault, interestVault } = await loadFixture(
        deployVaultsFixture,
      );

      const principalAddressBefore = await principalVault.getAddress();
      const interestAddressBefore = await interestVault.getAddress();

      // Upgrade both
      const PrincipalVaultFactory = await ethers.getContractFactory(
        "PrincipalVaultUpgradeable",
      );
      const InterestVaultFactory = await ethers.getContractFactory(
        "InterestVaultUpgradeable",
      );

      const upgradedPrincipal = await upgrades.upgradeProxy(
        principalAddressBefore,
        PrincipalVaultFactory,
        { kind: "uups" },
      );

      const upgradedInterest = await upgrades.upgradeProxy(
        interestAddressBefore,
        InterestVaultFactory,
        { kind: "uups" },
      );

      expect(await upgradedPrincipal.getAddress()).to.equal(
        principalAddressBefore,
      );
      expect(await upgradedInterest.getAddress()).to.equal(
        interestAddressBefore,
      );

      console.log("\n✅ Proxy addresses unchanged:");
      console.log("  PrincipalVault:", principalAddressBefore);
      console.log("  InterestVault:", interestAddressBefore);
    });
  });
});
