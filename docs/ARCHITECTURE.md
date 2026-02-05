# SavingBank V2 - System Architecture (Phase 2 Complete)

## 📋 Overview

SavingBank V2 là hệ thống tiết kiệm phi tập trung (DeFi) với **UUPS Upgradeable Pattern** và **Timelock Governance**, cho phép:

- ✅ Nâng cấp contracts an toàn
- ✅ Quản trị phi tập trung với delay 2 ngày
- ✅ Tự động generate NFT metadata từ blockchain events
- ✅ Lưu trữ metadata on-chain và IPFS

---

## 🏗️ System Components

### **Phase 2 Architecture** (Current - Upgradeable)

```
┌─────────────────────────────────────────────────────────────────┐
│                    GOVERNANCE LAYER                             │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │         SavingBankTimelock (Non-upgradeable)              │  │
│  │  • 2-day delay for critical operations                    │  │
│  │  • PROPOSER_ROLE, EXECUTOR_ROLE, CANCELLER_ROLE          │  │
│  │  • Community review period                                │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼ Controls critical functions
┌─────────────────────────────────────────────────────────────────┐
│                    SMART CONTRACT LAYER                         │
│                                                                 │
│  ┌────────────────────┐         ┌────────────────────┐          │
│  │ SavingBankUpgradeable       │  NFTMetadataUpgradeable       │
│  │    (UUPS Proxy)    │         │    (UUPS Proxy)    │          │
│  │                    │         │                    │          │
│  │ Implementation V1  │         │ Implementation V1  │          │
│  │       ↓            │         │       ↓            │          │
│  │ Implementation V2  │         │ Implementation V2  │          │
│  │       ↓            │         │       ↓            │          │
│  │ Implementation Vn  │         │ Implementation Vn  │          │
│  └────────┬───────────┘         └────────┬───────────┘          │
│           │                              │                      │
│           │                              │                      │
│  ┌────────▼───────────┐   ┌─────────────▼──────────┐           │
│  │ PrincipalVault     │   │  SavingBankNFT         │           │
│  │   (UUPS Proxy)     │   │  (Non-upgradeable)     │           │
│  └────────────────────┘   │  • Delegates metadata  │           │
│                           │    to NFTMetadata      │           │
│  ┌────────────────────┐   └────────────────────────┘           │
│  │ InterestVault      │                                        │
│  │   (UUPS Proxy)     │                                        │
│  └────────────────────┘                                        │
└─────────────────────────────────────────────────────────────────┘
                            │
                            │ Emits events
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    BACKEND LAYER (Node.js)                      │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              Blockchain Event Listener                     │  │
│  │  • Listens to DepositCertificateOpened                    │  │
│  │  • Auto-triggers metadata generation                      │  │
│  └─────────────────┬─────────────────────────────────────────┘  │
│                    │                                            │
│                    ▼                                            │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              Metadata Generation Pipeline                 │  │
│  │                                                            │  │
│  │  1. Fetch plan details from blockchain                    │  │
│  │  2. Generate PNG certificate image                        │  │
│  │  3. Upload image to IPFS → imageHash                      │  │
│  │  4. Create metadata JSON                                  │  │
│  │  5. Upload metadata to IPFS → metadataHash                │  │
│  │  6. Save to database (SQLite/PostgreSQL)                  │  │
│  │  7. Update NFTMetadata contract with IPFS hash            │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    REST API Server                        │  │
│  │  • GET /api/metadata/:depositId                           │  │
│  │  • POST /api/metadata/generate                            │  │
│  │  • PATCH /api/metadata/:depositId/status                  │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                            │
                            │ Stores
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    STORAGE LAYER                                │
│                                                                 │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐ │
│  │  IPFS (Pinata)   │  │    Database      │  │   Blockchain  │ │
│  │                  │  │   (SQLite/PG)    │  │   (Ethereum)  │ │
│  │  • Images        │  │  • Metadata cache│  │  • IPFS hash  │ │
│  │  • Metadata JSON │  │  • Search index  │  │  • Source of  │ │
│  │                  │  │  • Generation log│  │    truth      │ │
│  └──────────────────┘  └──────────────────┘  └───────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔄 UUPS Upgradeable Pattern

### What is UUPS?

**Universal Upgradeable Proxy Standard (EIP-1822)**

```
User/DApp interacts with → Proxy (address never changes)
                               ↓ delegatecall
                          Implementation (upgradeable logic)
