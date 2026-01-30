# SavingBank Architecture Migration Guide

## 📋 Document Overview

**Purpose:** Hướng dẫn migration từ architecture cũ (V1) sang architecture mới (V2)  
**Date:** January 30, 2026  
**Migration Type:** Major Architecture Refactoring  
**Status:** ✅ Completed

---

## 🔄 Migration Summary

### What Changed?
Hệ thống đã được refactor hoàn toàn từ **single-contract architecture** sang **multi-contract vault-based architecture** để tăng cường bảo mật, khả năng mở rộng và tách biệt trách nhiệm.

### Migration Impact
- ⚠️ **Breaking Changes**: Không tương thích với version cũ
- ✅ **Feature Parity**: Tất cả features cũ được giữ lại + thêm mới
- 🔒 **Security Enhanced**: Bảo mật được cải thiện đáng kể
- 📈 **Scalability Improved**: Dễ dàng mở rộng và maintain

---

## 🏗️ Architecture Comparison

### V1 Architecture (Old - In Git)

```
┌─────────────────────────────────────────┐
│              SavingBank                 │
│  (Single contract does everything)      │
│                                         │
│  • Hold all funds (principal + interest)│
│  • Manage plans                         │
│  • Process deposits/withdrawals         │
│  • Calculate interest                   │
│  • Mint/Burn NFT (built-in ERC721)     │
│  • Access control (Ownable)             │
└─────────────┬───────────────────────────┘
              │
              │ interacts with
              ▼
    ┌─────────────────┐
    │ LiquidityVault  │
    │                 │
    │ • Hold interest │
    │ • Pay interest  │
    │ • Ownable       │
    └─────────────────┘
```

**Key Characteristics:**
- 2 contracts: SavingBank + LiquidityVault
- SavingBank holds principal, LiquidityVault holds interest
- Built-in NFT (ERC721 inheritance)
- Simple Ownable access control
- Vault controlled by single owner

---

### V2 Architecture (New - Current)

```
┌────────────────────────────────────────────┐
│           SavingBankV2                     │
│     (Orchestrator - holds NO funds)        │
│                                            │
│  • Orchestrate transactions                │
│  • Manage plans & certificates             │
│  • Calculate interest                      │
│  • Access Control (ADMIN + OPERATOR)       │
└──────┬──────────────┬──────────────┬───────┘
       │              │              │
       │              │              │
┌──────▼────────┐ ┌───▼──────────┐ ┌─▼─────────────┐
│ PrincipalVault│ │InterestVault │ │ SavingBankNFT │
│               │ │              │ │               │
│ • Hold        │ │ • Hold       │ │ • Mint/Burn   │
│   principal   │ │   interest   │ │ • Soulbound   │
│ • Deposit     │ │ • Pay        │ │ • On-chain    │
│ • Withdraw    │ │ • Transfer   │ │   metadata    │
│ • Receive     │ │  to Principal│ │ • Dynamic SVG │
│   compound    │ │ • AccessCtrl │ │ • Separate    │
│ • AccessCtrl  │ │              │ │   contract    │
└───────────────┘ └──────────────┘ └───────────────┘
```

**Key Characteristics:**
- 5 contracts: SavingBankV2 + 2 Vaults + NFT + Token
- Complete separation of concerns
- Dedicated NFT contract with advanced features
- Multi-role access control (ADMIN + OPERATOR)
- Vaults have dual access control

---

## 📊 Detailed Comparison Table

| Aspect | V1 (Old) | V2 (New) | Improvement |
|--------|----------|----------|-------------|
| **Contract Count** | 2 | 5 | Better separation |
| **Principal Storage** | SavingBank | PrincipalVault | Isolated |
| **Interest Storage** | LiquidityVault | InterestVault | Consistent naming |
| **NFT Implementation** | Built-in ERC721 | Separate contract | Modular |
| **NFT Transferability** | Transferable | Soulbound | Security++ |
| **NFT Metadata** | Off-chain / Simple | On-chain + Dynamic SVG | Rich data |
| **Access Control** | Ownable (single) | AccessControl (multi-role) | Flexible |
| **SavingBank Holds Funds** | Yes (principal) | No (orchestrator only) | Cleaner |
| **Vault Access** | Single owner | ADMIN + OPERATOR roles | Secure |
| **Compound Flow** | Vault → SavingBank | Vault → Vault direct | Gas efficient |
| **Pause Mechanism** | Yes | Yes (all contracts) | Comprehensive |
| **ReentrancyGuard** | Yes | Yes (all contracts) | Bulletproof |
| **Custom Errors** | Yes | Yes | Gas efficient |
| **Deployment Complexity** | Simple | Moderate | Worth it |

