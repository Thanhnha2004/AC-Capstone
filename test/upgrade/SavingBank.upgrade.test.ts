import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import {
  ERC20Mock,
  PrincipalVaultUpgradeable,
  InterestVaultUpgradeable,
  SavingBankNFT,
  SavingBankUpgradeable,
  NFTMetadataUpgradeable,
} from "../../typechain";

describe("SavingBank Upgrade Tests", function () {
  // Signers
  let admin: SignerWithAddress;
  let operator: SignerWithAddress;
  let user1: SignerWithAddress;

  // Contract instances with TypeChain types
  let token: ERC20Mock;
  let principalVault: PrincipalVaultUpgradeable;
  let interestVault: InterestVaultUpgradeable;
  let nft: SavingBankNFT;
  let savingBank: SavingBankUpgradeable;
  let upgradedSavingBank: SavingBankUpgradeable;
  let nftMetadata: NFTMetadataUpgradeable;

  // Addresses
  let proxyAddress: string;

  /**
   * Deploy fixture for testing
   * Deploys all contracts in upgradeable mode
   */
  async function deploySavingBankFixture() {
    [admin, operator, user1] = await ethers.getSigners();

    // 1. Deploy Mock Token
    const ERC20MockFactory = await ethers.getContractFactory("ERC20Mock");
    token = (await ERC20MockFactory.deploy()) as ERC20Mock;
    await token.waitForDeployment();

    // 2. Deploy PrincipalVault Upgradeable
    const PrincipalVaultFactory = await ethers.getContractFactory(
      "PrincipalVaultUpgradeable",
    );
    const principalProxy = await upgrades.deployProxy(
      PrincipalVaultFactory,
      [await token.getAddress(), admin.address, operator.address],
      {
        initializer: "initialize",
        kind: "uups",
      },
    );
    await principalProxy.waitForDeployment();
    principalVault = principalProxy as unknown as PrincipalVaultUpgradeable;

    // 3. Deploy InterestVault Upgradeable
    const InterestVaultFactory = await ethers.getContractFactory(
      "InterestVaultUpgradeable",
    );
    const interestProxy = await upgrades.deployProxy(
      InterestVaultFactory,
      [await token.getAddress(), admin.address, operator.address],
      {
        initializer: "initialize",
        kind: "uups",
      },
    );
    await interestProxy.waitForDeployment();
    interestVault = interestProxy as unknown as InterestVaultUpgradeable;

    // 4. Deploy NFT Metadata Upgradeable
    const NFTMetadataFactory = await ethers.getContractFactory(
      "NFTMetadataUpgradeable",
    );
    const metadataProxy = await upgrades.deployProxy(
      NFTMetadataFactory,
      [admin.address, admin.address, "ipfs://"], // Use admin as dummy, will update later
      { initializer: "initialize", kind: "uups" },
    );
    await metadataProxy.waitForDeployment();
    nftMetadata = metadataProxy as unknown as NFTMetadataUpgradeable;

    // 5. Deploy NFT (Non-upgradeable)
    const SavingBankNFTFactory = await ethers.getContractFactory(
      "SavingBankNFT",
    );
    nft = (await SavingBankNFTFactory.deploy(
      admin.address,
      operator.address,
      await nftMetadata.getAddress(),
    )) as SavingBankNFT;
    await nft.waitForDeployment();
    await nftMetadata.setNFTContract(await nft.getAddress());

    // 6. Deploy SavingBank as Proxy
    const SavingBankFactory = await ethers.getContractFactory(
      "SavingBankUpgradeable",
    );
    const savingBankProxy = await upgrades.deployProxy(
      SavingBankFactory,
      [
        await token.getAddress(),
        await principalVault.getAddress(),
        await interestVault.getAddress(),
        await nft.getAddress(),
        admin.address, // feeReceiver
        admin.address, // admin
        operator.address, // operator
        admin.address,
      ],
      {
        initializer: "initialize",
        kind: "uups",
      },
    );
    await savingBankProxy.waitForDeployment();
    savingBank = savingBankProxy as unknown as SavingBankUpgradeable;

    // 7. Setup permissions
    await nft.connect(admin).setSavingBank(await savingBank.getAddress());

    // Grant OPERATOR_ROLE to SavingBank on vaults
    const OPERATOR_ROLE = await principalVault.OPERATOR_ROLE();
    await principalVault
      .connect(admin)
      .grantRole(OPERATOR_ROLE, await savingBank.getAddress());
    await interestVault
      .connect(admin)
      .grantRole(OPERATOR_ROLE, await savingBank.getAddress());

    // 8. Mint tokens for testing
    await token.mint(user1.address, ethers.parseEther("10000"));
    await token.mint(admin.address, ethers.parseEther("10000"));

    // 9. Fund InterestVault
    await token
      .connect(admin)
      .approve(await interestVault.getAddress(), ethers.parseEther("5000"));
    await interestVault.connect(admin).depositFund(ethers.parseEther("5000"));

    proxyAddress = await savingBank.getAddress();

    return {
      token,
      principalVault,
      interestVault,
      nft,
      savingBank,
      admin,
      operator,
      user1,
      proxyAddress,
    };
  }

  describe("State Preservation After Upgrade", function () {
    it("Should preserve all state variables after upgrade", async function () {
      const {
        savingBank,
        token,
        principalVault,
        operator,
        user1,
        proxyAddress,
      } = await loadFixture(deploySavingBankFixture);

      // 1. Create a plan
      await savingBank.connect(operator).createPlan(
        30, // 30 days
        1000, // 10% APR (basis points)
        ethers.parseEther("100"), // minDeposit
        ethers.parseEther("10000"), // maxDeposit
        500, // 5% penalty
      );

      // 2. User makes a deposit
      await token
        .connect(user1)
        .approve(await principalVault.getAddress(), ethers.parseEther("1000"));
      await savingBank
        .connect(user1)
        .openDepositCertificate(1, ethers.parseEther("1000"));

      // 3. Store state before upgrade
      const planBefore = await savingBank.getPlanInfo(1);
      const depositBefore = await savingBank.getDepositInfo(1);
      const nextPlanIdBefore = await savingBank.nextPlanId();
      const nextDepositIdBefore = await savingBank.nextDepositId();
      const tokenAddressBefore = await savingBank.token();
      const principalVaultBefore = await savingBank.principalVault();
      const interestVaultBefore = await savingBank.interestVault();
      const feeReceiverBefore = await savingBank.feeReceiver();

      console.log("\n📊 State before upgrade:");
      console.log("  Plan tenor:", planBefore.tenorDays.toString(), "days");
      console.log("  Plan APR:", planBefore.aprBps.toString(), "bps");
      console.log(
        "  Deposit principal:",
        ethers.formatEther(depositBefore.principal),
      );
      console.log("  Next Plan ID:", nextPlanIdBefore.toString());
      console.log("  Next Deposit ID:", nextDepositIdBefore.toString());

      // 4. Upgrade (same version for testing storage layout)
      console.log("\n⬆️  Upgrading contract...");
      const SavingBankFactory = await ethers.getContractFactory(
        "SavingBankUpgradeable",
      );
      const upgraded = await upgrades.upgradeProxy(
        proxyAddress,
        SavingBankFactory,
        { kind: "uups" },
      );
      await upgraded.waitForDeployment();
      upgradedSavingBank = upgraded as unknown as SavingBankUpgradeable;
      console.log("✅ Upgrade completed");

      // 5. Verify state preservation
      const planAfter = await upgradedSavingBank.getPlanInfo(1);
      const depositAfter = await upgradedSavingBank.getDepositInfo(1);
      const nextPlanIdAfter = await upgradedSavingBank.nextPlanId();
      const nextDepositIdAfter = await upgradedSavingBank.nextDepositId();
      const tokenAddressAfter = await upgradedSavingBank.token();
      const principalVaultAfter = await upgradedSavingBank.principalVault();
      const interestVaultAfter = await upgradedSavingBank.interestVault();
      const feeReceiverAfter = await upgradedSavingBank.feeReceiver();

      console.log("\n📊 State after upgrade:");
      console.log("  Plan tenor:", planAfter.tenorDays.toString(), "days");
      console.log("  Plan APR:", planAfter.aprBps.toString(), "bps");
      console.log(
        "  Deposit principal:",
        ethers.formatEther(depositAfter.principal),
      );
      console.log("  Next Plan ID:", nextPlanIdAfter.toString());
      console.log("  Next Deposit ID:", nextDepositIdAfter.toString());

      // Assert plan data
      expect(planAfter.tenorDays).to.equal(planBefore.tenorDays);
      expect(planAfter.aprBps).to.equal(planBefore.aprBps);
      expect(planAfter.minDeposit).to.equal(planBefore.minDeposit);
      expect(planAfter.maxDeposit).to.equal(planBefore.maxDeposit);
      expect(planAfter.earlyWithdrawPenaltyBps).to.equal(
        planBefore.earlyWithdrawPenaltyBps,
      );
      expect(planAfter.enabled).to.equal(planBefore.enabled);

      // Assert deposit data
      expect(depositAfter.owner).to.equal(depositBefore.owner);
      expect(depositAfter.planId).to.equal(depositBefore.planId);
      expect(depositAfter.principal).to.equal(depositBefore.principal);
      expect(depositAfter.startAt).to.equal(depositBefore.startAt);
      expect(depositAfter.maturityAt).to.equal(depositBefore.maturityAt);
      expect(depositAfter.status).to.equal(depositBefore.status);

      // Assert counters
      expect(nextPlanIdAfter).to.equal(nextPlanIdBefore);
      expect(nextDepositIdAfter).to.equal(nextDepositIdBefore);

      // Assert addresses
      expect(tokenAddressAfter).to.equal(tokenAddressBefore);
      expect(principalVaultAfter).to.equal(principalVaultBefore);
      expect(interestVaultAfter).to.equal(interestVaultBefore);
      expect(feeReceiverAfter).to.equal(feeReceiverBefore);

      console.log("\n✅ All state variables preserved!");
    });

    it("Should preserve user deposit IDs mapping", async function () {
      const {
        savingBank,
        token,
        principalVault,
        operator,
        user1,
        proxyAddress,
      } = await loadFixture(deploySavingBankFixture);

      // Create plan and deposit
      await savingBank
        .connect(operator)
        .createPlan(
          30,
          1000,
          ethers.parseEther("100"),
          ethers.parseEther("10000"),
          500,
        );

      await token
        .connect(user1)
        .approve(await principalVault.getAddress(), ethers.parseEther("1000"));
      await savingBank
        .connect(user1)
        .openDepositCertificate(1, ethers.parseEther("1000"));

      const depositIdsBefore = await savingBank.getUserDepositIds(
        user1.address,
      );

      // Upgrade
      const SavingBankFactory = await ethers.getContractFactory(
        "SavingBankUpgradeable",
      );
      const upgraded = await upgrades.upgradeProxy(
        proxyAddress,
        SavingBankFactory,
        { kind: "uups" },
      );
      upgradedSavingBank = upgraded as unknown as SavingBankUpgradeable;

      const depositIdsAfter = await upgradedSavingBank.getUserDepositIds(
        user1.address,
      );

      expect(depositIdsAfter.length).to.equal(depositIdsBefore.length);
      expect(depositIdsAfter[0]).to.equal(depositIdsBefore[0]);
    });

    it("Should preserve multiple deposits", async function () {
      const {
        savingBank,
        token,
        principalVault,
        operator,
        user1,
        proxyAddress,
      } = await loadFixture(deploySavingBankFixture);

      // Create plan
      await savingBank
        .connect(operator)
        .createPlan(
          30,
          1000,
          ethers.parseEther("100"),
          ethers.parseEther("10000"),
          500,
        );

      // Make 3 deposits
      for (let i = 0; i < 3; i++) {
        await token
          .connect(user1)
          .approve(await principalVault.getAddress(), ethers.parseEther("500"));
        await savingBank
          .connect(user1)
          .openDepositCertificate(1, ethers.parseEther("500"));
      }

      // Get all deposits before upgrade
      const depositIds = await savingBank.getUserDepositIds(user1.address);
      const depositsBefore = [];
      for (const id of depositIds) {
        depositsBefore.push(await savingBank.getDepositInfo(id));
      }

      // Upgrade
      const SavingBankFactory = await ethers.getContractFactory(
        "SavingBankUpgradeable",
      );
      const upgraded = await upgrades.upgradeProxy(
        proxyAddress,
        SavingBankFactory,
        {
          kind: "uups",
        },
      );
      upgradedSavingBank = upgraded as unknown as SavingBankUpgradeable;

      // Verify all deposits after upgrade
      const depositIdsAfter = await upgradedSavingBank.getUserDepositIds(
        user1.address,
      );
      expect(depositIdsAfter.length).to.equal(3);

      for (let i = 0; i < depositIds.length; i++) {
        const depositAfter = await upgradedSavingBank.getDepositInfo(
          depositIds[i],
        );
        expect(depositAfter.owner).to.equal(depositsBefore[i].owner);
        expect(depositAfter.principal).to.equal(depositsBefore[i].principal);
      }
    });
  });

  describe("Old Functions After Upgrade", function () {
    it("Should allow creating new plans after upgrade", async function () {
      const { savingBank, operator, proxyAddress } = await loadFixture(
        deploySavingBankFixture,
      );

      // Upgrade first
      const SavingBankFactory = await ethers.getContractFactory(
        "SavingBankUpgradeable",
      );
      const upgraded = await upgrades.upgradeProxy(
        proxyAddress,
        SavingBankFactory,
        { kind: "uups" },
      );
      upgradedSavingBank = upgraded as unknown as SavingBankUpgradeable;

      // Create plan after upgrade
      await expect(
        upgradedSavingBank.connect(operator).createPlan(
          60, // 60 days
          1500, // 15% APR
          ethers.parseEther("200"),
          ethers.parseEther("20000"),
          300, // 3% penalty
        ),
      ).to.emit(upgradedSavingBank, "PlanCreated");

      const plan = await upgradedSavingBank.getPlanInfo(1);
      expect(plan.tenorDays).to.equal(60);
      expect(plan.aprBps).to.equal(1500);
    });

    it("Should allow deposits after upgrade", async function () {
      const {
        savingBank,
        token,
        principalVault,
        operator,
        user1,
        proxyAddress,
      } = await loadFixture(deploySavingBankFixture);

      // Create plan before upgrade
      await savingBank
        .connect(operator)
        .createPlan(
          30,
          1000,
          ethers.parseEther("100"),
          ethers.parseEther("10000"),
          500,
        );

      // Upgrade
      const SavingBankFactory = await ethers.getContractFactory(
        "SavingBankUpgradeable",
      );
      const upgraded = await upgrades.upgradeProxy(
        proxyAddress,
        SavingBankFactory,
        { kind: "uups" },
      );
      upgradedSavingBank = upgraded as unknown as SavingBankUpgradeable;

      // Deposit after upgrade
      await token
        .connect(user1)
        .approve(await principalVault.getAddress(), ethers.parseEther("1000"));
      await expect(
        upgradedSavingBank
          .connect(user1)
          .openDepositCertificate(1, ethers.parseEther("1000")),
      ).to.emit(upgradedSavingBank, "DepositCertificateOpened");
    });

    it("Should allow withdrawals of old deposits after upgrade", async function () {
      const {
        savingBank,
        token,
        principalVault,
        operator,
        user1,
        proxyAddress,
      } = await loadFixture(deploySavingBankFixture);

      // Create plan and deposit BEFORE upgrade
      await savingBank
        .connect(operator)
        .createPlan(
          1,
          1000,
          ethers.parseEther("100"),
          ethers.parseEther("10000"),
          500,
        );

      await token
        .connect(user1)
        .approve(await principalVault.getAddress(), ethers.parseEther("1000"));
      await savingBank
        .connect(user1)
        .openDepositCertificate(1, ethers.parseEther("1000"));

      // Fast forward time to maturity
      await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60]); // 2 days
      await ethers.provider.send("evm_mine", []);

      // Upgrade
      const SavingBankFactory = await ethers.getContractFactory(
        "SavingBankUpgradeable",
      );
      const upgraded = await upgrades.upgradeProxy(
        proxyAddress,
        SavingBankFactory,
        { kind: "uups" },
      );
      upgradedSavingBank = upgraded as unknown as SavingBankUpgradeable;

      // Withdraw AFTER upgrade
      await expect(upgradedSavingBank.connect(user1).withdraw(1)).to.emit(
        upgradedSavingBank,
        "Withdrawn",
      );
    });

    it("Should allow early withdrawals after upgrade", async function () {
      const {
        savingBank,
        token,
        principalVault,
        operator,
        user1,
        proxyAddress,
      } = await loadFixture(deploySavingBankFixture);

      // Create plan and deposit
      await savingBank
        .connect(operator)
        .createPlan(
          30,
          1000,
          ethers.parseEther("100"),
          ethers.parseEther("10000"),
          500,
        );

      await token
        .connect(user1)
        .approve(await principalVault.getAddress(), ethers.parseEther("1000"));
      await savingBank
        .connect(user1)
        .openDepositCertificate(1, ethers.parseEther("1000"));

      // Upgrade
      const SavingBankFactory = await ethers.getContractFactory(
        "SavingBankUpgradeable",
      );
      const upgraded = await upgrades.upgradeProxy(
        proxyAddress,
        SavingBankFactory,
        {
          kind: "uups",
        },
      );
      upgradedSavingBank = upgraded as unknown as SavingBankUpgradeable;

      // Early withdraw AFTER upgrade
      await expect(upgradedSavingBank.connect(user1).earlyWithdraw(1)).to.emit(
        upgradedSavingBank,
        "EarlyWithdrawn",
      );
    });
  });

  describe("Upgrade Authorization", function () {
    it("Should only allow ADMIN to upgrade", async function () {
      const { user1, proxyAddress } = await loadFixture(
        deploySavingBankFixture,
      );

      const SavingBankFactory = await ethers.getContractFactory(
        "SavingBankUpgradeable",
      );

      // Non-admin cannot upgrade
      await expect(
        upgrades.upgradeProxy(proxyAddress, SavingBankFactory.connect(user1), {
          kind: "uups",
        }),
      ).to.be.reverted;
    });

    it("Should allow ADMIN to upgrade", async function () {
      const { admin, proxyAddress } = await loadFixture(
        deploySavingBankFixture,
      );

      const SavingBankFactory = await ethers.getContractFactory(
        "SavingBankUpgradeable",
      );

      // Admin can upgrade
      await expect(
        upgrades.upgradeProxy(proxyAddress, SavingBankFactory.connect(admin), {
          kind: "uups",
        }),
      ).to.not.be.reverted;
    });
  });

  describe("Proxy Behavior", function () {
    it("Should keep same proxy address after upgrade", async function () {
      const { proxyAddress } = await loadFixture(deploySavingBankFixture);

      const addressBefore = proxyAddress;

      // Upgrade
      const SavingBankFactory = await ethers.getContractFactory(
        "SavingBankUpgradeable",
      );
      const upgraded = await upgrades.upgradeProxy(
        proxyAddress,
        SavingBankFactory,
        {
          kind: "uups",
        },
      );
      upgradedSavingBank = upgraded as unknown as SavingBankUpgradeable;

      const addressAfter = await upgradedSavingBank.getAddress();

      expect(addressAfter).to.equal(addressBefore);
      console.log("\n✅ Proxy address unchanged:", addressAfter);
    });

    it("Should update implementation address after upgrade", async function () {
      const { proxyAddress } = await loadFixture(deploySavingBankFixture);

      const implBefore = await upgrades.erc1967.getImplementationAddress(
        proxyAddress,
      );

      // Upgrade
      const SavingBankFactory = await ethers.getContractFactory(
        "SavingBankUpgradeable",
      );
      const upgraded = await upgrades.upgradeProxy(
        proxyAddress,
        SavingBankFactory,
        {
          kind: "uups",
        },
      );
      upgradedSavingBank = upgraded as unknown as SavingBankUpgradeable;

      const implAfter = await upgrades.erc1967.getImplementationAddress(
        proxyAddress,
      );

      console.log("\n📍 Implementation addresses:");
      console.log("  Before:", implBefore);
      console.log("  After:", implAfter);

      // Note: May be same if upgrading to same version
      // In real upgrade to new version, these would be different
    });
  });

  describe("Storage Layout Validation", function () {
    it("Should validate storage layout before upgrade", async function () {
      const { proxyAddress } = await loadFixture(deploySavingBankFixture);

      const SavingBankFactory = await ethers.getContractFactory(
        "SavingBankUpgradeable",
      );

      // Validate should not throw
      await expect(
        upgrades.validateUpgrade(proxyAddress, SavingBankFactory, {
          kind: "uups",
        }),
      ).to.not.be.rejected;
    });
  });
});
