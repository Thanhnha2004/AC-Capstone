# KẾ HOẠCH 6 NGÀY - SAVING BANK CAPSTONE

## Tổng quan
Kế hoạch 6 ngày hoàn chỉnh từ zero đến finished, chia đều công việc implementation và testing.

---

## 📅 NGÀY 1: Setup Project & LiquidityVault Contract

### Morning (2-3 giờ)
1. Setup Project
- Init Hardhat project
- Install dependencies (OpenZeppelin, testing tools)
- Setup folder structure
- Configure hardhat.config.js

2. Mock USDC Token
- Tạo MockERC20 contract (18 decimals)
- Basic mint/transfer functions

3. LiquidityVault Contract - Part 1
- Define errors
- Define state variables (token, savingBank, totalBalance)
- Constructor
- setSavingBank function

### Afternoon (2-3 giờ)
4. LiquidityVault Contract - Part 2
- Admin functions:
  - fundVault
  - withdrawVault
  - pause/unpause
- SavingBank functions:
  - payInterest
  - deductInterest
- View functions
- Events

5. Compile & Basic Test
- Compile contracts
- Deploy script đơn giản
- Test deployment cơ bản

Deliverable Ngày 1:
- [ ] LiquidityVault.sol hoàn chỉnh
- [ ] MockERC20.sol
- [ ] Compile success

---

## 📅 NGÀY 2: SavingBank Contract - Structs & Admin

### Morning (2-3 giờ)
1. SavingBank Setup
- Import ERC721, OpenZeppelin, Pausable, ReentrancyGuard contracts
- Define errors
- Define structs:
  - SavingPlan
  - DepositCertificate
- Define constants (SECONDS_PER_YEAR, BASIS_POINTS, etc.)
- State variables

2. Constructor & Admin Setup
- Constructor (token, vault, feeReceiver)
- Validate inputs

3. Plan Management Functions
- createPlan
- updatePlan
- updatePlanStatus
- Validation logic
- Events

### Afternoon (2-3 giờ)
4. Admin Functions
- setVault
- setFeeReceiver
- pause/unpause
- Events

5. View Functions cho Plans
- getPlanInfo
- Basic helper functions

6. Compile & Test
- Compile contracts
- Setup test fixtures
- Basic deployment test

Deliverable Ngày 2:
- [ ] SavingBank structs & admin functions
- [ ] Compile success
- [ ] Test fixtures ready

---

## 📅 NGÀY 3: SavingBank - Core User Functions

### Morning (2-3 giờ)
1. openDepositCertificate
- Validate plan & amount
- Transfer tokens
- Create DepositCertificate
- Mint NFT
- Update mappings (userDepositIds)
- Emit events

2. _calculateInterest Helper
- Implement interest formula
- Use snapshot data from deposit

### Afternoon (2-3 giờ)
3. withdraw Function
- Validate ownership & maturity
- Check grace period với autoRenew
- Calculate interest
- Transfer principal to user
- Call vault.payInterest
- Burn NFT
- Update status
- Emit event

4. earlyWithdraw Function
- Validate ownership & timing
- Calculate penalty
- Transfer (principal - penalty) to user
- Transfer penalty to feeReceiver
- Burn NFT
- Update status
- Emit event

5. Basic Test cho User Functions
- Test openDepositCertificate
- Test withdraw
- Test earlyWithdraw

Deliverable Ngày 3:
- [ ] Core user functions implemented
- [ ] Basic tests pass
- [ ] Interest & penalty calculation working

---

## 📅 NGÀY 4: SavingBank - Renew & Complete Testing Setup

### Morning (2-3 giờ)
1. renewWithSamePlan
- Validate maturity & ownership
- Calculate interest
- Create new deposit (principal + interest)
- Call vault.deductInterest
- Update old deposit (status, renew field)
- Burn old NFT, mint new NFT
- Emit events

2. renewWithNewPlan
- Similar logic với renewWithSamePlan
- Validate new plan
- Snapshot new plan data

3. setAutoRenew
- Update autoRenewEnabled flag
- Validate ownership
- Emit event

### Afternoon (2-3 giờ)
4. View Functions
- getCalculateInterest
- getUserDepositIds
- getDepositInfo
- Complete all view functions

5. Complete Test Suite Setup
- Test helpers (timeTravel, calculateInterest)
- Test fixtures cho all scenarios
- Setup beforeEach hooks

6. Test LiquidityVault Complete
- All admin functions
- payInterest & deductInterest
- Access control
- Error cases
- Target: Coverage >= 90%

Deliverable Ngày 4:
- [ ] All contract functions implemented
- [ ] LiquidityVault tests complete (>= 90%)
- [ ] Test infrastructure ready

---

## 📅 NGÀY 5: Complete SavingBank Testing

### Morning (2-3 giờ)
1. Test Plan Management
- createPlan (happy path + errors)
- updatePlan & updatePlanStatus
- Access control
- Target: >= 90% coverage

2. Test openDepositCertificate
- Happy path (transfer, mint, data)
- Amount validation
- Plan validation
- Snapshot data
- AutoRenew flag
- Multiple deposits
- Target: >= 90% coverage

### Afternoon (2-3 giờ)
3. Test withdraw
- Normal maturity
- Interest calculation (nhiều scenarios)
- Grace period logic
- Error cases (not matured, not owner, etc.)
- Target: >= 90% coverage

4. Test earlyWithdraw
- Penalty calculation
- Token transfers (user + feeReceiver)
- Error cases (already matured, not owner, etc.)
- Target: >= 90% coverage