---

## 🔑 Key Changes Breakdown

### 1. **Contract Structure**

#### Old (V1)
```solidity
contract SavingBank is ERC721, Ownable, Pausable, ReentrancyGuard {
    IERC20 public immutable token;
    ILiquidityVault public vault;
    
    // Holds principal funds
    // Manages NFTs
    // Orchestrates logic
}

contract LiquidityVault is Ownable, Pausable, ReentrancyGuard {
    // Holds interest funds
}
```

#### New (V2)
```solidity
contract SavingBankV2 is AccessControl, Pausable, ReentrancyGuard {
    IERC20 public immutable token;
    IPrincipalVault public principalVault;
    IInterestVault public interestVault;
    ISavingBankNFT public nft;
    
    // NO funds held
    // Pure orchestrator
}

contract PrincipalVault is AccessControl, Pausable, ReentrancyGuard {
    // Holds principal only
}

contract InterestVault is AccessControl, Pausable, ReentrancyGuard {
    // Holds interest only
}

contract SavingBankNFT is ERC721URIStorage, Ownable {
    // Dedicated NFT with soulbound
}
```

---

### 2. **NFT Implementation**

#### Old (V1)
```solidity
contract SavingBank is ERC721 {
    // NFT built into main contract
    // Standard ERC721
    // Transferable
    // Basic metadata
    
    function openDepositCertificate() {
        _safeMint(user, depositId);
    }
    
    function withdraw() {
        _burn(depositId);
    }
}
```

**Issues:**
- ❌ NFT có thể transfer (security risk)
- ❌ Metadata đơn giản
- ❌ Không có dynamic rendering
- ❌ Coupled với logic chính

#### New (V2)
```solidity
contract SavingBankNFT is ERC721URIStorage, Ownable {
    // Separate contract
    // Soulbound (non-transferable)
    // On-chain metadata
    // Dynamic SVG generation
    
    function mint(address to, uint256 tokenId, uint256 planId, uint256 amount) 
        external onlySavingBank 
    {
        _safeMint(to, tokenId);
        _certificateData[tokenId] = CertificateData(...);
        _setTokenURI(tokenId, _buildTokenURI(tokenId));
    }
    
    function _update(address to, uint256 tokenId, address auth) 
        internal override 
    {
        address from = _ownerOf(tokenId);
        // Block transfers, allow mint/burn only
        if (from != address(0) && to != address(0)) {
            revert Unauthorized();
        }
        return super._update(to, tokenId, auth);
    }
    
    function _buildTokenURI(uint256 tokenId) 
        internal view returns (string memory) 
    {
        // Generate full JSON metadata
        // Include dynamic SVG image
        // Base64 encode
    }
}
```

**Improvements:**
- ✅ Soulbound (non-transferable)
- ✅ Rich on-chain metadata
- ✅ Dynamic SVG with certificate info
- ✅ Separate contract (modular)
- ✅ Can upgrade NFT independently

---

### 3. **Access Control**

#### Old (V1)
```solidity
contract SavingBank is Ownable {
    address public owner;
    
    modifier onlyOwner() {
        require(msg.sender == owner);
        _;
    }
    
    function createPlan() external onlyOwner { }
    function setVault() external onlyOwner { }
}

contract LiquidityVault is Ownable {
    address public owner;
    address public savingBank;
    
    modifier onlySavingBank() {
        require(msg.sender == savingBank);
        _;
    }
    
    function payInterest() external onlySavingBank { }
}
```

**Issues:**
- ❌ Single point of control
- ❌ Cannot delegate operations
- ❌ Hard to implement multi-sig
- ❌ No role separation

#### New (V2)
```solidity
contract SavingBankV2 is AccessControl {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    
    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, operator);
    }
    
    function setVaults() external onlyRole(ADMIN_ROLE) { }
    function pause() external onlyRole(ADMIN_ROLE) { }
    
    function createPlan() external onlyRole(OPERATOR_ROLE) { }
    function updatePlan() external onlyRole(OPERATOR_ROLE) { }
}

contract PrincipalVault is AccessControl {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    
    function depositPrincipal() external onlyRole(OPERATOR_ROLE) { }
    function withdrawPrincipal() external onlyRole(OPERATOR_ROLE) { }
    
    function depositFund() external onlyRole(ADMIN_ROLE) { }
    function pause() external onlyRole(ADMIN_ROLE) { }
}
```

**Improvements:**
- ✅ Role-based access control
- ✅ DEFAULT_ADMIN can manage all roles
- ✅ ADMIN_ROLE for system config
- ✅ OPERATOR_ROLE for daily operations
- ✅ Can grant to multiple addresses
- ✅ Multi-sig friendly
- ✅ Flexible permission model

