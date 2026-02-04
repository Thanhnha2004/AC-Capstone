# 🏦 SavingBank - Upgradeable DeFi Savings Protocol

> A secure, upgradeable fixed-term savings protocol with NFT certificates and timelock governance

[![Solidity](https://img.shields.io/badge/Solidity-0.8.20-blue)](https://soliditylang.org/)
[![Hardhat](https://img.shields.io/badge/Hardhat-Latest-yellow)](https://hardhat.org/)
[![OpenZeppelin](https://img.shields.io/badge/OpenZeppelin-v5.0-green)](https://www.openzeppelin.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-purple.svg)](https://opensource.org/licenses/MIT)

---

## 📋 Overview

SavingBank is a decentralized savings protocol that allows users to deposit ERC20 tokens into fixed-term savings plans, earning interest upon maturity. The protocol features:

- ✅ **UUPS Upgradeable Pattern** - All core contracts can be upgraded
- ✅ **Timelock Governance** - 2-day delay on critical operations
- ✅ **NFT Certificates** - Each deposit is represented by an NFT
- ✅ **Dual Vault System** - Separate vaults for principal and interest
- ✅ **Multiple Plans** - Flexible savings plans with different APRs and tenors
- ✅ **Early Withdrawal** - Optional early exit with penalty

---

## 🏗️ Architecture

### **Upgradeable Proxy Pattern**

```
User/Frontend
    ↓
ERC1967Proxy (Unchanging Address)
    ↓ delegatecall
Implementation Contract (Upgradeable Logic)
```

**Key Contracts:**

- **SavingBankUpgradeable**: Main contract (UUPS proxy)
- **PrincipalVaultUpgradeable**: Holds user deposits (UUPS proxy)
- **InterestVaultUpgradeable**: Holds interest funds (UUPS proxy)
- **SavingBankNFT**: Non-upgradeable ERC721 for certificates
- **NFTMetadataUpgradeable**: Upgradeable metadata contract (UUPS proxy)
- **SavingBankTimelock**: 2-day delay for governance (non-upgradeable)

### **Contract Interactions**

```
┌─────────────────────┐
│   SavingBank        │ ← Proxy (never changes)
│   (UUPS Proxy)      │
└──────────┬──────────┘
           │
    ┌──────┴──────┬──────────────┬──────────────┐
    ↓             ↓              ↓              ↓
┌────────┐   ┌─────────┐   ┌──────────┐   ┌────────┐
│Principal│   │Interest │   │   NFT    │   │Timelock│
│ Vault   │   │ Vault   │   │Certificate│  │2-day   │
│(Proxy)  │   │(Proxy)  │   │(ERC721)  │   │delay   │
└─────────┘   └─────────┘   └──────────┘   └────────┘
```

---

## 🚀 Quick Start

### **Prerequisites**

```bash
node >= 18.0.0
npm >= 9.0.0
```

### **Installation**

```bash
# Clone repository
git clone https://github.com/your-org/saving-bank.git
cd saving-bank

# Install dependencies
npm install

# Copy environment file
cp .env.example .env
```

### **Configuration**

Edit `.env`:

```env
# Network
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_KEY
PRIVATE_KEY=your_private_key_here

# Verification
ETHERSCAN_API_KEY=your_etherscan_key

# Deployment
DEPLOYER_ADDRESS=0x...
ADMIN_ADDRESS=0x...
OPERATOR_ADDRESS=0x...
FEE_RECEIVER=0x...
```

### **Compile**

```bash
npx hardhat compile
```

### **Test**

```bash
# Run all tests
npx hardhat test

# Run specific test
npx hardhat test test/upgrade/SavingBank.upgrade.test.ts

# Coverage
npx hardhat coverage

# Gas report
REPORT_GAS=1 npx hardhat test
```

---

## 📦 Deployment

### **Local Development**

```bash
# Start local node
npx hardhat node

# Deploy to local (in another terminal)
npx hardhat deploy --network localhost
```

### **Testnet (Sepolia)**

```bash
# Deploy all contracts
npx hardhat deploy --network sepolia

# Deploy specific contract
npx hardhat deploy --network sepolia --tags SavingBankUpgradeable
npx hardhat deploy --network sepolia --tags VaultsUpgradeable
npx hardhat deploy --network sepolia --tags Timelock
```

### **Deployment Order**

1. **Mocks** (for testing): `ERC20Mock`
2. **Vaults**: `PrincipalVaultUpgradeable`, `InterestVaultUpgradeable`
3. **NFT System**: `NFTMetadataUpgradeable`, `SavingBankNFT`
4. **Main Contract**: `SavingBankUpgradeable`
5. **Governance**: `SavingBankTimelock`

---

## 🔧 Usage

### **For Users**

```typescript
// 1. Approve token
await token.approve(savingBankAddress, depositAmount);

// 2. Open deposit
await savingBank.openDepositCertificate(planId, depositAmount);

// 3. Wait for maturity
// ... time passes ...

// 4. Withdraw
await savingBank.withdraw(depositId);
```

### **For Admins**

```typescript
// Create new plan (via Operator)
await savingBank.createPlan(
  tenorDays,
  aprBps,
  minDeposit,
  maxDeposit,
  earlyWithdrawPenaltyBps,
);

// Update plan (via Timelock - 2 day delay)
await timelock.schedule(
  savingBankAddress,
  0,
  calldata,
  ethers.ZeroHash,
  salt,
  delay,
);
```

---

## ⬆️ Upgrades

### **Upgrade Process**

```bash
# 1. Prepare new implementation
# Edit contracts/SavingBankUpgradeable.sol

# 2. Set proxy address
export PROXY_ADDRESS=0x...

# 3. Run upgrade script
npx hardhat run scripts/upgrade/upgrade_savingbank.ts --network sepolia

# 4. Verify new implementation
npx hardhat verify --network sepolia <NEW_IMPL_ADDRESS>
```

### **Storage Safety Rules**

❌ **DON'T:**

- Delete existing variables
- Change variable order
- Change variable types
- Add variables before existing ones

✅ **DO:**

- Add new variables at END
- Reduce storage gap accordingly
- Test on testnet first
- Validate storage layout

📚 **See:** [UPGRADE_GUIDE.md](docs/UPGRADE_GUIDE.md)

---

## 🔐 Governance

### **Timelock Workflow**

```bash
# 1. Propose change
npx hardhat run scripts/timelock/propose.ts --network sepolia
# Output: Operation Hash: 0xabc...

# 2. Wait 2 days
# ... 48 hours pass ...

# 3. Execute
npx hardhat run scripts/timelock/execute.ts --network sepolia
```

### **Roles**

| Role               | Permissions                       | Who                  |
| ------------------ | --------------------------------- | -------------------- |
| **ADMIN_ROLE**     | Emergency actions, pause, unpause | Multi-sig            |
| **OPERATOR_ROLE**  | Create plans, update status       | Operations team      |
| **PROPOSER_ROLE**  | Schedule timelock operations      | Admin, Operator      |
| **EXECUTOR_ROLE**  | Execute after delay               | Anyone (ZeroAddress) |
| **CANCELLER_ROLE** | Cancel dangerous proposals        | Admin                |

📚 **See:** [TIMELOCK_GUIDE.md](docs/TIMELOCK_GUIDE.md)

---

## 📊 Contract Addresses

### **Sepolia Testnet**

| Contract       | Address | Type               |
| -------------- | ------- | ------------------ |
| ERC20Mock      | `0x...` | Mock Token         |
| PrincipalVault | `0x...` | UUPS Proxy         |
| InterestVault  | `0x...` | UUPS Proxy         |
| SavingBank     | `0x...` | UUPS Proxy         |
| NFT            | `0x...` | ERC721             |
| NFT Metadata   | `0x...` | UUPS Proxy         |
| Timelock       | `0x...` | TimelockController |

### **Mainnet**

> 🚧 Not deployed yet

---

## 🧪 Testing

### **Test Coverage**

```bash
npx hardhat coverage
```

**Current Coverage:** ~96%

| File                      | Statements | Branches | Functions | Lines |
| ------------------------- | ---------- | -------- | --------- | ----- |
| SavingBankUpgradeable     | 98%        | 95%      | 100%      | 98%   |
| PrincipalVaultUpgradeable | 95%        | 92%      | 100%      | 95%   |
| InterestVaultUpgradeable  | 95%        | 92%      | 100%      | 95%   |
| NFTMetadataUpgradeable    | 97%        | 94%      | 100%      | 97%   |
| SavingBankTimelock        | 100%       | 100%     | 100%      | 100%  |

### **Test Suites**

```
test/
├── upgrade/
│   ├── SavingBank.upgrade.test.ts      (13 tests)
│   ├── VaultsUpgrade.test.ts           (15 tests)
│   └── NFTMetadata.upgrade.test.ts     (18 tests)
└── governance/
    └── Timelock.test.ts                (20+ tests)

Total: 46+ tests
```

---

## 📁 Project Structure

```
.
├── contracts/
│   ├── SavingBankUpgradeable.sol           # Main contract (UUPS)
│   ├── PrincipalVaultUpgradeable.sol       # Principal vault (UUPS)
│   ├── InterestVaultUpgradeable.sol        # Interest vault (UUPS)
│   ├── SavingBankNFT.sol                   # NFT certificate
│   ├── NFTMetadataUpgradeable.sol          # NFT metadata (UUPS)
│   ├── SavingBankTimelock.sol              # Timelock governance
│   └── mock/
│       └── ERC20Mock.sol                   # Test token
├── deploy/
│   ├── 00_mocks.ts                         # Deploy mocks
│   ├── 06_savingbank_upgradeable_deploy.ts # Deploy main contract
│   ├── 07_vaults_upgradeable_deploy.ts     # Deploy vaults
│   ├── 08_nft_separate_metadata_deploy.ts  # Deploy NFT system
│   └── 09_timelock_deploy.ts               # Deploy timelock
├── scripts/
│   ├── upgrade/
│   │   ├── upgrade_savingbank.ts           # Upgrade script
│   │   └── upgrade_vaults.ts               # Upgrade vaults
│   └── timelock/
│       ├── propose.ts                      # Propose governance action
│       ├── execute.ts                      # Execute after delay
│       ├── cancel.ts                       # Cancel proposal
│       └── event-listener.ts               # Monitor events
├── test/
│   ├── upgrade/                            # Upgrade tests
│   └── governance/                         # Governance tests
├── docs/
│   ├── UPGRADE_GUIDE.md                    # Upgrade instructions
│   ├── TIMELOCK_GUIDE.md                   # Governance guide
│   ├── ARCHITECTURE.md                     # System architecture
│   └── PHASE2_GUIDE.md                     # Phase 2 roadmap
└── hardhat.config.ts                       # Hardhat configuration
```

---

## 🔒 Security

### **Audits**

- [ ] Internal security review ✅
- [ ] External audit (pending)
- [ ] Bug bounty program (planned)

### **Security Features**

- ✅ ReentrancyGuard on all state-changing functions
- ✅ Pausable for emergency stops
- ✅ Role-based access control
- ✅ 2-day timelock on critical operations
- ✅ Storage layout validation on upgrades
- ✅ Comprehensive test coverage (96%)

### **Known Limitations**

- UUPS upgrades are one-way (no rollback)
- Timelock delay fixed at 2 days
- NFT core contract is non-upgradeable

### **Report Vulnerabilities**

Please report security issues to: security@yourproject.com

---

## 📚 Documentation

- [**Upgrade Guide**](docs/UPGRADE_GUIDE.md) - How to upgrade contracts
- [**Timelock Guide**](docs/TIMELOCK_GUIDE.md) - Governance workflow
- [**Architecture**](docs/ARCHITECTURE.md) - System design
- [**Phase 2 Guide**](docs/PHASE2_GUIDE.md) - Development roadmap

---

## 🛠️ Development

### **Useful Commands**

```bash
# Compile contracts
npx hardhat compile

# Run tests
npx hardhat test

# Check coverage
npx hardhat coverage

# Gas report
REPORT_GAS=1 npx hardhat test

# Clean artifacts
npx hardhat clean

# Format code
npm run format

# Lint code
npm run lint
```

### **Pre-commit Hooks**

```bash
# Install husky
npm run prepare

# Hooks will run:
# - Prettier format
# - ESLint check
# - Solhint check
# - Tests
```

---

## 🗺️ Roadmap

### **Phase 1: Core Protocol** ✅

- [x] Basic deposit/withdraw
- [x] Multiple savings plans
- [x] NFT certificates
- [x] Dual vault system

### **Phase 2: Security & Infrastructure** ✅ (Current)

- [x] UUPS upgradeable pattern
- [x] Timelock governance
- [x] Comprehensive tests
- [x] Documentation

### **Phase 3: Advanced Features** (Q2 2026)

- [ ] Auto-compound
- [ ] Partial withdrawals
- [ ] Plan migration
- [ ] Referral system

### **Phase 4: Mainnet Launch** (Q3 2026)

- [ ] External audit
- [ ] Bug bounty
- [ ] Mainnet deployment
- [ ] Frontend dApp

---

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### **Development Workflow**

1. Fork the repository
2. Create feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open Pull Request

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 👥 Team

- **Lead Developer**: [@your-github](https://github.com/your-github)
- **Security Auditor**: TBD
- **Community Manager**: TBD

---

## 📞 Contact

- **Twitter**: [@YourProject](https://twitter.com/yourproject)
- **Discord**: [Join our Discord](https://discord.gg/yourserver)
- **Email**: contact@yourproject.com
- **Website**: https://yourproject.com

---

## 🙏 Acknowledgments

- [OpenZeppelin](https://openzeppelin.com/) - Secure smart contract library
- [Hardhat](https://hardhat.org/) - Ethereum development environment
- [Ethers.js](https://ethers.org/) - Ethereum library

---

**Built with ❤️ using Solidity & Hardhat**

---

**Last Updated:** 2026-02-03 | **Version:** 2.0.0 (Phase 2 Complete)
