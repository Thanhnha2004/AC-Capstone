# Phase 3 Roadmap - Advanced Features & Optimization

## 📋 Overview

Phase 3 tập trung vào **Advanced Features** và **User Experience** - Các tính năng nâng cao để tăng tính cạnh tranh và tiện ích cho người dùng.

**Timeline**: 3-4 tuần  
**Priority**: High  
**Dependencies**: Phase 2 completed ✅

---

## 🎯 Main Objectives

1. 🎯 Auto-compound interest (Tự động cộng lãi vào vốn)
2. 🎯 Partial withdrawal (Rút một phần tiền gửi)
3. 🎯 Plan migration (Chuyển đổi giữa các kỳ hạn)
4. 🎯 Referral system (Hệ thống giới thiệu)
5. 🎯 Gas optimization (Tối ưu gas)
6. 🎯 Frontend integration ready

---

## 📦 Detailed Task Breakdown

### 🔄 Task 3.1: Auto-Compound Interest (Tuần 1)

**Goal:** Lãi tự động cộng vào vốn thay vì rút ra

**📚 Concept:**
```
Normal: 
  1000 USDT → earn 100 USDT interest → withdraw 1100 USDT

Auto-compound: 
  1000 USDT → earn 100 USDT → add to principal = 1100 USDT 
  → next period earns on 1100 USDT instead of 1000 USDT
```

**💡 Example:**
```
User deposits 10,000 USDT for 6 months at 10% APR
- Enables auto-compound
- After maturity: earns 500 USDT interest
- Interest automatically adds to principal
- New principal = 10,500 USDT
- No manual withdraw & re-deposit needed!
```

**Contract changes:**
```solidity
struct DepositCertificate {
    // ... existing fields
    bool autoCompound;           // NEW - flag bật/tắt
    uint256 lastCompoundTime;    // NEW - lần compound cuối
    uint256 accumulatedInterest; // NEW - tổng lãi đã compound
}

// Bật/tắt auto-compound
function enableAutoCompound(uint256 depositId) external;
function disableAutoCompound(uint256 depositId) external;

// Compound ngay (manual trigger)
function compound(uint256 depositId) external;

// Compound nhiều deposits (save gas)
function compoundBatch(uint256[] calldata depositIds) external;
```

**Subtasks:**

- [✅] **3.1.1 Add storage** (2h)
  ```solidity
  // Add to struct
  bool autoCompound;
  uint256 lastCompoundTime;
  uint256 accumulatedInterest;
  ```

- [✅] **3.1.2 Enable/disable** (3h)
  ```solidity
  function enableAutoCompound(uint256 depositId) external {
      require(msg.sender == owner);
      deposit.autoCompound = true;
      emit AutoCompoundEnabled(depositId);
  }
  ```

- [✅] **3.1.3 Compound logic** (6h)
  ```solidity
  function compound(uint256 depositId) external {
      uint256 interest = calculateInterest(depositId);
      deposit.principal += interest;  // Cộng lãi vào gốc
      deposit.lastCompoundTime = block.timestamp;
      emit Compounded(depositId, interest);
  }
  ```

- [✅] **3.1.4 Batch compound** (2h)
  ```solidity
  function compoundBatch(uint256[] calldata ids) external {
      for (uint i; i < ids.length; i++) {
          compound(ids[i]);
      }
  }
  ```

- [✅] **3.1.5 Update withdraw** (4h)
  ```solidity
  function withdraw(uint256 depositId) external {
      if (deposit.autoCompound) {
          compound(depositId);  // Compound before withdraw
      }
      // Normal withdrawal
  }
  ```

- [✅] **3.1.6 Events** (1h)
  ```solidity
  event AutoCompoundEnabled(uint256 indexed depositId);
  event Compounded(uint256 indexed depositId, uint256 interest);
  ```

- [✅] **3.1.7 Tests** (8h)
  ```typescript
  ✓ Enable/disable auto-compound
  ✓ Compound adds interest to principal
  ✓ Batch compound multiple deposits
  ✓ Withdraw with compounded amount
  ✓ Events emitted correctly
  ```