---

### 4. **Fund Flow**

#### Old (V1) - Deposit Flow
```
User → approve token
  │
  ▼
User → openDepositCertificate()
  │
  ├──> SavingBank receives principal (holds it)
  └──> SavingBank mints NFT to user
```

#### New (V2) - Deposit Flow
```
User → approve token to SavingBankV2
  │
  ▼
User → openDepositCertificate()
  │
  ├──> SavingBankV2 calls PrincipalVault.depositPrincipal()
  │      │
  │      └──> PrincipalVault pulls token from user
  │
  └──> SavingBankV2 calls NFT.mint()
         │
         └──> NFT mints to user with metadata
```

**Differences:**
- V1: SavingBank holds funds directly
- V2: PrincipalVault holds funds, SavingBank orchestrates

---

#### Old (V1) - Withdraw Flow
```
User → withdraw(depositId)
  │
  ├──> SavingBank transfers principal to user
  │
  ├──> SavingBank calls LiquidityVault.payInterest()
  │      │
  │      └──> LiquidityVault transfers interest to user
  │
  └──> SavingBank burns NFT
```

#### New (V2) - Withdraw Flow
```
User → withdraw(depositId)
  │
  ├──> SavingBankV2 calls InterestVault.payInterest()
  │      │
  │      └──> InterestVault transfers interest to user
  │
  ├──> SavingBankV2 calls PrincipalVault.withdrawPrincipal()
  │      │
  │      └──> PrincipalVault transfers principal to user
  │
  └──> SavingBankV2 calls NFT.burn()
         │
         └──> NFT burns tokenId
```

**Differences:**
- V1: Interest first (from vault), then principal (from SavingBank)
- V2: Interest first, then principal, then burn (all from SavingBank orchestrating vaults)

---

#### Old (V1) - Renew Flow
```
User → renewWithSamePlan(depositId) or renewWithNewPlan(depositId, newPlanId)
  │
  ├──> Calculate interest
  │
  ├──> LiquidityVault.payInterest(address(SavingBank), interest)
  │      └──> Interest transferred to SavingBank
  │
  ├──> SavingBank holds old principal + new interest
  │
  ├──> Burn old NFT
  │
  └──> Mint new NFT with newPrincipal = old + interest
```

**Issue in V1:**
- ❌ SavingBank accumulates funds during renew
- ❌ More complex accounting

#### New (V2) - Renew Flow
```
User → renew(depositId, newPlanId)
  │
  ├──> Calculate interest
  │
  ├──> InterestVault.transferInterestToPrincipal(principalVault, user, interest)
  │      │
  │      └──> Interest transferred DIRECTLY to PrincipalVault
  │
  ├──> PrincipalVault.receiveDirectDeposit(user, interest)
  │      │
  │      └──> PrincipalVault updates balance (no transferFrom needed)
  │
  ├──> NFT.burn(oldDepositId)
  │
  └──> NFT.mint(user, newDepositId, newPlanId, newPrincipal)
```

**Improvements:**
- ✅ Direct vault-to-vault transfer
- ✅ SavingBank never holds funds
- ✅ Cleaner accounting
- ✅ Gas efficient (one less transfer)

---

### 5. **Naming Changes**

| V1 Name | V2 Name | Reason |
|---------|---------|--------|
| `LiquidityVault` | `InterestVault` | Clearer purpose |
| `vault` (variable) | `interestVault` | Explicit naming |
| N/A | `principalVault` | New dedicated vault |
| `renewWithSamePlan()` | `renew()` (with same planId) | Simplified API |
| `renewWithNewPlan()` | `renew()` (with different planId) | Unified function |
| Built-in NFT | `SavingBankNFT` | Separate contract |
| `Ownable` | `AccessControl` | Multi-role support |

---

## 🚀 Migration Steps

### For Developers

#### Step 1: Update Contract Files
```bash
# Old structure (V1)
contracts/
├── SavingBank.sol
├── LiquidityVault.sol
└── mock/
    └── ERC20Mock.sol

# New structure (V2)
contracts/
├── SavingBank_v2.sol
├── PrincipalVault.sol
├── InterestVault.sol
├── SavingBankNFT.sol
└── mock/
    └── ERC20Mock.sol
```

#### Step 2: Update Deployment Scripts
```typescript
// Old (V1)
1. Deploy ERC20Mock
2. Deploy LiquidityVault
3. Deploy SavingBank
4. Set savingBank on LiquidityVault

// New (V2)
1. Deploy ERC20Mock
2. Deploy InterestVault
3. Deploy PrincipalVault
4. Deploy SavingBankNFT
5. Deploy SavingBankV2
6. Grant OPERATOR_ROLE to SavingBankV2 on both vaults
7. Set savingBank on NFT contract
```

