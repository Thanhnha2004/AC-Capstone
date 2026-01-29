## 📅 NGÀY 2: SAVINGBANK STRUCTS & ADMIN

### ✅ Hoàn Thành

#### **1. SavingBank Setup (100%)**

**File:** `contracts/SavingBank.sol`

**Dependencies:**

- ✅ ERC721, SafeERC20, IERC20
- ✅ Ownable, Pausable, ReentrancyGuard

**Custom Errors:**

```solidity
✓ InvalidToken()
✓ InvalidVault()
✓ NotEnabledPlan()
✓ InvalidAmount()
✓ InvalidAddress()
✓ InvalidTenor()
✓ InvalidAPR()
✓ InvalidMinDeposit()
✓ InvalidMaxDeposit()
✓ NotExceed()
✓ InvalidPlanId()
✓ NotOwner()
✓ NotActiveDeposit()
✓ NotMaturedYet()
✓ AlreadyMatured()
✓ AlreadyRenewed()
```

#### **2. Data Structures (100%)**

**Enum:**

```solidity
✓ enum DepositStatus {
    Active,          // 0
    Withdrawn,       // 1
    EarlyWithdrawn, // 2
    Renewed         // 3
  }
```

**SavingPlan Struct:**

```solidity
✓ struct SavingPlan {
    uint256 tenorDays;
    uint256 aprBps;
    uint256 minDeposit;
    uint256 maxDeposit;
    uint256 earlyWithdrawPenaltyBps;
    bool enabled;
  }
```

**DepositCertificate Struct:**

```solidity
✓ struct DepositCertificate {
    address owner;
    uint256 planId;
    uint256 principal;
    uint256 startAt;
    uint256 maturityAt;
    DepositStatus status;
    uint256 renewedDepositId;
    // Snapshot plan data at deposit time
    uint256 snapshotAprBps;
    uint256 snapshotTenorDays;
    uint256 snapshotEarlyWithdrawPenaltyBps;
  }
```

#### **3. State Variables (100%)**

```solidity
✓ IERC20 public immutable token
✓ uint256 public nextPlanId (init = 1)
✓ uint256 public nextDepositId (init = 1)
✓ mapping(uint256 => SavingPlan) public savingPlans
✓ mapping(uint256 => DepositCertificate) public depositCertificates
✓ mapping(address => uint256[]) public userDepositIds
✓ ILiquidityVault public vault
✓ address public feeReceiver
```

**Constants:**

```solidity
✓ uint256 private constant SECONDS_PER_YEAR = 365 days
✓ uint256 private constant BASIS_POINTS = 10000
```

#### **4. Constructor (100%)**

```solidity
✓ constructor(address _token, address _vault, address _feeReceiver)
  ERC721("Saving Bank Certificate", "SBC")
  Ownable(msg.sender)
✓ Validate all addresses != address(0)
✓ Initialize token, vault, feeReceiver
✓ Set nextPlanId = 1
✓ Set nextDepositId = 1
```

#### **5. Plan Management Functions (100%)**

**createPlan:**

- ✅ onlyOwner modifier
- ✅ Validate tenorDays > 0
- ✅ Validate aprBps > 0
- ✅ Validate minDeposit > 0
- ✅ Validate maxDeposit >= minDeposit (if maxDeposit > 0)
- ✅ Validate earlyWithdrawPenaltyBps > 0 && <= BASIS_POINTS
- ✅ Create SavingPlan with enabled = true
- ✅ Increment nextPlanId
- ✅ Emit PlanCreated event

**updatePlanStatus:**

- ✅ onlyOwner modifier
- ✅ Validate planId
- ✅ Update enabled status
- ✅ Emit PlanUpdated event

**updatePlan:**

- ✅ onlyOwner modifier
- ✅ Validate planId
- ✅ Validate all parameters
- ✅ Update all plan fields
- ✅ Emit PlanUpdated event

#### **6. Admin Functions (100%)**

**setVault:**

- ✅ onlyOwner modifier
- ✅ Validate address != zero
- ✅ Update vault address
- ✅ Emit VaultUpdated event

**setFeeReceiver:**

- ✅ onlyOwner modifier
- ✅ Validate address != zero
- ✅ Update feeReceiver
- ✅ Emit FeeReceiverUpdated event

**pause / unpause:**

- ✅ onlyOwner modifier
- ✅ Call internal \_pause() / \_unpause()

#### **7. View Functions (100%)**

- ✅ `getPlanInfo(uint256)` - return SavingPlan data

#### **8. Events (100%)**

```solidity
✓ PlanCreated(uint256 indexed planId, ...)
✓ PlanUpdated(uint256 indexed planId, bool isEnabled)
✓ VaultUpdated(address indexed newVault)
✓ FeeReceiverUpdated(address indexed newFeeReceiver)
```

#### **9. Interface Definition (100%)**

```solidity
✓ interface ILiquidityVault {
    function payInterest(address user, uint256 amount) external;
    function deductInterest(address user, uint256 amount) external;
    function getBalance() external view returns (uint256);
    function getActualBalance() external view returns (uint256);
  }
```

### 📈 Metrics Ngày 2

| Metric                | Value          |
| --------------------- | -------------- |
| New Contracts         | 1 (SavingBank) |
| Total Lines of Code   | ~200 lines     |
| Functions Implemented | 8              |
| Structs Defined       | 2              |
| Enums Defined         | 1              |
| Custom Errors         | 16             |
| Events Defined        | 4              |
| State Variables       | 8              |
| Compile Status        | ✅ Success     |

### 🎯 Deliverables Ngày 2

- ✅ SavingBank.sol structs & admin functions (~200 lines)
- ✅ Compile thành công
- ✅ Data structures hoàn chỉnh
- ✅ Plan management system ready

---