```

### Upgradeable Contracts

| Contract                  | Type       | Upgradeable | Note                          |
| ------------------------- | ---------- | ----------- | ----------------------------- |
| SavingBankUpgradeable     | Main       | ✅ UUPS     | Core logic can be upgraded    |
| PrincipalVaultUpgradeable | Vault      | ✅ UUPS     | Storage logic upgradeable     |
| InterestVaultUpgradeable  | Vault      | ✅ UUPS     | Payment logic upgradeable     |
| NFTMetadataUpgradeable    | Metadata   | ✅ UUPS     | Metadata logic upgradeable    |
| SavingBankNFT             | NFT        | ❌          | Core ERC721 (non-upgradeable) |
| SavingBankTimelock        | Governance | ❌          | Security - cannot be changed  |
| ERC20Mock                 | Token      | ❌          | Test token                    |

### Upgrade Authorization

```solidity
// Only ADMIN_ROLE can upgrade
function _authorizeUpgrade(address newImplementation)
    internal
    override
    onlyRole(ADMIN_ROLE)
{}
```

### Storage Safety Rules

❌ **DON'T:**

- Delete existing variables
- Change variable order
- Change variable types
- Add variables before existing ones

✅ **DO:**

- Add new variables at END of contract
- Reduce storage gap accordingly
- Test on testnet first
- Validate storage layout

**Example:**

```solidity
// V1
contract SavingBankV1 {
    IERC20 public token;           // slot 0
    address public principalVault; // slot 1
    uint256 public nextPlanId;     // slot 2
    uint256[50] private __gap;     // slots 3-52
}

// V2 - Adding new variable
contract SavingBankV2 {
    IERC20 public token;           // slot 0 (same)
    address public principalVault; // slot 1 (same)
    uint256 public nextPlanId;     // slot 2 (same)
    uint256 public newFeature;     // slot 3 (NEW)
    uint256[49] private __gap;     // slots 4-52 (reduced by 1)
}
```

---

## ⏰ Timelock Governance

### Purpose

- **Security**: 2-day delay prevents instant malicious changes
- **Transparency**: Community can review proposals
- **Emergency Stop**: Can cancel dangerous operations
- **Trust**: Users have time to exit if they disagree

### Workflow

```
1. Admin/Operator proposes change
   ↓
   schedule() with 2-day delay
   ↓
2. Operation is PENDING (48 hours)
   ↓
   Community reviews
   ↓
3. After delay, operation is READY
   ↓
   Anyone can execute()
   ↓
4. Change applied ✅

   OR

   Canceller can cancel() at any time ❌
```

### Roles

| Role           | Can Do              | Who                  |
| -------------- | ------------------- | -------------------- |
| PROPOSER_ROLE  | Schedule operations | Admin, Operator      |
| EXECUTOR_ROLE  | Execute after delay | Anyone (ZeroAddress) |
| CANCELLER_ROLE | Cancel operations   | Admin                |
| ADMIN_ROLE     | Manage roles        | Multi-sig            |

### Critical Operations Protected

- `updatePlan()` - Change plan parameters
- `setFeeReceiver()` - Change fee receiver
- `setVaults()` - Change vault addresses
- `upgradeTo()` - Upgrade contract implementation

**All these require 2-day delay through Timelock!**

---

## 🎨 NFT Metadata System

### Dual Architecture

```
┌────────────────────────────────────────────────────────────┐
│                  NFT Metadata Flow                         │
└────────────────────────────────────────────────────────────┘

Option 1: Backend Generated (Automated)
─────────────────────────────────────────
User deposits
  → Blockchain emits event
    → Backend listener detects
      → Generates PNG image
        → Uploads to IPFS
          → Updates NFTMetadata contract
            → User sees certificate

Option 2: On-Chain Fallback
────────────────────────────
User deposits
  → NFT minted
    → tokenURI() called
      → NFTMetadata.tokenURI()
        → Returns baseURI + tokenId.json
          OR custom IPFS hash if set
