#### **1. Setup Project (100%)**

```bash
✓ Khởi tạo Hardhat project
✓ Cài đặt dependencies:
  - @nomicfoundation/hardhat-toolbox
  - @openzeppelin/contracts
  - @nomicfoundation/hardhat-network-helpers
✓ Cấu trúc thư mục: contracts/, test/, scripts/
✓ Config hardhat.config.ts (Solidity 0.8.20, TypeScript, Gas reporter)
```

#### **2. MockERC20 Token (100%)**

**File:** `contracts/ERC20Mock.sol`

- ✅ Import OpenZeppelin ERC20
- ✅ Constructor: name, symbol, decimals (18)
- ✅ Public mint function
- ✅ Compile thành công

**Lines of Code:** ~20 lines

#### **3. LiquidityVault Contract (100%)**

**File:** `contracts/LiquidityVault.sol`

**Dependencies:**

- ✅ SafeERC20, IERC20
- ✅ Ownable, Pausable, ReentrancyGuard

**Custom Errors:**

```solidity
✓ InvalidToken()
✓ InvalidAmount()
✓ InvalidAddress()
✓ InsufficientBalance()
✓ Unauthorized()
```

**State Variables:**

```solidity
✓ IERC20 public immutable token
✓ address public savingBank
✓ uint256 public totalBalance
```

**Admin Functions:**

- ✅ `setSavingBank(address)` - onlyOwner
- ✅ `fundVault(uint256)` - deposit tokens to vault
- ✅ `withdrawVault(uint256)` - withdraw surplus tokens
- ✅ `pause()` / `unpause()` - emergency stop

**SavingBank Functions:**

- ✅ `payInterest(address, uint256)` - pay interest to user
- ✅ `deductInterest(address, uint256)` - deduct interest (no transfer)
- ✅ Modifier `onlySavingBank` - authorization check

**View Functions:**

- ✅ `getBalance()` - return totalBalance
- ✅ `getActualBalance()` - return actual token balance

**Events:**

```solidity
✓ Funded(address indexed funder, uint256 amount)
✓ Withdrawn(address indexed recipient, uint256 amount)
✓ SavingBankUpdated(address indexed oldBank, address indexed newBank)
✓ InterestPaid(address indexed recipient, uint256 amount)
✓ InterestRenewed(address indexed recipient, uint256 amount)
```

**Lines of Code:** ~184 lines

#### **4. Deploy Script (100%)**

**File:** `scripts/deploy.ts`

- ✅ Deploy MockERC20
- ✅ Deploy LiquidityVault
- ✅ Log contract addresses
- ✅ Test deploy on local network

### 📈 Metrics Ngày 1

| Metric                | Value      |
| --------------------- | ---------- |
| Contracts Created     | 2          |
| Total Lines of Code   | ~204 lines |
| Functions Implemented | 8          |
| Custom Errors Defined | 5          |
| Events Defined        | 5          |
| Compile Status        | ✅ Success |
| Deploy Status         | ✅ Success |

### 🎯 Deliverables Ngày 1

- ✅ LiquidityVault.sol hoàn chỉnh (184 lines)
- ✅ ERC20Mock.sol (20 lines)
- ✅ Compile thành công
- ✅ Deploy script hoạt động

---
