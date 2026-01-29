## 📅 NGÀY 3: CORE USER FUNCTIONS

### ✅ Hoàn Thành

#### **1. openDepositCertificate (100%)**

**Function Implementation:**

```solidity
✓ function openDepositCertificate(uint256 planId, uint256 amount)
  external whenNotPaused nonReentrant
```

**Validations:**

- ✅ Plan must be enabled
- ✅ Amount >= minDeposit
- ✅ Amount <= maxDeposit (if maxDeposit > 0)

**Logic Flow:**

1. ✅ Get SavingPlan by planId
2. ✅ Validate plan and amount
3. ✅ Calculate maturity timestamp
4. ✅ Create DepositCertificate with:
   - owner, planId, principal
   - startAt, maturityAt
   - status = Active
   - **Snapshot plan data** (APR, tenor, penalty)
5. ✅ Add to userDepositIds array
6. ✅ Increment nextDepositId
7. ✅ Transfer tokens from user to contract
8. ✅ Mint NFT to user
9. ✅ Emit DepositCertificateOpened event

**Key Features:**

- 🔐 **Snapshot Mechanism:** Plan data frozen at deposit time
- 🎫 **NFT Certificate:** Each deposit gets unique NFT
- 💰 **Token Transfer:** SafeERC20 for secure transfers

**Event:**

```solidity
✓ event DepositCertificateOpened(
    uint256 indexed depositId,
    address indexed user,
    uint256 indexed planId,
    uint256 depositAmount,
    uint256 maturityTimestamp
  )
```

#### **2. Interest Calculation Helper (100%)**

**Internal Function:**

```solidity
✓ function _calculateInterest(uint256 depositId)
    internal view returns (uint256)
```

**Formula:**

```solidity
interest = (principal × snapshotAprBps × tenorSeconds)
           / (SECONDS_PER_YEAR × BASIS_POINTS)
```

**External View Function:**

```solidity
✓ function getCalculateInterest(uint256 depositId)
    external view returns (uint256)
```

**Features:**

- ✅ Uses snapshot APR (unchanged if plan updated)
- ✅ Uses snapshot tenor
- ✅ Precision: 18 decimals (wei)
- ✅ Public view for user query

#### **3. withdraw Function (100%)**

**Function Implementation:**

```solidity
✓ function withdraw(uint256 depositId) external nonReentrant
```

**Validations:**

- ✅ Caller must be deposit owner
- ✅ Deposit must be Active
- ✅ Must be at or past maturity

**Logic Flow:**

1. ✅ Get DepositCertificate from storage
2. ✅ Validate owner, status, maturity
3. ✅ Calculate interest using \_calculateInterest
4. ✅ Update status to Withdrawn
5. ✅ Transfer principal to user
6. ✅ Call vault.payInterest to transfer interest
7. ✅ Burn NFT
8. ✅ Emit Withdrawn event

**Token Flows:**

- Principal: SavingBank → User
- Interest: LiquidityVault → User

**Event:**

```solidity
✓ event Withdrawn(
    uint256 indexed depositId,
    address indexed user,
    uint256 principalAmount,
    uint256 interestAmount,
    DepositStatus finalStatus
  )
```

#### **4. earlyWithdraw Function (100%)**

**Function Implementation:**

```solidity
✓ function earlyWithdraw(uint256 depositId) external nonReentrant
```

**Validations:**

- ✅ Caller must be deposit owner
- ✅ Deposit must be Active
- ✅ Must be BEFORE maturity

**Penalty Calculation:**

```solidity
penalty = (principal × snapshotEarlyWithdrawPenaltyBps) / BASIS_POINTS
```

**Logic Flow:**

1. ✅ Get DepositCertificate from storage
2. ✅ Validate owner, status, not matured
3. ✅ Calculate penalty using snapshot penalty rate
4. ✅ Update status to EarlyWithdrawn
5. ✅ Transfer (principal - penalty) to user
6. ✅ Transfer penalty to feeReceiver
7. ✅ Burn NFT
8. ✅ Emit EarlyWithdrawn event

**Token Flows:**

- User receives: Principal - Penalty
- FeeReceiver receives: Penalty
- No interest paid (before maturity)

**Event:**

```solidity
✓ event EarlyWithdrawn(
    uint256 indexed depositId,
    address indexed user,
    uint256 amountReceived,
    uint256 penaltyAmount,
    DepositStatus finalStatus
  )
```

#### **5. Basic Tests (100%)**

**File:** `test/SavingBank.test.ts`

**Test Suites Created:**

- ✅ Deployment tests (8 tests)
- ✅ createPlan tests (3 tests)
- ✅ openDepositCertificate happy path (2 tests)
- ✅ withdraw happy path (2 tests)
- ✅ earlyWithdraw happy path (2 tests)

**Total:** ~17 basic tests passing

### 📈 Metrics Ngày 3

| Metric         | Value      |
| -------------- | ---------- |
| New Functions  | 4          |
| Lines Added    | ~150 lines |
| Events Defined | 3          |
| Token Flows    | 3 types    |
| Tests Written  | 17         |
| Test Pass Rate | 100%       |

### 🎯 Deliverables Ngày 3

- ✅ openDepositCertificate implemented
- ✅ withdraw implemented
- ✅ earlyWithdraw implemented
- ✅ \_calculateInterest helper
- ✅ Basic tests pass (~17 tests)

### 🔑 Key Features Implemented

**Snapshot Mechanism:**

- Plan parameters frozen at deposit time
- Immune to plan updates after deposit
- Ensures predictable returns

**NFT Integration:**

- Each deposit = unique NFT certificate
- NFT burned on withdraw/early withdraw
- Ownership tied to deposit ownership

**Security:**

- ReentrancyGuard on all state-changing functions
- Pausable for emergency situations
- Comprehensive input validation

---