```

### Storage Strategy

**Off-Chain (IPFS):**

- Certificate images (PNG)
- Full metadata JSON
- Cost: ~$0.01 per certificate
- Speed: Instant access via HTTP gateway

**On-Chain (Blockchain):**

- IPFS hash only (32 bytes)
- Compact certificate data
- Cost: ~$10-50 per certificate (at high gas)
- Speed: Blockchain read speed

**Database (Backend):**

- Metadata cache
- Search index
- Generation logs
- Cost: Negligible
- Speed: Milliseconds

### Metadata JSON Structure

```json
{
  "name": "Saving Bank Certificate #123",
  "description": "Certificate of Deposit for 1,000.00 tokens in Plan 1 with 10.00% APR",
  "image": "ipfs://QmXyz123.../certificate-123.png",
  "external_url": "https://savingbank.io/certificates/123",
  "attributes": [
    { "trait_type": "Deposit ID", "value": 123 },
    { "trait_type": "Plan ID", "value": 1 },
    {
      "trait_type": "Amount",
      "display_type": "number",
      "value": "1000000000000000000000"
    },
    { "trait_type": "Amount (Formatted)", "value": "1,000.00 tokens" },
    { "trait_type": "Tenor", "value": "30 days" },
    { "trait_type": "APR", "value": "10.00%" },
    {
      "trait_type": "Deposit Date",
      "display_type": "date",
      "value": 1706956800
    },
    {
      "trait_type": "Maturity Date",
      "display_type": "date",
      "value": 1709548800
    },
    { "trait_type": "Status", "value": "Active" }
  ]
}
```

---

## 📊 Data Flow Examples

### Flow 1: Deposit with Auto-Metadata Generation

```
1. User approves token
2. User calls openDepositCertificate(planId, amount)
   ↓
3. SavingBank contract:
   - Validates plan and amount
   - Transfers tokens to PrincipalVault
   - Creates DepositCertificate
   - Mints NFT
   - Emits DepositCertificateOpened event ← Backend listens here
   ↓
4. Backend Event Listener:
   - Detects new deposit
   - Fetches plan details from blockchain
   - Calls CertificateGenerator
   ↓
5. CertificateGenerator:
   - Generates PNG image (1200x800)
   - Returns image buffer
   ↓
6. IPFS Service:
   - Uploads image → imageHash
   - Creates metadata JSON
   - Uploads metadata → metadataHash
   ↓
7. Database Service:
   - Saves all metadata
   - Logs generation activity
   ↓
8. NFTMetadata Contract Update (optional):
   - Calls setTokenIPFSHash(tokenId, metadataHash)
   - Requires ADMIN_ROLE on updater key
   ↓
9. Complete ✅
   - User can view certificate on frontend
   - Metadata available via API
   - IPFS hash stored on-chain
```

### Flow 2: Withdraw at Maturity

```
1. User calls withdraw(depositId)
   ↓
2. SavingBank validates:
   - Is owner?
   - Is matured?
   - Is active status?
   ↓
3. Calculate interest:
   interest = principal × APR × tenor / 365 days
   ↓
4. Update deposit status to Withdrawn
   ↓
5. InterestVault.payInterest(user, interest)
   ↓
6. PrincipalVault.withdrawPrincipal(user, principal)
   ↓
7. Burn NFT
   ↓
8. Backend listens to Withdrawn event:
   - Updates database status to "withdrawn"
   ↓
9. User receives principal + interest ✅
```

### Flow 3: Upgrade Contract via Timelock

```
1. Admin proposes upgrade:
   - New implementation deployed
   - Calls timelock.schedule(
       target: savingBankProxy,
       data: upgradeTo(newImplementation),
       delay: 2 days
     )
   ↓
2. Operation PENDING (48 hours):
   - Community reviews on Discord/Twitter
   - Code is public on Etherscan
   - Users can exit if they disagree
   ↓
3. After 2 days:
   - Operation becomes READY
   - Anyone can call timelock.execute()
   ↓
4. Execution:
   - Timelock calls savingBank.upgradeTo(newImpl)
   - Proxy points to new implementation
   - Storage preserved
   ↓
5. Verification:
   - Check implementation address changed
   - Test old functions still work
   - Verify state preservation
   ↓
6. Upgrade complete ✅
   - Same proxy address
   - New features available
   - All user data intact
```

---

## 🔐 Security Architecture

### Layer 1: Access Control

```
DEFAULT_ADMIN_ROLE (Multi-sig)
    │
    ├─> ADMIN_ROLE
    │    • Pause/unpause
    │    • Emergency functions
    │    • Authorize upgrades
    │    • Change critical config
    │
    └─> OPERATOR_ROLE
         • Create plans
         • Update plan status
         • Process vault operations
```

### Layer 2: Timelock Protection

All critical operations go through Timelock:

- Upgrade implementations
- Change plan parameters
- Update fee receiver
- Change vault addresses

**Cannot bypass** - enforced by `onlyTimelockOrAdmin` modifier

### Layer 3: Upgrade Safety

**Storage Layout Validation:**

```bash
# Before upgrade
npx hardhat run scripts/verify/validate-upgrade.ts