#### Step 3: Update Interfaces
```solidity
// Old interface
interface ILiquidityVault {
    function payInterest(address user, uint256 amount) external;
    function deductInterest(address user, uint256 amount) external;
}

// New interfaces
interface IPrincipalVault {
    function depositPrincipal(address from, uint256 amount) external;
    function withdrawPrincipal(address to, uint256 amount) external;
    function receiveDirectDeposit(address user, uint256 amount) external;
}

interface IInterestVault {
    function payInterest(address user, uint256 amount) external;
    function transferInterestToPrincipal(address vault, address user, uint256 amount) external;
}

interface ISavingBankNFT {
    function mint(address to, uint256 tokenId, uint256 planId, uint256 amount) external;
    function burn(uint256 tokenId) external;
}
```

#### Step 4: Update Tests
- Test all 5 contracts independently
- Test integration flows
- Test access control for all roles
- Test soulbound NFT behavior
- Test vault-to-vault transfers

---

### For Users (Migration Path)

#### Option 1: Natural Migration (Recommended)
1. **Keep existing deposits in V1** until maturity
2. **Withdraw from V1** when mature
3. **Deposit in V2** with new deposits
4. **No forced migration** - let contracts coexist

#### Option 2: Forced Migration
1. Deploy V2 contracts
2. Pause V1 contracts
3. Create migration script:
   - Read all active deposits from V1
   - Admin withdraws principal from V1 SavingBank
   - Admin withdraws interest from V1 LiquidityVault
   - Admin funds V2 vaults
   - Recreate deposits in V2
   - Airdrop new V2 NFTs to users
4. Unpause V2, deprecate V1

**Recommended:** Option 1 (Natural Migration)

---

## 📋 Feature Mapping

| Feature | V1 Implementation | V2 Implementation | Status |
|---------|-------------------|-------------------|--------|
| **Create Plan** | `createPlan()` in SavingBank | `createPlan()` in SavingBankV2 | ✅ Same |
| **Update Plan** | `updatePlan()` in SavingBank | `updatePlan()` in SavingBankV2 | ✅ Same |
| **Enable/Disable Plan** | `updatePlanStatus()` | `updatePlanStatus()` | ✅ Same |
| **Open Deposit** | `openDepositCertificate()` | `openDepositCertificate()` | ✅ Same API, different flow |
| **Withdraw** | `withdraw()` | `withdraw()` | ✅ Same |
| **Early Withdraw** | `earlyWithdraw()` | `earlyWithdraw()` | ✅ Same |
| **Renew Same Plan** | `renewWithSamePlan()` | `renew(id, samePlanId)` | ✅ Simplified |
| **Renew New Plan** | `renewWithNewPlan()` | `renew(id, newPlanId)` | ✅ Unified |
| **NFT** | Built-in, transferable | Separate, soulbound | ✅✅ Enhanced |
| **View Deposits** | `getUserDepositIds()` | `getUserDepositIds()` | ✅ Same |
| **Calculate Interest** | `getCalculateInterest()` | `getCalculateInterest()` | ✅ Same |
| **Pause System** | `pause()`/`unpause()` | `pause()`/`unpause()` | ✅ Enhanced (all contracts) |
| **Access Control** | Owner only | ADMIN + OPERATOR | ✅✅ Enhanced |

---

## ⚠️ Breaking Changes

### 1. **Contract Addresses**
- All contracts have new addresses
- Must update frontend/backend to point to new addresses

### 2. **NFT Behavior**
- **V1**: NFTs are transferable (standard ERC721)
- **V2**: NFTs are soulbound (non-transferable)
- **Impact**: Users cannot sell/transfer certificates

### 3. **Function Signatures**
```solidity
// V1
function renewWithSamePlan(uint256 depositId) external;
function renewWithNewPlan(uint256 depositId, uint256 newPlanId) external;

// V2
function renew(uint256 depositId, uint256 newPlanId) external;
// Use same planId for "same plan" behavior
```

### 4. **Access Control**
- **V1**: `onlyOwner` modifier
- **V2**: `onlyRole(ADMIN_ROLE)` or `onlyRole(OPERATOR_ROLE)`
- **Impact**: Must grant roles, not just ownership

### 5. **Approval Flow**
```solidity
// V1: Approve to SavingBank
token.approve(savingBankAddress, amount);

// V2: Still approve to SavingBankV2, but it delegates to vaults
token.approve(savingBankV2Address, amount);
```