- [✅] **3.1.8 Docs** (2h)
  - How it works
  - Example calculations
  - Gas cost comparison

**Estimated Time:** 5 days (28 hours)  
**Files Modified:** `SavingBankUpgradeable.sol`  
**Files Created:** `test/features/AutoCompound.test.ts`

---

### 💰 Task 3.2: Partial Withdrawal (Tuần 2)

**Goal:** Cho phép rút một phần tiền gửi (với phí phạt)

**📚 Concept:**
```
Normal: 
  Must wait until maturity → withdraw all

Partial withdrawal:
  Withdraw part of principal anytime → pay penalty → keep rest deposited
```

**💡 Example:**
```
User deposits 10,000 USDT for 12 months
After 6 months, needs 3,000 USDT urgently

Option 1 - Early withdraw ALL:
  - Get 10,000 USDT back
  - Lose ALL interest
  - Pay 5% penalty = 500 USDT
  - Total received: 9,500 USDT

Option 2 - Partial withdraw 3,000 USDT: ✅ BETTER!
  - Withdraw 3,000 USDT
  - Pay penalty on 3,000 only = 150 USDT (5%)
  - Received: 2,850 USDT
  - Remaining 7,000 USDT still earning interest!
```

**Business Rules:**
```
Available = Principal - Total Withdrawn
Min remaining = Plan.minDeposit
Penalty = (Amount × TimeRemaining/TotalTime) × Plan.penaltyRate

Example:
  12 month plan, withdraw after 6 months
  Penalty = Amount × (6/12) × 5% = Amount × 2.5%
```

**Contract changes:**
```solidity
struct PartialWithdrawal {
    uint256 amount;
    uint256 timestamp;
    uint256 penaltyAmount;
}

mapping(uint256 => PartialWithdrawal[]) public partialWithdrawals;

function partialWithdraw(uint256 depositId, uint256 amount) external;
function getAvailableBalance(uint256 depositId) external view;
```

**Subtasks:**

- [ ] **3.2.1 Add tracking** (2h)
  ```solidity
  struct PartialWithdrawal {
      uint256 amount;
      uint256 timestamp;
      uint256 penaltyAmount;
  }
  mapping(uint256 => PartialWithdrawal[]) partialWithdrawals;
  uint256 totalPartialWithdrawn;  // Add to DepositCertificate
  ```

- [ ] **3.2.2 Implement withdrawal** (6h)
  ```solidity
  function partialWithdraw(uint256 depositId, uint256 amount) external {
      // Validate
      require(amount >= MIN_PARTIAL);
      require(principal - amount >= plan.minDeposit);
      
      // Calculate penalty
      uint256 penalty = calculatePenalty(depositId, amount);
      
      // Transfer
      principalVault.withdraw(msg.sender, amount - penalty);
      principalVault.withdraw(feeReceiver, penalty);
      
      // Update
      deposit.principal -= amount;
      deposit.totalPartialWithdrawn += amount;
  }
  ```

- [ ] **3.2.3 Min balance check** (2h)
  ```solidity
  function getAvailableBalance(uint256 depositId) public view {
      uint256 available = principal - totalPartialWithdrawn;
      uint256 minRemaining = plan.minDeposit;
      return available - minRemaining;
  }
  ```

- [ ] **3.2.4 Penalty calculation** (4h)
  ```solidity
  function calculatePenalty(uint256 depositId, uint256 amount) 
      public view returns (uint256) {
      uint256 elapsed = block.timestamp - deposit.startAt;
      uint256 total = deposit.maturityAt - deposit.startAt;
      uint256 remaining = total - elapsed;
      
      // Penalty = amount × (timeRemaining/totalTime) × penaltyRate
      return (amount * remaining * plan.penaltyBps) / (total * 10000);
  }
  ```