# OpenZeppelin plugin checks:
✅ No storage conflicts
✅ No deleted variables
✅ Correct variable order
```

**Implementation Authorization:**

```solidity
function _authorizeUpgrade(address newImplementation)
    internal
    override
    onlyRole(ADMIN_ROLE)
{
    // Only ADMIN can upgrade
    // Prevents unauthorized implementation changes
}
```

### Layer 4: Contract Separation

- **SavingBank**: Logic only, no token storage
- **Vaults**: Token storage, minimal logic
- **NFT**: Certificate representation, soulbound
- **Timelock**: Governance, non-upgradeable

**Benefit**: If one contract has issues, others are isolated

### Layer 5: Input Validation

```solidity
// Every function validates inputs
function openDepositCertificate(uint256 planId, uint256 amount) external {
    SavingPlan memory plan = savingPlans[planId];
    if (!plan.enabled) revert NotEnabledPlan();
    if (amount < plan.minDeposit) revert InvalidAmount();
    if (plan.maxDeposit > 0 && amount > plan.maxDeposit) revert InvalidAmount();
    // ... rest of logic
}
```

### Layer 6: Reentrancy Protection

```solidity
// All external functions protected
function withdraw(uint256 depositId)
    external
    whenNotPaused
    nonReentrant  // ← ReentrancyGuard
{
    // Safe from reentrancy attacks
}
```

---

## 📈 Scalability Considerations

### Current Capacity

| Metric            | Limit     | Note               |
| ----------------- | --------- | ------------------ |
| Users             | Unlimited | No hardcoded limit |
| Deposits per user | Unlimited | Stored in array    |
| Plans             | Unlimited | Counter-based      |
| Token types       | 1         | Can extend         |

### Gas Optimization

**Upgradeable Contracts:**

- Custom errors save ~50% gas vs require strings
- Storage packing in structs
- View functions for queries (free)
- Batch operations for admin

**Backend:**

- Async metadata generation (no on-chain cost)
- IPFS storage ($0.01 vs $50 on-chain)
- Database caching for instant queries

### Bottlenecks & Solutions

**Issue**: Large userDepositIds array
**Solution**: Paginate off-chain, or use mapping with deposit counter

**Issue**: NFT metadata generation delay
**Solution**: Backend auto-generates in background, user doesn't wait

**Issue**: High gas for upgrade
**Solution**: Only upgrade when necessary, batch changes

---

## 🚀 Future Enhancements

### Phase 3: Advanced Features (Q2 2026)

**Smart Contract:**

- [ ] Multi-token support (USDC, DAI, USDT)
- [ ] Variable APR based on market
- [ ] Partial withdrawals
- [ ] Auto-compound option
- [ ] Referral rewards

**Backend:**

- [ ] Advanced analytics dashboard
- [ ] Email notifications
- [ ] Mobile push notifications
- [ ] Telegram bot integration

**Governance:**

- [ ] DAO voting for plan parameters
- [ ] Community-proposed plans
- [ ] Treasury management

### Phase 4: Mainnet & Scale (Q3 2026)

- [ ] External security audit
- [ ] Bug bounty program
- [ ] L2 deployment (Arbitrum/Optimism)
- [ ] Cross-chain bridge
- [ ] Insurance fund
- [ ] Institutional features

---

## 📚 Related Documentation

- [Upgrade Guide](UPGRADEABLE_GUIDE.md) - How to upgrade contracts
- [Timelock Guide](TIMELOCK_GUIDE.md) - Governance workflow
- [Backend Integration](BACKEND_INTEGRATION.md) - Setup backend
- [Phase 2 Roadmap](PHASE2_GUIDE.md) - Development progress

---

## 📞 Technical Specifications

**Smart Contracts:**

- Solidity: 0.8.20+
- OpenZeppelin: 5.0+
- Hardhat: Latest
- Pattern: UUPS Proxy

**Backend:**

- Node.js: 18+
- Express: 4.18+
- Ethers.js: 6.9+
- Database: SQLite/PostgreSQL

**Infrastructure:**

- RPC: Infura/Alchemy
- IPFS: Pinata
- Frontend: React/Next.js
- Hosting: Vercel/AWS

---

**Last Updated:** 2026-02-05  
**Version:** 2.0.0 (Phase 2 Complete)  
**Status:** ✅ Production Ready (Testnet)