### 6. **Fund Holding**
- **V1**: SavingBank holds principal
- **V2**: PrincipalVault holds principal
- **Impact**: Check balances in vaults, not SavingBank

---

## ✅ What's NOT Changed (Feature Parity)

1. ✅ Interest calculation formula (same)
2. ✅ Plan structure (same fields)
3. ✅ Deposit certificate structure (same + snapshots)
4. ✅ Penalty mechanism (same)
5. ✅ Maturity logic (same)
6. ✅ User experience (same flows)
7. ✅ View functions (same APIs)
8. ✅ Events (similar, some renamed)

---

## 🎯 Benefits of V2 Architecture

### Security
- ✅ **Separation of Concerns**: Each contract has single responsibility
- ✅ **Isolated Risks**: If one vault has issue, others unaffected
- ✅ **Soulbound NFT**: Prevents certificate trading
- ✅ **Multi-role Access**: Better permission management
- ✅ **Comprehensive Pause**: Can pause entire system

### Maintainability
- ✅ **Modular Design**: Easy to upgrade individual components
- ✅ **Clear Interfaces**: Well-defined contract interactions
- ✅ **Independent Testing**: Can test each contract separately
- ✅ **Code Reusability**: Vault patterns can be reused

### Scalability
- ✅ **Add More Vaults**: Easy to add new vault types
- ✅ **Upgrade NFT**: Can deploy new NFT contract without touching logic
- ✅ **Multiple Tokens**: Architecture supports multi-token (future)
- ✅ **Plugin Architecture**: Can add features without core changes

### User Experience
- ✅ **Rich NFT Metadata**: On-chain data + dynamic SVG
- ✅ **Same User Flows**: No learning curve
- ✅ **Better Tracking**: Clear vault balances
- ✅ **Provable Ownership**: Soulbound certificates

---

## 📝 Checklist for Migration

### Development Team
- [ ] Review all V2 contracts
- [ ] Update deployment scripts
- [ ] Write comprehensive tests
- [ ] Update frontend integration
- [ ] Update backend APIs
- [ ] Test on testnet
- [ ] Security audit V2 contracts
- [ ] Prepare migration plan

### Operations Team
- [ ] Deploy V2 to testnet
- [ ] Test all flows end-to-end
- [ ] Prepare fund migration plan
- [ ] Set up monitoring for V2
- [ ] Create admin documentation
- [ ] Train support team
- [ ] Prepare user communication

### Users
- [ ] Announcement about V2 launch
- [ ] Guide for existing V1 users
- [ ] FAQ about changes
- [ ] Support channel for questions
- [ ] Migration incentives (optional)

---

## 🔮 Future Roadmap

### Short Term (Post V2 Launch)
- [ ] Comprehensive testing
- [ ] Security audit
- [ ] Gradual rollout
- [ ] V1 → V2 migration support
- [ ] Documentation updates

### Medium Term
- [ ] Multi-token support
- [ ] Variable APR plans
- [ ] Governance features
- [ ] Analytics dashboard
- [ ] Mobile app integration

### Long Term
- [ ] Cross-chain deployment
- [ ] DeFi protocol integrations
- [ ] Insurance fund
- [ ] DAO governance
- [ ] Liquidity mining

---

## 📞 Support & Resources

### Documentation
- Architecture Guide: `SavingBank_Architecture.md`
- Project Summary: `Project_Summary.md`
- This Migration Guide: `Migration_Guide.md`

### Contract Addresses (After Deployment)
```
V1 (Old - Deprecated):
- SavingBank: 0x... (to be deprecated)
- LiquidityVault: 0x... (to be deprecated)

V2 (New - Active):
- SavingBankV2: 0x...
- PrincipalVault: 0x...
- InterestVault: 0x...
- SavingBankNFT: 0x...
- ERC20Mock: 0x...
```

---

## 🏁 Conclusion

The migration from V1 to V2 represents a significant architectural improvement with:

**Key Achievements:**
- ✅ Better security through separation of concerns
- ✅ Enhanced NFT with soulbound + on-chain metadata
- ✅ Flexible multi-role access control
- ✅ Cleaner fund flow with dedicated vaults
- ✅ Modular design for future enhancements
- ✅ Complete feature parity + improvements

**Recommendation:**
Deploy V2 as the primary system and allow natural migration from V1 as deposits mature. V1 can be gradually phased out over 6-12 months.

---

**Migration Completed:** January 30, 2026  
**V2 Status:** ✅ Ready for Testing & Audit  
**Next Steps:** Comprehensive testing → Security audit → Testnet deployment