- [ ] **3.2.5 Track history** (2h)
  ```solidity
  function recordPartialWithdrawal(
      uint256 depositId,
      uint256 amount,
      uint256 penalty
  ) internal {
      partialWithdrawals[depositId].push(PartialWithdrawal({
          amount: amount,
          timestamp: block.timestamp,
          penaltyAmount: penalty
      }));
  }
  ```

- [ ] **3.2.6 Update full withdraw** (3h)
  ```solidity
  function withdraw(uint256 depositId) external override {
      uint256 remaining = deposit.principal; // After partial withdrawals
      // Calculate interest on remaining principal
      // Transfer remaining + interest
  }
  ```

- [ ] **3.2.7 Events** (1h)
  ```solidity
  event PartialWithdrawal(
      uint256 indexed depositId,
      uint256 amount,
      uint256 penalty,
      uint256 received
  );
  ```

- [ ] **3.2.8 Tests** (8h)
  ```typescript
  ✓ Partial withdraw reduces principal
  ✓ Cannot withdraw below minimum
  ✓ Penalty calculated correctly (time-based)
  ✓ Track multiple withdrawals
  ✓ Full withdraw after partial
  ✓ Cannot exceed available balance
  ✓ Events emitted
  ```

**Example Penalty Calculation:**
```
Deposit: 10,000 USDT, 12 months, 5% penalty
After 3 months, withdraw 2,000 USDT

Time remaining = 12 - 3 = 9 months
Penalty = 2,000 × (9/12) × 5% = 75 USDT
Received = 2,000 - 75 = 1,925 USDT
Remaining principal = 8,000 USDT (still earning)
```

**Estimated Time:** 5 days (28 hours)  
**Files Modified:** `SavingBankUpgradeable.sol`  
**Files Created:** `test/features/PartialWithdrawal.test.ts`

---

### 🔄 Task 3.3: Plan Migration (Tuần 2-3)

**Goal:** Chuyển đổi deposit sang plan khác

**Contract changes:**
```solidity
function migratePlan(uint256 depositId, uint256 newPlanId) external;

function getMigrationPreview(
    uint256 depositId,
    uint256 newPlanId
) external view returns (
    uint256 currentInterest,
    uint256 newMaturityDate,
    uint256 fee
);
```

**Migration logic:**
```
1. Calculate accrued interest on old plan
2. Add interest to principal
3. Start new plan with new principal  
4. Charge migration fee (0.5%)
5. Burn old NFT, mint new NFT
```

**Subtasks:**
- [ ] 3.3.1 Implement `migratePlan()` function
- [ ] 3.3.2 Calculate interest up to migration point
- [ ] 3.3.3 Apply migration fee
- [ ] 3.3.4 Update deposit with new plan
- [ ] 3.3.5 Handle NFT (burn old, mint new)
- [ ] 3.3.6 Add events: `PlanMigrated`
- [ ] 3.3.7 Write tests (10+ test cases)
- [ ] 3.3.8 Document migration rules

**Estimated Time:** 6 days  
**Files Modified:** `SavingBankUpgradeable.sol`, `SavingBankNFT.sol`  
**Files Created:** `test/features/PlanMigration.test.ts`

---

### 🎁 Task 3.4: Referral System (Tuần 3)

**Goal:** Người giới thiệu nhận thưởng

**New contract:**
```solidity
contract ReferralSystem {
    struct Referral {
        address referrer;
        address referee;
        uint256 timestamp;
        uint256 rewardAmount;
    }
    
    mapping(address => address) public referrers;
    mapping(address => uint256) public totalRewards;
    
    function setReferrer(address referrer) external;
    function claimRewards() external;
    function getReferralCount(address referrer) external view;
}
```

**Reward logic:**
```
Referrer reward: 1% of referee's deposit
Referee bonus: 0.5% extra APR for first deposit
```