Evening (1-2 giờ nếu cần)
5. Test Renew Functions
- renewWithSamePlan (basic flow)
- Compound interest
- renewWithNewPlan
- Plan switching
- Error cases

Deliverable Ngày 5:
- [ ] Core SavingBank functions tested (>= 90%)
- [ ] Interest/penalty calculations verified
- [ ] All error cases covered

---

## 📅 NGÀY 6: Integration, Edge Cases & Final Polish

### Morning (2 giờ)
1. Complete Renew Tests
- Renew multiple times
- vault.deductInterest verification
- NFT lifecycle
- setAutoRenew function
- View functions
- Target: >= 85% coverage

2. Integration Tests
- Flow 1: Open → Withdraw
- Flow 2: Open → Early Withdraw
- Flow 3: Open → Renew → Withdraw
- Flow 4: Open → Renew (new plan) → Withdraw
- Flow 5: Multiple users scenario
- Verify vault balance tracking

### Afternoon (2-3 giờ)
3. Edge Cases
- Very small/large amounts
- Vault insufficient liquidity
- Rounding với 6 decimals
- Interest = 0 scenarios
- Grace period boundaries
- APR/tenor extremes
- Time-based edge cases

4. Security Tests
- Reentrancy tests
- Access control verification
- Pause/unpause scenarios
- Front-running considerations

5. Final Review & Cleanup
- Run full test suite
- Check coverage report (>= 85%)
- Run Slither
- Fix any warnings
- Remove console.log
- Clean up comments
- Verify all NatSpec
- Gas optimization review (if time permits)

6. Final Checklist
- [ ] All tests pass
- [ ] Coverage >= 85% overall
- [ ] LiquidityVault >= 90%
- [ ] SavingBank >= 85%
- [ ] No Slither critical issues
- [ ] Code clean
- [ ] Ready to deploy

Deliverable Ngày 6:
- [ ] Complete test suite (>= 85% coverage)
- [ ] Integration tests pass
- [ ] Edge cases handled
- [ ] Security verified
- [ ] Code production-ready

---

## 📊 Timeline Summary

| Ngày | Focus | Deliverable |
|------|-------|-------------|
| 1 | LiquidityVault Contract | Vault contract complete |
| 2 | SavingBank Structs & Admin | Admin functions done |
| 3 | Core User Functions | Deposit/Withdraw/Early done |
| 4 | Renew & Vault Testing | All functions + Vault tests |
| 5 | SavingBank Core Testing | Core functions tested |
| 6 | Integration & Polish | Complete & production-ready |

---

## 📊 Coverage Goals

| Contract | Target | Priority |
|----------|--------|----------|
| LiquidityVault | >= 90% | High |
| SavingBank | >= 85% | High |
| Overall | >= 85% | Critical |

---

## 🔧 Essential Commands

```bash
# Compile
npx hardhat compile

# Run tests
npx hardhat test

# Specific test file
npx hardhat test test/LiquidityVault.test.js

# Coverage
npx hardhat coverage

# Gas report
REPORT_GAS=true npx hardhat test

# Slither
slither .
```

---

## ⚠️ Critical Implementation Notes

### LiquidityVault
- Use SafeERC20 for all transfers
- totalBalance tracking must be accurate
- onlySavingBank modifier critical
- Validate all addresses (non-zero)

### SavingBank
- Snapshot plan data trong DepositCertificate
- Interest formula: `principal * aprBps * tenorSeconds / (SECONDS_PER_YEAR * BASIS_POINTS)`
- Penalty formula: `principal * penaltyBps / BASIS_POINTS`
- Grace period: DEFAULT_GRACE_PERIOD = 7 days
- NFT burn/mint lifecycle critical
- ReentrancyGuard on all external functions

### Testing
- Use fixtures cho reusable setup
- timeTravel: `ethers.provider.send("evm_increaseTime", [seconds])`
- Test events AND state changes
- Verify token flows completely
- Test với 6 decimals (USDC)

---

## ✅ Critical Test Scenarios

1. Interest Calculation
   - 7/30/90/180 day plans
   - Multiple APR rates
   - Various principal amounts
   - Edge case: 0 interest

2. Penalty Calculation
   - Different penalty rates
   - Various principal amounts
   - Verify feeReceiver gets penalty

3. Compound Interest
   - Renew 1, 2, 3 times
   - Verify growth

4. Grace Period
   - Withdraw trong grace period
   - Withdraw sau grace period
   - autoRenew = true/false

5. Vault Balance
   - Track after each operation
   - Insufficient liquidity case

6. Access Control
   - Owner functions
   - SavingBank functions
   - User functions

7. NFT Lifecycle
   - Mint on open
   - Burn on withdraw/early withdraw
   - Burn old + mint new on renew

8. Edge Cases
   - Amount = 1 USDC
   - Amount = 1M USDC
   - Tenor = 1 day
   - Tenor = 365 days
   - Rounding với 6 decimals

---

## 💡 Daily Tips

### Ngày 1-2: Implementation
- Code từ đơn giản đến phức tạp
- Test compile sau mỗi function
- Don't over-optimize sớm

### Ngày 3-4: Core Logic
- _calculateInterest phải chính xác
- Test edge cases ngay khi code
- Validate inputs carefully

### Ngày 5-6: Testing & Polish
- Một test case = một behavior
- Test names mô tả rõ ràng
- Coverage chỉ là metric, quan trọng là quality

---

## 🎯 Success Criteria

✅ All functional requirements met
✅ Test coverage >= 85%
✅ No critical security issues
✅ All tests pass
✅ Code clean và documented
✅ Slither clean
✅ Ready to deploy

---

Let's build! 🚀
