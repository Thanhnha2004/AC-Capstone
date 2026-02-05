import { ethers } from "ethers";
import { config } from "../config/index.js";
import { metadataService } from "./metadata.service.js";

/**
 * Blockchain Event Listener
 * Lắng nghe events từ SavingBankUpgradeable contract
 */
export class BlockchainListener {
  constructor() {
    this.provider = null;
    this.savingBankContract = null;
    this.isListening = false;
  }

  /**
   * Initialize provider và contracts
   */
  async init() {
    try {
      console.log("[Listener] Initializing blockchain connection...");

      // Connect to provider
      this.provider = new ethers.JsonRpcProvider(config.rpcUrl);

      // Test connection
      const network = await this.provider.getNetwork();
      console.log(
        `[Listener] Connected to network: ${network.name} (chainId: ${network.chainId})`,
      );

      // Contract ABIs - Match với SavingBankUpgradeable.sol
      const savingBankABI = [
        // Events
        "event DepositCertificateOpened(uint256 indexed depositId, address indexed user, uint256 indexed planId, uint256 depositAmount, uint256 maturityTimestamp)",
        "event Withdrawn(uint256 indexed depositId, address indexed user, uint256 principalAmount, uint256 interestAmount, uint8 finalStatus)",
        "event EarlyWithdrawn(uint256 indexed depositId, address indexed user, uint256 amountReceived, uint256 penaltyAmount, uint8 finalStatus)",
        "event Renewed(uint256 indexed oldDepositId, uint256 indexed newDepositId, uint256 newPrincipal)",

        // View functions
        "function savingPlans(uint256 planId) view returns (uint256 tenorDays, uint256 aprBps, uint256 minDeposit, uint256 maxDeposit, uint256 earlyWithdrawPenaltyBps, bool isEnabled)",
        "function depositCertificates(uint256 depositId) view returns (address owner, uint256 planId, uint256 principal, uint256 startAt, uint256 maturityAt, uint8 status, uint256 renewedDepositId, uint256 snapshotAprBps, uint256 snapshotTenorDays, uint256 snapshotEarlyWithdrawPenaltyBps)",
      ];

      // Initialize contract
      this.savingBankContract = new ethers.Contract(
        config.contracts.savingBank,
        savingBankABI,
        this.provider,
      );

      console.log("[Listener] Contract initialized successfully");
      console.log(
        `[Listener] Contract address: ${config.contracts.savingBank}`,
      );
      return true;
    } catch (error) {
      console.error("[Listener] Initialization error:", error.message);
      return false;
    }
  }