**Subtasks:**
- [ ] 3.4.1 Create ReferralSystem contract
- [ ] 3.4.2 Implement `setReferrer()` logic
- [ ] 3.4.3 Track referral rewards
- [ ] 3.4.4 Implement `claimRewards()`
- [ ] 3.4.5 Integrate with SavingBank deposit
- [ ] 3.4.6 Add events: `ReferralSet`, `RewardClaimed`
- [ ] 3.4.7 Write tests (8+ test cases)
- [ ] 3.4.8 Create deployment script

**Estimated Time:** 5 days  
**Files Created:** `contracts/ReferralSystem.sol`, `test/features/ReferralSystem.test.ts`

---

### ⚡ Task 3.5: Gas Optimization (Tuần 3-4)

**Goal:** Giảm 15-20% gas cost

**Current estimates:**
```
Deposit:         ~250,000 gas
Withdraw:        ~180,000 gas
Early Withdraw:  ~200,000 gas
```

**Optimization techniques:**
```
✅ Pack storage variables
✅ Use events instead of storage
✅ Batch operations
✅ Optimize loops
✅ Use unchecked math where safe
✅ Remove redundant checks
```

**Subtasks:**
- [ ] 3.5.1 Analyze current gas with `hardhat-gas-reporter`
- [ ] 3.5.2 Identify optimization opportunities
- [ ] 3.5.3 Implement storage packing
- [ ] 3.5.4 Add batch operations
- [ ] 3.5.5 Optimize math operations
- [ ] 3.5.6 Create gas comparison tests
- [ ] 3.5.7 Document optimizations

**Estimated Time:** 5 days  
**Files Modified:** All contracts  
**Files Created:** `test/gas-optimization/GasComparison.test.ts`

---

### 🔄 Task 3.6: Batch Operations (Tuần 3)

**Goal:** Reduce gas for multiple operations

**New functions:**
```solidity
function batchDeposit(
    uint256[] calldata planIds,
    uint256[] calldata amounts
) external;

function batchWithdraw(uint256[] calldata depositIds) external;

function batchEarlyWithdraw(uint256[] calldata depositIds) external;
```

**Subtasks:**
- [ ] 3.6.1 Implement batch deposit
- [ ] 3.6.2 Implement batch withdraw
- [ ] 3.6.3 Implement batch early withdraw
- [ ] 3.6.4 Add reentrancy protection
- [ ] 3.6.5 Test gas savings (compare single vs batch)
- [ ] 3.6.6 Write tests

**Estimated Time:** 3 days  
**Files Modified:** `SavingBankUpgradeable.sol`  
**Files Created:** `test/features/BatchOperations.test.ts`

---

### 🎨 Task 3.7: Frontend Integration Helpers (Tuần 4)

**Goal:** View functions cho frontend

**New view functions:**
```solidity
function getUserDeposits(address user) 
    external view returns (DepositInfo[] memory);

function getDepositDetails(uint256 depositId)
    external view returns (DepositDetails memory);

function getActivePlans() 
    external view returns (PlanInfo[] memory);

function calculateProjectedEarnings(
    uint256 planId,
    uint256 amount
) external view returns (uint256);

function getUserStats(address user) 
    external view returns (UserStats memory);
```

**Subtasks:**
- [ ] 3.7.1 Define return structs
- [ ] 3.7.2 Implement getUserDeposits()
- [ ] 3.7.3 Implement getDepositDetails()
- [ ] 3.7.4 Implement getActivePlans()
- [ ] 3.7.5 Implement calculateProjectedEarnings()
- [ ] 3.7.6 Implement getUserStats()
- [ ] 3.7.7 Add pagination for large results
- [ ] 3.7.8 Document all view functions

**Estimated Time:** 4 days  
**Files Modified:** `SavingBankUpgradeable.sol`  
**Files Created:** `docs/INTEGRATION_GUIDE.md`

---

### 📊 Task 3.8: Analytics & Events (Tuần 4)

**Goal:** Better tracking & subgraph support

