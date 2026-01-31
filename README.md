# SavingBank V2 - Decentralized Savings Protocol

> A secure, decentralized savings platform built on Ethereum with fixed APR deposits, NFT certificates, and compound interest support.

[![Solidity](https://img.shields.io/badge/Solidity-^0.8.28-363636?style=flat-square&logo=solidity)](https://soliditylang.org/)
[![Hardhat](https://img.shields.io/badge/Hardhat-2.25.0-yellow?style=flat-square)](https://hardhat.org/)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)

---

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Installation](#installation)
- [Usage](#usage)
- [Testing](#testing)
- [Deployment](#deployment)
- [Scripts](#scripts)
- [Contract Addresses](#contract-addresses)
- [Documentation](#documentation)
- [Security](#security)
- [Contributing](#contributing)
- [License](#license)

---

## 🎯 Overview

**SavingBank V2** is a DeFi savings protocol that allows users to deposit tokens and earn fixed APR interest. The system features:

- 🏦 **Multiple Saving Plans** with different tenors and APR rates
- 🎨 **NFT Certificates** representing deposit ownership (soulbound)
- 💰 **Compound Interest** through deposit renewal
- 🔒 **Dual Vault Architecture** for enhanced security
- ⚡ **Early Withdrawal** with configurable penalties
- 🛡️ **Role-based Access Control** with admin and operator roles

---

## ✨ Features

### User Features

- ✅ **Open Deposit Certificate**: Choose from multiple savings plans
- ✅ **Withdraw at Maturity**: Receive principal + interest
- ✅ **Early Withdrawal**: Withdraw before maturity with penalty
- ✅ **Renew/Compound**: Automatically compound interest into new principal
- ✅ **NFT Certificate**: Unique soulbound NFT for each deposit
- ✅ **View Deposits**: Track all active and historical deposits

### Admin Features

- ✅ **Create Plans**: Set up new savings plans with custom parameters
- ✅ **Update Plans**: Modify existing plan parameters
- ✅ **Manage System**: Pause/unpause, update configurations
- ✅ **Fund Vaults**: Manage liquidity in principal and interest vaults

### Security Features

- ✅ **Access Control**: Multi-role permission system
- ✅ **Reentrancy Protection**: All external functions protected
- ✅ **Pausable**: Emergency stop mechanism
- ✅ **Soulbound NFTs**: Non-transferable certificates
- ✅ **Input Validation**: Comprehensive parameter checks

---

## 🏗️ Architecture

### Smart Contracts (5 Total)

```
┌─────────────────────────────────────────┐
│          SavingBankV2 (Core)            │
│   • Orchestrates all operations         │
│   • Manages plans & certificates        │
│   • Calculates interest                 │
└──────┬──────────────┬───────────────────┘
       │              │
┌──────▼────────┐ ┌───▼──────────┐ ┌──────────────┐
│PrincipalVault │ │InterestVault │ │SavingBankNFT │
│• Holds        │ │• Holds       │ │• Soulbound   │
│  principal    │ │  interest    │ │• On-chain    │
│• Deposit/     │ │• Pay         │ │  metadata    │
│  Withdraw     │ │  interest    │ │• Dynamic SVG │
└───────────────┘ └──────────────┘ └──────────────┘
```

**Contracts:**

1. **SavingBankV2** - Main orchestrator contract (607 lines)
2. **PrincipalVault** - Holds user deposits (187 lines)
3. **InterestVault** - Manages interest payments (175 lines)
4. **SavingBankNFT** - Certificate NFTs (295 lines)
5. **ERC20Mock** - Test token for development

**Key Design Principles:**

- Separation of Concerns: Each contract has single responsibility
- Security First: Multiple protection layers
- Gas Efficient: Custom errors, immutable variables
- Upgradeable Strategy: Modular design for future enhancements

---

## 📦 Installation

### Prerequisites

- Node.js >= 16.x
- npm or yarn
- Git

### Setup

```bash
# Clone the repository
git clone <repository-url>
cd savingbank-v2

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit .env with your configuration
nano .env
```

### Environment Variables

Create a `.env` file with the following:

```env
# Private Keys (NEVER commit actual keys!)
TESTNET_PRIVATE_KEY=your_testnet_deployer_private_key_here
MAINNET_PRIVATE_KEY=your_mainnet_deployer_private_key_here
USER1_PRIVATE_KEY=your_testnet_user1_private_key_here

# API Keys
ETHERSCAN_API_KEY=your_etherscan_api_key_here

# Gas Reporter
REPORT_GAS=0  # Set to 1 to enable gas reporting
```

---

## 🚀 Usage

### Compile Contracts

```bash
npm run compile
```

### Run Tests

```bash
# Run all tests
npm test

# Run specific test file
npx hardhat test test/SavingBankV2.test.ts

# Run with gas reporting
REPORT_GAS=1 npm test

# Run with coverage
npx hardhat coverage
```

### Start Local Node

```bash
# Start Hardhat node
npm run node

# In another terminal, deploy to localhost
npx hardhat deploy --network localhost
```

---

## 🧪 Testing

### Test Suite Overview

**500+ comprehensive tests** covering:

- ✅ **Unit Tests**: Individual contract functions
- ✅ **Integration Tests**: Full deposit lifecycle
- ✅ **Security Tests**: Access control, reentrancy, validation
- ✅ **Edge Cases**: Boundary conditions, error handling

### Test Files

```
test/
├── ERC20Mock.test.ts       # Token tests (~60 tests)
├── InterestVault.test.ts   # Interest vault tests (~80 tests)
├── PrincipalVault.test.ts  # Principal vault tests (~80 tests)
├── SavingBankNFT.test.ts   # NFT tests (~100 tests)
├── SavingBankV2.test.ts    # Core tests (~180 tests)
├── Integration.test.ts     # Integration scenarios
├── Security.test.ts        # Security validations
└── Vault.test.ts          # Vault integration
```

### Run Tests

```bash
# All tests
npx hardhat test

# Specific test file
npx hardhat test test/SavingBankV2.test.ts

# Specific test suite
npx hardhat test --grep "Deployment"

# With gas reporting
REPORT_GAS=1 npx hardhat test

# With coverage
npx hardhat coverage
```

**Expected Coverage:**

- Statements: 95%+
- Branches: 90%+
- Functions: 100%
- Lines: 95%+

---

## 🚀 Deployment

### Deploy to Sepolia Testnet

```bash
# Deploy all contracts using hardhat-deploy
npx hardhat deploy --network sepolia

# Deploy specific tag
npx hardhat deploy --network sepolia --tags SavingBankV2

# Run deployment script
npx hardhat run scripts/deploy.ts --network sepolia
```

### Deployment Sequence

The deployment follows this order:

1. **ERC20Mock** - Test token
2. **InterestVault** - Interest management
3. **PrincipalVault** - Principal management
4. **SavingBankNFT** - Certificate NFTs
5. **SavingBankV2** - Main orchestrator

### Post-Deployment Setup

After deployment, run setup scripts:

```bash
# 1. Setup system (grant roles, fund vaults)
npx hardhat run scripts/01_setup_system.ts --network sepolia

# 2. Create saving plans
npx hardhat run scripts/02_create_plan.ts --network sepolia
```

### Verify Contracts

```bash
# Verify individual contract
npx hardhat verify --network sepolia DEPLOYED_CONTRACT_ADDRESS

# Verify with constructor arguments
npx hardhat verify --network sepolia DEPLOYED_CONTRACT_ADDRESS "arg1" "arg2"

# Verify all contracts automatically (if using hardhat-deploy)
npx hardhat etherscan-verify --network sepolia
```

---

## 📜 Scripts

### Management Scripts

Located in `scripts/` directory:

#### 1. System Setup

```bash
npx hardhat run scripts/01_setup_system.ts --network sepolia
```

- Configure contract permissions
- Fund interest vault
- Mint test tokens

#### 2. Create Plans

```bash
npx hardhat run scripts/02_create_plan.ts --network sepolia
```

- Plan 1: 30 days - 5% APR
- Plan 2: 90 days - 8% APR
- Plan 3: 180 days - 12% APR

#### 3. Open Deposit

```bash
npx hardhat run scripts/03_open_deposit.ts --network sepolia
```

- User opens a deposit certificate
- Receives NFT certificate
- Funds locked in vault

#### 4. Withdraw at Maturity

```bash
npx hardhat run scripts/04_withdraw_maturity.ts --network sepolia
```

- Withdraw principal + interest
- Burns NFT certificate

#### 5. Early Withdraw

```bash
npx hardhat run scripts/05_withdraw_early.ts --network sepolia
```

- Withdraw before maturity
- Penalty deducted
- No interest paid

#### 6. Renew Deposit

```bash
npx hardhat run scripts/06_renew_deposit.ts --network sepolia
```

- Compound interest into new principal
- New NFT issued
- Old NFT burned

#### 7. Admin Functions

```bash
npx hardhat run scripts/07_admin_functions.ts --network sepolia
```

- Update plans
- Pause/unpause system
- Fund management

#### 8. View Deposits

```bash
npx hardhat run scripts/08_view_deposit.ts --network sepolia
```

- List all user deposits
- Display detailed information

### Hardhat Tasks

```bash
# List accounts
npx hardhat accounts

# Get contract size
npx hardhat size-contracts

# Clean build artifacts
npx hardhat clean

# Compile contracts
npx hardhat compile
```

---

## 📍 Contract Addresses

### Sepolia Testnet

```
ERC20Mock:       0xe264592FC0402d449E9388108E85C13ED8c76D5a
PrincipalVault:  0x2a0dEb355ac0F1008375e57e93871Bef408B3436
InterestVault:   0x386a5c3308c10c7A5A1F65EAAEf0ec1665Dc3b0E
SavingBankNFT:   0x396b84f8Ff1cF125Da399F9a7D5A34179c06C81F
SavingBankV2:    0x88A4805e23ceF4DC0Aeb881Dac233872281822e0
```

### Mainnet

```
(To be deployed after audit)
```

---

## 📚 Documentation

### Architecture Documentation

- **[ARCHITECTURE.md](docs/ARCHITECTURE.md)** - High-level system architecture
- **[MIGRATION_GUIDE.md](docs/MIGRATION_GUIDE.md)** - V1 to V2 migration guide
- **[SUMMARY.md](docs/SUMMARY.md)** - Project summary and technical achievements

### API Documentation

All contracts include comprehensive NatSpec comments:

```solidity
/**
 * @notice Open a new deposit certificate
 * @param planId ID of the saving plan
 * @param depositAmount Amount to deposit
 */
function openDepositCertificate(uint256 planId, uint256 depositAmount) external;
```

### Test Documentation

- **[test/README.md](test/README.md)** - Test execution guide
- **[TEST_SUMMARY.md](TEST_SUMMARY.md)** - Test coverage overview

---

## 🔒 Security

### Security Features

- ✅ **Access Control**: Role-based permissions (ADMIN_ROLE, OPERATOR_ROLE)
- ✅ **Reentrancy Protection**: NonReentrant modifiers on all external functions
- ✅ **Pausable**: Emergency stop mechanism
- ✅ **Input Validation**: Comprehensive parameter checks with custom errors
- ✅ **Soulbound NFTs**: Non-transferable certificates
- ✅ **Immutable Data**: Plan snapshots preserve deposit terms

### Audit Status

- ⏳ **External Audit**: Pending
- ✅ **Internal Review**: Completed
- ✅ **Test Coverage**: 95%+

### Bug Bounty

🐛 Found a security issue? Please report responsibly to: [security@example.com](mailto:security@example.com)

### Security Best Practices

When interacting with contracts:

1. ✅ Always verify contract addresses on Etherscan
2. ✅ Start with small test deposits
3. ✅ Understand the terms before depositing
4. ✅ Keep your private keys secure
5. ✅ Use hardware wallets for large amounts

---

## 🛠️ Development

### Project Structure

```
savingbank-v2/
├── contracts/              # Smart contracts
│   ├── SavingBank_v2.sol
│   ├── PrincipalVault.sol
│   ├── InterestVault.sol
│   ├── SavingBankNFT.sol
│   └── mock/
│       └── ERC20Mock.sol
├── deploy/                 # Deployment scripts
│   ├── 01_mock_token_deploy.ts
│   ├── 02_interest_vault_deploy.ts
│   ├── 03_principal_vault_deploy.ts
│   ├── 04_nft_deploy.ts
│   └── 05_savingbank_deploy.ts
├── scripts/                # Interaction scripts
│   ├── 01_setup_system.ts
│   ├── 02_create_plan.ts
│   ├── 03_open_deposit.ts
│   ├── 04_withdraw_maturity.ts
│   ├── 05_withdraw_early.ts
│   ├── 06_renew_deposit.ts
│   ├── 07_admin_functions.ts
│   └── 08_view_deposit.ts
├── test/                   # Test files
│   ├── ERC20Mock.test.ts
│   ├── InterestVault.test.ts
│   ├── PrincipalVault.test.ts
│   ├── SavingBankNFT.test.ts
│   ├── SavingBankV2.test.ts
│   ├── Integration.test.ts
│   ├── Security.test.ts
│   ├── Vault.test.ts
│   ├── helpers/
│   │   └── accounts.ts
│   └── README.md
├── docs/                   # Documentation
│   ├── ARCHITECTURE.md
│   ├── MIGRATION_GUIDE.md
│   └── SUMMARY.md
├── typechain-types/        # Generated TypeScript types
├── hardhat.config.ts       # Hardhat configuration
├── package.json
├── tsconfig.json
└── README.md
```

### Named Accounts

The project uses named accounts for consistent testing and deployment:

```typescript
// Hardhat Network (local)
deployer:    Account #0 (10,000 ETH)
operator:    Account #0 (same as deployer)
feeReceiver: Account #0 (same as deployer)
user1:       Account #1 (10,000 ETH)
user2:       Account #2 (10,000 ETH)

// Sepolia Testnet
deployer:    TESTNET_PRIVATE_KEY (from .env)
operator:    Same as deployer
feeReceiver: Same as deployer
user1:       USER1_PRIVATE_KEY (from .env, optional)
user2:       Fallback to deployer
```

### Using Named Accounts in Tests

```typescript
import { getTestAccounts } from "./helpers/accounts";

const { deployer, operator, user1, user2 } = await getTestAccounts();

// Use accounts consistently across tests
await savingBank.connect(user1).openDepositCertificate(1, amount);
```

---

## 📊 Key Metrics

### Smart Contract Stats

- **Total Contracts**: 5
- **Total Lines of Code**: ~1,300 (Solidity)
- **Test Coverage**: 95%+
- **Gas Optimized**: Custom errors, immutable variables
- **Security**: AccessControl, ReentrancyGuard, Pausable

### Test Stats

- **Total Tests**: 500+
- **Unit Tests**: 400+
- **Integration Tests**: 50+
- **Security Tests**: 50+

---

## 🤝 Contributing

We welcome contributions! Please follow these guidelines:

### Development Workflow

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Write/update tests
5. Run tests: `npm test`
6. Commit changes: `git commit -m 'Add amazing feature'`
7. Push to branch: `git push origin feature/amazing-feature`
8. Open a Pull Request

### Code Standards

- Follow Solidity style guide
- Add NatSpec comments for all public functions
- Write tests for new features
- Maintain >90% test coverage
- Use custom errors for gas efficiency

### Commit Messages

Follow conventional commits:

```
feat: Add compound interest feature
fix: Resolve reentrancy in withdraw
docs: Update README with examples
test: Add integration tests for renewal
```

---

## 🗺️ Roadmap

### Phase 1: Core Development ✅

- [x] Smart contract implementation
- [x] Comprehensive test suite
- [x] Documentation
- [x] Deployment scripts

### Phase 2: Testing & Audit 🔄

- [ ] External security audit
- [ ] Gas optimization
- [ ] Mainnet deployment preparation
- [ ] Frontend development

### Phase 3: Launch 📋

- [ ] Mainnet deployment
- [ ] User interface launch
- [ ] Marketing campaign
- [ ] Community building

### Phase 4: Enhancements 🚀

- [ ] Multi-token support (USDC, DAI)
- [ ] Variable APR plans
- [ ] Auto-compound feature
- [ ] Governance (DAO)
- [ ] Cross-chain deployment

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- OpenZeppelin for secure contract libraries
- Hardhat for development environment
- Ethers.js for blockchain interaction
- Community contributors and testers

---

## 📞 Contact & Support

- **Documentation**: [docs/](docs/)
- **Issues**: [GitHub Issues](https://github.com/your-repo/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-repo/discussions)
- **Email**: contact@example.com
- **Twitter**: [@savingbank_v2](https://twitter.com/savingbank_v2)

---

## ⚠️ Disclaimer

This software is provided "as is", without warranty of any kind. Use at your own risk. Always conduct your own research and audit before using in production.

The smart contracts have NOT been audited by a third-party security firm. Do not use with real funds until a comprehensive audit has been completed.

---

**Built with ❤️ by the SavingBank V2 Team**

_Last Updated: January 31, 2026_