  /**
   * Start listening to events
   */
  async startListening() {
    if (!this.savingBankContract) {
      console.error("[Listener] Contract not initialized. Call init() first.");
      return;
    }

    if (this.isListening) {
      console.log("[Listener] Already listening...");
      return;
    }

    console.log("[Listener] Starting event listeners...\n");
    this.isListening = true;

    // Listen for DepositCertificateOpened events
    this.savingBankContract.on(
      "DepositCertificateOpened",
      async (
        depositId,
        user,
        planId,
        depositAmount,
        maturityTimestamp,
        event,
      ) => {
        console.log("\n" + "=".repeat(60));
        console.log("🔔 New Deposit Certificate Opened!");
        console.log("=".repeat(60));
        console.log(`Deposit ID: ${depositId}`);
        console.log(`User: ${user}`);
        console.log(`Plan ID: ${planId}`);
        console.log(`Amount: ${ethers.formatEther(depositAmount)} tokens`);
        console.log(
          `Maturity: ${new Date(
            Number(maturityTimestamp) * 1000,
          ).toISOString()}`,
        );
        console.log("=".repeat(60));

        try {
          // Get plan details from contract
          const plan = await this.savingBankContract.savingPlans(planId);

          console.log(`\n[Listener] Plan Details:`);
          console.log(`   Tenor: ${plan.tenorDays.toString()} days`);
          console.log(`   APR: ${Number(plan.aprBps.toString()) / 100}%`);

          // Get deposit certificate details
          const deposit = await this.savingBankContract.depositCertificates(
            depositId,
          );

          console.log(`\n[Listener] Certificate Details:`);
          console.log(
            `   Start Time: ${new Date(
              Number(deposit.startAt) * 1000,
            ).toISOString()}`,
          );
          console.log(
            `   Maturity Time: ${new Date(
              Number(deposit.maturityAt) * 1000,
            ).toISOString()}`,
          );

          // Auto-generate metadata
          console.log(`\n[Listener] Auto-generating metadata...`);

          const result = await metadataService.generateMetadata({
            depositId: Number(depositId.toString()),
            planId: Number(planId.toString()),
            depositAmount: depositAmount.toString(),
            depositTime: Number(deposit.startAt.toString()),
            tenorDays: Number(plan.tenorDays.toString()),
            aprBps: Number(plan.aprBps.toString()),
          });

          console.log(`\n✅ [Listener] Metadata generated successfully!`);
          console.log(`   Image Hash: ${result.imageHash}`);
          console.log(`   Metadata Hash: ${result.metadataHash}`);
          console.log(`   View Image: ${result.imageUrl}`);
          console.log(`   View Metadata: ${result.gatewayMetadataUrl}`);
          console.log("=".repeat(60) + "\n");

          // Auto-update contract metadata with IPFS hash
          await this.updateContractMetadata(depositId, result.metadataHash);
        } catch (error) {
          console.error(
            "\n❌ [Listener] Error generating metadata:",
            error.message,
          );
          console.error(error);
          console.error("=".repeat(60) + "\n");
        }
      },
    );

    // Listen for Withdrawn events (status = Withdrawn)
    this.savingBankContract.on(
      "Withdrawn",
      async (
        depositId,
        user,
        principalAmount,
        interestAmount,
        finalStatus,
        event,
      ) => {
        console.log(`\n📤 Withdrawal detected for deposit #${depositId}`);
        console.log(`   User: ${user}`);
        console.log(
          `   Principal: ${ethers.formatEther(principalAmount)} tokens`,
        );
        console.log(
          `   Interest: ${ethers.formatEther(interestAmount)} tokens`,
        );

        try {
          await metadataService.updateStatus(Number(depositId), "withdrawn");
          console.log(`✅ Status updated to 'withdrawn'\n`);
        } catch (error) {
          console.error(`❌ Error updating status:`, error.message);
        }
      },
    );

    // Listen for EarlyWithdrawn events (status = EarlyWithdrawn)
    this.savingBankContract.on(
      "EarlyWithdrawn",
      async (
        depositId,
        user,
        amountReceived,
        penaltyAmount,
        finalStatus,
        event,
      ) => {
        console.log(
          `\n⚠️  Early withdrawal detected for deposit #${depositId}`,
        );
        console.log(`   User: ${user}`);
        console.log(
          `   Amount Received: ${ethers.formatEther(amountReceived)} tokens`,
        );
        console.log(`   Penalty: ${ethers.formatEther(penaltyAmount)} tokens`);

        try {
          await metadataService.updateStatus(Number(depositId), "withdrawn");
          console.log(`✅ Status updated to 'withdrawn'\n`);
        } catch (error) {
          console.error(`❌ Error updating status:`, error.message);
        }
      },
    );

    // Listen for Renewed events (old certificate becomes renewed, new one created)
    this.savingBankContract.on(
      "Renewed",
      async (oldDepositId, newDepositId, newPrincipal, event) => {
        console.log(`\n🔄 Renewal detected!`);
        console.log(`   Old Deposit ID: ${oldDepositId}`);
        console.log(`   New Deposit ID: ${newDepositId}`);
        console.log(
          `   New Principal: ${ethers.formatEther(newPrincipal)} tokens`,
        );

        try {
          // Update old certificate status
          await metadataService.updateStatus(Number(oldDepositId), "matured");
          console.log(
            `✅ Old certificate #${oldDepositId} status updated to 'matured'`,
          );

          // New certificate will be handled by DepositCertificateOpened event
          console.log(
            `📝 New certificate #${newDepositId} will be auto-generated\n`,
          );
        } catch (error) {
          console.error(`❌ Error updating status:`, error.message);
        }
      },
    );

    console.log("👂 Listening for blockchain events...\n");
  }