**Enhanced events:**
```solidity
event DepositCreated(
    uint256 indexed depositId,
    address indexed user,
    uint256 indexed planId,
    uint256 amount,
    uint256 maturityDate,
    uint256 timestamp
);

event InterestEarned(
    uint256 indexed depositId,
    address indexed user,
    uint256 amount,
    uint256 timestamp
);
```

**Global stats:**
```solidity
struct GlobalStats {
    uint256 totalDeposits;
    uint256 totalWithdrawals;
    uint256 totalInterestPaid;
    uint256 totalUsers;
    uint256 activeDeposits;
}
```

**Subtasks:**
- [ ] 3.8.1 Review & enhance all events
- [ ] 3.8.2 Add timestamp to all events
- [ ] 3.8.3 Add GlobalStats tracking
- [ ] 3.8.4 Implement getGlobalStats()
- [ ] 3.8.5 Create subgraph schema (optional)

**Estimated Time:** 3 days  
**Files Modified:** All contracts  
**Files Created:** `docs/EVENTS.md`

---

## 📂 File Structure (Phase 3)

```
contracts/
├── SavingBankUpgradeable.sol           (MODIFY)
├── ReferralSystem.sol                  (NEW)
└── libraries/
    └── InterestCalculator.sol          (NEW)

scripts/
├── features/
│   ├── setup-referral.ts               (NEW)
│   └── batch-operations-demo.ts        (NEW)
└── automation/
    └── auto-compound-keeper.ts         (NEW - optional)

test/
├── features/
│   ├── AutoCompound.test.ts            (NEW)
│   ├── PartialWithdrawal.test.ts       (NEW)
│   ├── PlanMigration.test.ts           (NEW)
│   ├── ReferralSystem.test.ts          (NEW)
│   └── BatchOperations.test.ts         (NEW)
└── gas-optimization/
    └── GasComparison.test.ts           (NEW)

docs/
├── FEATURES_GUIDE.md                   (NEW)
├── GAS_OPTIMIZATION.md                 (NEW)
├── INTEGRATION_GUIDE.md                (NEW)
└── EVENTS.md                           (NEW)
```

---

## 📊 Progress Tracker

| Task | Description | Status | Done/Total | % |
|------|-------------|--------|------------|---|
| 3.1 | Auto-Compound | ⚪ Not Started | 0/8 | 0% |
| 3.2 | Partial Withdrawal | ⚪ Not Started | 0/8 | 0% |
| 3.3 | Plan Migration | ⚪ Not Started | 0/8 | 0% |
| 3.4 | Referral System | ⚪ Not Started | 0/8 | 0% |
| 3.5 | Gas Optimization | ⚪ Not Started | 0/7 | 0% |
| 3.6 | Batch Operations | ⚪ Not Started | 0/6 | 0% |
| 3.7 | Frontend Helpers | ⚪ Not Started | 0/8 | 0% |
| 3.8 | Analytics & Events | ⚪ Not Started | 0/5 | 0% |
| **TOTAL** | | | **0/58** | **0%** |

---

## 🎯 Priority Matrix

### 🔴 P0 - Must Have (Week 1-2)

```
✅ Essential for MVP launch
```

1. **Auto-compound interest** (Task 3.1)
2. **Partial withdrawal** (Task 3.2)
3. **Frontend view functions** (Task 3.7)

### 🟡 P1 - Should Have (Week 3)

```
✅ Important for competitive advantage
```

4. **Plan migration** (Task 3.3)
5. **Gas optimization** (Task 3.5)
6. **Batch operations** (Task 3.6)

### 🟢 P2 - Nice to Have (Week 4)

```
✅ Enhance user experience
```

7. **Referral system** (Task 3.4)
8. **Analytics & events** (Task 3.8)

---

## 📅 Week-by-Week Timeline

### Week 1: Core Features
```
Mon-Tue:  Auto-compound implementation
Wed:      Auto-compound tests
Thu-Fri:  Partial withdrawal implementation
Sat-Sun:  Partial withdrawal tests
```

### Week 2: Advanced Features
```
Mon-Wed:  Plan migration implementation
Thu:      Plan migration tests
Fri:      Frontend view functions (part 1)
Sat-Sun:  Frontend view functions (part 2)
```

### Week 3: Optimization & Extras
```
Mon-Tue:  Gas optimization analysis
Wed:      Batch operations
Thu-Fri:  Referral system
Sat-Sun:  Referral tests
```

### Week 4: Polish & Deploy
```
Mon-Tue:  Analytics & events
Wed:      Integration testing
Thu:      Deploy to testnet
Fri:      User testing
Sat-Sun:  Documentation & cleanup
```

---

## ✅ Success Criteria

Phase 3 hoàn thành khi:

1. ✅ All P0 tasks completed & tested
2. ✅ Test coverage ≥ 90%
3. ✅ Gas optimization achieved (15% reduction)
4. ✅ All features documented
5. ✅ Deployed & verified on testnet
6. ✅ Frontend integration guide ready
7. ✅ No critical/high severity bugs

---

## 🧪 Testing Requirements

**Minimum Coverage:** 90%

**Test breakdown:**
```
Auto-Compound:       10+ tests
Partial Withdrawal:   8+ tests
Plan Migration:      10+ tests
Referral System:      8+ tests
Batch Operations:     6+ tests
Gas Optimization:     5+ tests
Frontend Helpers:     8+ tests
Total:               55+ tests
```

---

## 💡 Business Impact

### User Benefits:

- 📈 **Auto-compound**: Maximize returns (compound interest)
- 💰 **Partial withdrawal**: Emergency liquidity
- 🔄 **Plan migration**: Flexibility
- 🎁 **Referral**: Earn passive rewards
- ⚡ **Lower gas**: Save on fees

### Protocol Benefits:

- 📊 **Better UX**: Competitive features
- 💎 **User retention**: More options = longer deposits
- 📈 **Growth**: Referral-driven adoption
- 🔒 **TVL increase**: Auto-compound keeps funds

---

## ⚠️ Technical Risks & Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| **Complex state management** | High | Medium | Extensive unit tests, formal verification |
| **Gas cost increase** | Medium | Low | Profile early, batch operations |
| **Storage layout breaks** | Critical | Low | Careful upgrades, storage gaps, validation |
| **Reentrancy attacks** | Critical | Low | ReentrancyGuard, CEI pattern |
| **Integer overflow** | Medium | Low | Solidity 0.8.x, tested math |

---

## 🚀 Deployment Strategy

**Testnet deployment:**
```bash
# 1. Deploy new features
npx hardhat deploy --network sepolia --tags Phase3

# 2. Upgrade via Timelock
npx hardhat run scripts/upgrade/propose-phase3-upgrade.ts

# 3. Wait 2 days

# 4. Execute upgrade
npx hardhat run scripts/upgrade/execute-phase3-upgrade.ts
```

**Mainnet deployment:**
```
Only after:
✅ 1 week testnet testing
✅ External audit (optional)
✅ Bug bounty program
✅ Community approval
```

---

## 📚 Documentation

**New docs to create:**

1. **FEATURES_GUIDE.md** - All Phase 3 features explained
2. **GAS_OPTIMIZATION.md** - Optimization techniques used
3. **INTEGRATION_GUIDE.md** - How to integrate with frontend
4. **EVENTS.md** - All events & their parameters

---

## 🎓 Learning Resources

- [Compound Interest Math](https://www.investopedia.com/terms/c/compoundinterest.asp)
- [Gas Optimization Patterns](https://github.com/iskdrews/awesome-solidity-gas-optimization)
- [Referral System Design](https://medium.com/@soliditydeveloper.com/referral-systems-in-defi)

---

**Last Updated:** 2026-02-05  
**Status:** 🔵 Not Started (0%)  
**Next Action:** Implement Task 3.1 - Auto-compound  
**Estimated Completion:** 4 weeks from start

---

**END OF PHASE 3 ROADMAP** 🚀