  /**
   * Stop listening
   */
  stopListening() {
    if (this.savingBankContract) {
      this.savingBankContract.removeAllListeners();
      this.isListening = false;
      console.log("[Listener] Stopped listening to events");
    }
  }

  /**
   * Sync past events
   */
  async syncPastEvents(fromBlock = 0, toBlock = "latest") {
    console.log(
      `\n[Listener] Syncing past events from block ${fromBlock} to ${toBlock}...`,
    );

    try {
      const filter = this.savingBankContract.filters.DepositCertificateOpened();
      const events = await this.savingBankContract.queryFilter(
        filter,
        fromBlock,
        toBlock,
      );

      console.log(`[Listener] Found ${events.length} past deposit events\n`);

      for (const event of events) {
        const { depositId, planId, depositAmount, maturityTimestamp } =
          event.args;

        // Check if already processed
        const existing = metadataService.getMetadata(Number(depositId));
        if (existing) {
          console.log(
            `[Listener] Deposit #${depositId} already processed, skipping...`,
          );
          continue;
        }

        console.log(`[Listener] Processing deposit #${depositId}...`);

        try {
          // Get plan details
          const plan = await this.savingBankContract.savingPlans(planId);

          // Get deposit details
          const deposit = await this.savingBankContract.depositCertificates(
            depositId,
          );

          const result = await metadataService.generateMetadata({
            depositId: Number(depositId),
            planId: Number(planId),
            depositAmount: depositAmount.toString(),
            depositTime: Number(deposit.startAt),
            tenorDays: Number(plan.tenorDays),
            aprBps: Number(plan.aprBps),
          });

          console.log(`✅ Deposit #${depositId} metadata generated`);
          
          // Auto-update contract metadata
          await this.updateContractMetadata(depositId, result.metadataHash);
          console.log(`✅ Deposit #${depositId} processed\n`);
        } catch (error) {
          console.error(`❌ Error processing #${depositId}:`, error.message);
        }
      }

      console.log("[Listener] Sync complete!\n");
    } catch (error) {
      console.error("[Listener] Sync error:", error.message);
    }
  }

  /**
   * Auto-update contract metadata
   * Sets the IPFS hash for the token in NFTMetadataUpgradeable contract
   * Requires private key with ADMIN_ROLE
   */
  async updateContractMetadata(depositId, metadataHash) {
    if (!config.updaterPrivateKey) {
      console.log(
        "[Listener] ⚠️  No updater private key configured, skipping contract update",
      );
      return;
    }

    if (!config.contracts.metadata) {
      console.log(
        "[Listener] ⚠️  No metadata contract configured, skipping contract update",
      );
      return;
    }

    try {
      const wallet = new ethers.Wallet(config.updaterPrivateKey, this.provider);

      const metadataABI = [
        "function setTokenIPFSHash(uint256 tokenId, string calldata ipfsHash) external",
      ];

      const metadataContract = new ethers.Contract(
        config.contracts.metadata,
        metadataABI,
        wallet,
      );

      console.log(
        `\n[Listener] 📝 Updating on-chain IPFS hash for token #${depositId}...`,
      );

      // Set the IPFS hash on-chain
      const tx = await metadataContract.setTokenIPFSHash(
        Number(depositId.toString()),
        metadataHash.toString(),
      );

      console.log(`[Listener] 📤 Transaction sent: ${tx.hash}`);
      console.log(`[Listener] ⏳ Waiting for confirmation...`);

      const receipt = await tx.wait();
      console.log(`[Listener] ✅ IPFS hash updated successfully!`);
      console.log(`[Listener] 📦 Block: ${receipt.blockNumber}`);
      console.log(`[Listener] ⛽ Gas used: ${receipt.gasUsed.toString()}`);
    } catch (error) {
      console.error("\n[Listener] ❌ Error updating contract metadata:");
      console.error(`   Error: ${error.message}`);
      
      // Check for common errors
      if (error.message.includes("AccessControl")) {
        console.error(
          "   💡 Hint: Make sure the private key has ADMIN_ROLE in the metadata contract",
        );
      } else if (error.message.includes("EmptyHash")) {
        console.error("   💡 Hint: IPFS hash cannot be empty");
      }
    }
  }
}

export const blockchainListener = new BlockchainListener();
