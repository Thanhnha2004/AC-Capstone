# KẾ HOẠCH 6 NGÀY - SAVING BANK CAPSTONE (CHI TIẾT)

## Tổng quan

Kế hoạch 6 ngày hoàn chỉnh từ zero đến finished, chia đều công việc implementation và testing với task cụ thể cho từng khung giờ.

---

## 📅 NGÀY 1: Setup Project & LiquidityVault Contract

### ☀️ Sáng (2-3 giờ)

**1. Setup Project (30 phút)**

- [✅] `npm init` Hardhat project
- [✅] Install dependencies:
  - `npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox`
  - `npm install @openzeppelin/contracts`
  - `npm install --save-dev @nomicfoundation/hardhat-network-helpers`
- [✅] Setup folder structure:
  ```
  contracts/
  test/
  scripts/
  ```
- [✅] Configure `hardhat.config.ts`:
  - Solidity version 0.8.20
  - TypeScript support
  - Gas reporter

**2. Mock USDC Token (30 phút)**

- [✅] Tạo `contracts/MockERC20.sol`
  - [✅] Import OpenZeppelin ERC20
  - [✅] Constructor với name, symbol, decimals
  - [✅] Function `mint(address, uint256)`
  - [✅] Set decimals = 18
- [✅] Compile để verify không lỗi

**3. LiquidityVault Contract - Part 1 (1 giờ)**

- [✅] Tạo `contracts/LiquidityVault.sol`
- [✅] Import các dependencies:
  - [✅] SafeERC20
  - [✅] IERC20
  - [✅] Ownable
  - [✅] Pausable
  - [✅] ReentrancyGuard
- [✅] Define custom errors:
  - [✅] `InvalidToken()`
  - [✅] `InvalidAmount()`
  - [✅] `InvalidAddress()`
  - [✅] `InsufficientBalance()`
  - [✅] `Unauthorized()`
- [✅] Define state variables:
  - [✅] `IERC20 public immutable token`
  - [✅] `address public savingBank`
  - [✅] `uint256 public totalBalance`
- [✅] Implement constructor:
  - [✅] Validate `_token != address(0)`
  - [✅] Set token address
  - [✅] Call Ownable(msg.sender)
- [✅] Implement `setSavingBank()`:
  - [✅] onlyOwner modifier
  - [✅] Validate address
  - [✅] Emit SavingBankUpdated event

### 🌙 Chiều (2-3 giờ)

**4. LiquidityVault Contract - Part 2 (2 giờ)**

**Admin Functions:**

- [✅] Implement `fundVault(uint256 amount)`:
  - [✅] onlyOwner modifier
  - [✅] Validate amount > 0
  - [✅] `totalBalance += amount`
  - [✅] `token.safeTransferFrom(msg.sender, address(this), amount)`
  - [✅] Emit Funded event
- [✅] Implement `withdrawVault(uint256 amount)`:

  - [✅] onlyOwner modifier
  - [✅] Validate amount > 0
  - [✅] Validate amount <= totalBalance
  - [✅] `totalBalance -= amount`
  - [✅] `token.safeTransfer(msg.sender, amount)`
  - [✅] Emit Withdrawn event

- [✅] Implement `pause()` và `unpause()`:
  - [✅] onlyOwner modifier
  - [✅] Call `_pause()` / `_unpause()`

**SavingBank Functions:**

- [✅] Define modifier `onlySavingBank`:

  - [✅] Check `msg.sender == savingBank`
  - [✅] Revert Unauthorized if not

- [✅] Implement `payInterest(address user, uint256 amount)`:

  - [✅] onlySavingBank modifier
  - [✅] whenNotPaused modifier
  - [✅] nonReentrant modifier
  - [✅] Validate user != address(0)
  - [✅] Validate amount > 0
  - [✅] Validate amount <= totalBalance
  - [✅] `totalBalance -= amount`
  - [✅] `token.safeTransfer(user, amount)`
  - [✅] Emit InterestPaid event

- [✅] Implement `deductInterest(address user, uint256 amount)`:
  - [✅] Same modifiers as payInterest
  - [✅] Same validations
  - [✅] `totalBalance -= amount` (NO transfer)
  - [✅] Emit InterestRenewed event

**View Functions:**

- [✅] Implement `getBalance()`: return totalBalance
- [✅] Implement `getActualBalance()`: return token.balanceOf(address(this))

**Events:**

- [✅] Define all events:
  - [✅] `Funded(address indexed funder, uint256 amount)`
  - [✅] `Withdrawn(address indexed recipient, uint256 amount)`
  - [✅] `SavingBankUpdated(address indexed oldBank, address indexed newBank)`
  - [✅] `InterestPaid(address indexed recipient, uint256 amount)`
  - [✅] `InterestRenewed(address indexed recipient, uint256 amount)`

**5. Compile & Deploy Script (30 phút)**

- [✅] `npx hardhat compile` - fix any errors
- [✅] Tạo `scripts/deploy.ts`:
  - [✅] Deploy MockERC20
  - [✅] Deploy LiquidityVault
  - [✅] Log addresses
- [✅] Test deploy trên local: `npx hardhat run scripts/deploy.ts`

**Deliverable Ngày 1:**

- ✅ LiquidityVault.sol hoàn chỉnh (180 lines)
- ✅ MockERC20.sol
- ✅ Compile success
- ✅ Deploy script works

---

## 📅 NGÀY 2: SavingBank Contract - Structs & Admin

### ☀️ Sáng (2-3 giờ)

**1. SavingBank Setup (1 giờ)**

- [✅] Tạo `contracts/SavingBank.sol`
- [✅] Import dependencies:
  - [✅] ERC721
  - [✅] SafeERC20
  - [✅] IERC20
  - [✅] Ownable
  - [✅] Pausable
  - [✅] ReentrancyGuard
- [✅] Define custom errors:
  - [✅] `InvalidToken()`
  - [✅] `InvalidVault()`
  - [✅] `NotEnabledPlan()`
  - [✅] `InvalidAmount()`
  - [✅] `InvalidAddress()`
  - [✅] `InvalidTenor()`
  - [✅] `InvalidAPR()`
  - [✅] `InvalidMinDeposit()`
  - [✅] `InvalidMaxDeposit()`
  - [✅] `NotExceed()`
  - [✅] `InvalidPlanId()`
  - [✅] `NotOwner()`
  - [✅] `NotActiveDeposit()`
  - [✅] `NotMaturedYet()`
  - [✅] `AlreadyMatured()`

**2. Define Structs (30 phút)**

- [✅] Define `struct SavingPlan`:

  ```solidity
  struct SavingPlan {
    uint256 tenorDays;
    uint256 aprBps;
    uint256 minDeposit;
    uint256 maxDeposit;
    uint256 earlyWithdrawPenaltyBps;
    bool enabled;
  }
  ```

- [✅] Define `struct DepositCertificate`:
  ```solidity
  struct DepositCertificate {
    address owner;
    uint256 planId;
    uint256 principal;
    uint256 startAt;
    uint256 maturityAt;
    DepositStatus status;
    uint256 renewedDepositId;
    uint256 snapshotAprBps;
    uint256 snapshotTenorDays;
    uint256 snapshotEarlyWithdrawPenaltyBps;
  }
  ```

**3. Constants & State Variables (30 phút)**

- [✅] Define enum:

  - [✅] `DepositStatus = {Active, Withdrawn, EarlyWithdrawn, Renewed}`

- [✅] Define constants:

  - [✅] `uint256 private constant SECONDS_PER_YEAR = 365 days`
  - [✅] `uint256 private constant BASIS_POINTS = 10000`

- [✅] Define state variables:
  - [✅] `IERC20 public immutable token`
  - [✅] `uint256 public nextPlanId`
  - [✅] `uint256 public nextDepositId`
  - [✅] `mapping(uint256 => SavingPlan) public savingPlans`
  - [✅] `mapping(uint256 => DepositCertificate) public depositCertificates`
  - [✅] `mapping(address => uint256[]) public userDepositIds`
  - [✅] `ILiquidityVault public vault`
  - [✅] `address public feeReceiver`

**4. Constructor (30 phút)**

- [✅] Define interface `ILiquidityVault`:

  ```solidity
  interface ILiquidityVault {
    function payInterest(address user, uint256 amount) external;
    function deductInterest(address user, uint256 amount) external;
    function getBalance() external view returns (uint256);
    function getActualBalance() external view returns (uint256);
  }
  ```

- [✅] Implement constructor:
  - [✅] Extend `ERC721("Saving Bank Certificate", "SBC")`
  - [✅] Extend `Ownable(msg.sender)`
  - [✅] Validate all addresses != address(0)
  - [✅] Set token, vault, feeReceiver
  - [✅] `planId = 1`
  - [✅] `depositId = 1`

### 🌙 Chiều (2-3 giờ)

**5. Plan Management Functions (1.5 giờ)**

- [✅] Implement `createPlan()`:

  - [✅] onlyOwner modifier
  - [✅] Validate tenorDays > 0
  - [✅] Validate aprBps > 0
  - [✅] Validate minDeposit > 0
  - [✅] Validate maxDeposit >= minDeposit (if maxDeposit > 0)
  - [✅] Validate earlyWithdrawPenaltyBps > 0 && <= BASIS_POINTS
  - [✅] Create new SavingPlan with enabled = true
  - [✅] Increment nextPlanId
  - [✅] Emit PlanCreated event

- [✅] Implement `updatePlanStatus(uint256 id, bool enabled)`:

  - [✅] onlyOwner modifier
  - [✅] Validate id > 0 && id < nextPlanId
  - [✅] Update savingPlans[id].enabled
  - [✅] Emit PlanUpdated event

- [✅] Implement `updatePlan()`:
  - [✅] onlyOwner modifier
  - [✅] Validate id
  - [✅] Validate all parameters (same as createPlan)
  - [✅] Update SavingPlan fields
  - [✅] Emit PlanUpdated event

**6. Admin Functions (30 phút)**

- [✅] Implement `setVault(address newVault)`:

  - [✅] onlyOwner modifier
  - [✅] Validate newVault != address(0)
  - [✅] Set vault = ILiquidityVault(newVault)
  - [✅] Emit VaultUpdated event

- [✅] Implement `setFeeReceiver(address newFeeReceiver)`:

  - [✅] onlyOwner modifier
  - [✅] Validate newFeeReceiver != address(0)
  - [✅] Set feeReceiver
  - [✅] Emit FeeReceiverUpdated event

- [✅] Implement `pause()` và `unpause()`:
  - [✅] onlyOwner modifier
  - [✅] Call `_pause()` / `_unpause()`

**7. View Functions & Events (30 phút)**

- [✅] Implement `getPlanInfo(uint256 id)`:

  - [✅] Return all SavingPlan fields

- [✅] Define all events:
  - [✅] `PlanCreated(...)`
  - [✅] `PlanUpdated(uint256 planId, bool status)`
  - [✅] `VaultUpdated(address indexed newVault)`
  - [✅] `FeeReceiverUpdated(address indexed newFeeReceiver)`

**8. Setup Test Fixtures (30 phút)**

- [✅] Tạo `test/fixtures.ts`:

  - [✅] `deployVaultFixture()` - deploy MockERC20 + Vault
  - [✅] `deployFullSystemFixture()` - deploy all + fund vault
  - [✅] `deployWithPlanFixture()` - deploy all + create plan
  - [✅] Helper: `timeTravel(days)`
  - [✅] Helper: `calculateInterest(principal, apr, tenor)`
  - [✅] Helper: `calculatePenalty(principal, penaltyBps)`

- [✅] `npx hardhat compile` - verify compile success

**Deliverable Ngày 2:**

- ✅ SavingBank.sol structs, admin functions (~200 lines)
- ✅ Compile success
- ✅ Test fixtures ready

---

## 📅 NGÀY 3: SavingBank - Core User Functions

### ☀️ Sáng (2-3 giờ)

**1. openDepositCertificate (1.5 giờ)**

- [✅] Implement `openDepositCertificate(uint256 id, uint256 amount)`:

  - [✅] whenNotPaused modifier
  - [✅] nonReentrant modifier
  - [✅] Get SavingPlan by id
  - [✅] Validate plan.enabled == true → revert NotEnabledPlan
  - [✅] Validate amount >= plan.minDeposit → revert InvalidAmount
  - [✅] Validate amount <= plan.maxDeposit (if maxDeposit > 0) → revert InvalidAmount
  - [✅] Get user = msg.sender
  - [✅] Get currentId = nextDepositId
  - [✅] Calculate maturity = block.timestamp + (plan.tenorDays \* 1 days)
  - [✅] Create DepositCertificate:
    ```solidity
    depositCertificates[currentId] = DepositCertificate({
      owner: user,
      planId: id,
      principal: amount,
      startAt: block.timestamp,
      maturityAt: maturity,
      status: DepositStatus.Active,
      renewedDepositId: 0,
      snapshotAprBps: plan.aprBps,
      snapshotTenorDays: plan.tenorDays,
      snapshotEarlyWithdrawPenaltyBps: plan.earlyWithdrawPenaltyBps
    });
    ```
  - [✅] `userDepositIds[user].push(currentId)`
  - [✅] `nextDepositId++`
  - [✅] `token.safeTransferFrom(user, address(this), amount)`
  - [✅] `_safeMint(user, currentId)` - mint NFT
  - [✅] Emit DepositCertificateOpened event

- [✅] Define event:
  ```solidity
  event DepositCertificateOpened(
    uint256 depositId,
    address indexed user,
    uint256 planId,
    uint256 amount,
    uint256 maturity
  );
  ```

**2. \_calculateInterest Helper (30 phút)**

- [✅] Implement `_calculateInterest(uint256 id) internal view returns (uint256)`:

  - [✅] Get DepositCertificate
  - [✅] Calculate tenorSeconds = snapshotTenorDays \* 1 days
  - [✅] Calculate interest:
    ```solidity
    uint256 interest = (principal * snapshotAprBps * tenorSeconds) /
                       (SECONDS_PER_YEAR * BASIS_POINTS);
    ```
  - [✅] Return interest

- [✅] Implement `getCalculateInterest(uint256 id) external view returns (uint256)`:
  - [✅] Call `_calculateInterest(id)`
  - [✅] Return result

### 🌙 Chiều (2-3 giờ)

**3. withdraw Function (1.5 giờ)**

- [✅] Implement `withdraw(uint256 id)`:

  - [✅] nonReentrant modifier
  - [✅] Get DepositCertificate storage
  - [✅] Get user = msg.sender
  - [✅] Validate user == deposit.owner → revert NotOwner
  - [✅] Validate deposit.status == true → revert NotActiveDeposit
  - [✅] Validate block.timestamp >= deposit.maturityAt → revert NotMaturedYet
  - [✅] Calculate interest = \_calculateInterest(id)
  - [✅] Set deposit.status = false
  - [✅] `token.safeTransfer(user, deposit.principal)`
  - [✅] `vault.payInterest(user, interest)`
  - [✅] `_burn(id)` - burn NFT
  - [✅] Emit Withdrawn event

- [✅] Define event:
  ```solidity
  event Withdrawn(
    uint256 depositId,
    address indexed user,
    uint256 principal,
    uint256 interest,
    bool status
  );
  ```

**4. earlyWithdraw Function (1 giờ)**

- [✅] Implement `earlyWithdraw(uint256 id)`:

  - [✅] nonReentrant modifier
  - [✅] Get DepositCertificate storage
  - [✅] Validate msg.sender == deposit.owner → revert NotOwner
  - [✅] Validate deposit.status == true → revert NotActiveDeposit
  - [✅] Validate block.timestamp < deposit.maturityAt → revert AlreadyMatured
  - [✅] Calculate penalty:
    ```solidity
    uint256 penalty = (principal * snapshotEarlyWithdrawPenaltyBps) / BASIS_POINTS;
    ```
  - [✅] Set deposit.status = false
  - [✅] `token.safeTransfer(msg.sender, principal - penalty)`
  - [✅] `token.safeTransfer(feeReceiver, penalty)`
  - [✅] `_burn(id)`
  - [✅] Emit EarlyWithdrawn event

- [✅] Define event:
  ```solidity
  event EarlyWithdrawn(
    uint256 depositId,
    address indexed user,
    uint256 principal,
    uint256 penalty,
    bool status
  );
  ```

**5. Basic Tests (30 phút)**

- [✅] Tạo `test/SavingBank.test.ts`:

  - [✅] Test deployment
  - [✅] Test createPlan
  - [✅] Test openDepositCertificate - happy path
  - [✅] Test withdraw - happy path
  - [✅] Test earlyWithdraw - happy path

- [✅] Run tests: `npx hardhat test`

**Deliverable Ngày 3:**

- ✅ openDepositCertificate implemented
- ✅ withdraw implemented
- ✅ earlyWithdraw implemented
- ✅ \_calculateInterest helper
- ✅ Basic tests pass (~10 tests)

---

## 📅 NGÀY 4: SavingBank - Renew & Complete Vault Testing

### ☀️ Sáng (2-3 giờ)

**1. renewWithSamePlan (1 giờ)**

- [✅] Implement `renewWithSamePlan(uint256 id)`:

  - [✅] nonReentrant modifier
  - [✅] Get DepositCertificate storage oldDeposit
  - [✅] Validate msg.sender == oldDeposit.owner → revert NotOwner
  - [✅] Validate block.timestamp >= oldDeposit.maturityAt → revert NotMaturedYet
  - [✅] Get SavingPlan by oldDeposit.planId
  - [✅] Validate plan.enabled → revert NotEnabledPlan
  - [✅] Calculate interest = \_calculateInterest(id)
  - [✅] Calculate newPrincipal = oldDeposit.principal + interest
  - [✅] Get newId = nextDepositId
  - [✅] Get user = msg.sender
  - [✅] Calculate maturity = block.timestamp + (plan.tenorDays \* 1 days)
  - [✅] Set oldDeposit.status = false
  - [✅] Set oldDeposit.renewedDepositId = newId
  - [✅] `userDepositIds[user].push(newId)`
  - [✅] `nextDepositId++`
  - [✅] Create new DepositCertificate with:
    - principal = newPrincipal
    - Snapshot current plan data (might have changed)
  - [✅] `vault.deductInterest(user, interest)` - account for interest
  - [✅] `_burn(id)` - burn old NFT
  - [✅] `_safeMint(user, newId)` - mint new NFT
  - [✅] Emit Renewed + DepositCertificateOpened events

- [✅] Define events:
  ```solidity
  event Renewed(uint256 depositId, uint256 newDepositId, uint256 newPrincipal);
  ```

**2. renewWithNewPlan (1 giờ)**

- [✅] Implement `renewWithNewPlan(uint256 id, uint256 newPlanId)`:
  - [✅] Similar logic to renewWithSamePlan
  - [✅] But use newPlanId instead of oldDeposit.planId
  - [✅] Validate new plan is enabled
  - [✅] Snapshot new plan data in new DepositCertificate

**3. View Functions (30 phút)**

- [✅] Implement `getUserDepositIds(address user) external view returns (uint256[])`:

  - [✅] Return userDepositIds[user]

- [✅] Implement `getDepositInfo(uint256 id)`:
  - [✅] Return deposit certificate fields

### 🌙 Chiều (2-3 giờ)

**4. Complete LiquidityVault Tests (2-3 giờ)**

- [✅] Tạo `test/LiquidityVault.test.ts`:

**Deployment Tests:**

- [✅] Should set the right token
- [✅] Should set the right owner
- [✅] Should initialize with zero totalBalance
- [✅] Should revert if token is zero address

**setSavingBank Tests:**

- [✅] Should set saving bank address
- [✅] Should emit SavingBankUpdated event
- [✅] Should revert if not owner
- [✅] Should revert if address is zero

**fundVault Tests:**

- [✅] Should fund vault successfully
- [✅] Should update totalBalance
- [✅] Should transfer tokens to vault
- [✅] Should emit Funded event
- [✅] Should revert if amount is zero
- [✅] Should revert if not owner
- [✅] Should revert if insufficient allowance

**withdrawVault Tests:**

- [✅] Should withdraw from vault successfully
- [✅] Should update totalBalance
- [✅] Should transfer tokens to owner
- [✅] Should emit Withdrawn event
- [✅] Should revert if amount is zero
- [✅] Should revert if amount exceeds balance
- [✅] Should revert if not owner

**payInterest Tests:**

- [✅] Should pay interest successfully
- [✅] Should deduct totalBalance
- [✅] Should transfer tokens to user
- [✅] Should emit InterestPaid event
- [✅] Should revert if not savingBank
- [✅] Should revert if paused
- [✅] Should revert if user is zero address
- [✅] Should revert if amount is zero
- [✅] Should revert if insufficient balance

**deductInterest Tests:**

- [✅] Should deduct interest successfully
- [✅] Should deduct totalBalance
- [✅] Should NOT transfer tokens
- [✅] Should emit InterestRenewed event
- [✅] Should revert if not savingBank
- [✅] Should revert if paused
- [✅] Should revert if insufficient balance

**pause/unpause Tests:**

- [✅] Should pause the contract
- [✅] Should unpause the contract
- [✅] Should revert payInterest when paused
- [✅] Should revert deductInterest when paused
- [✅] Should revert if not owner

**View Functions Tests:**

- [✅] getBalance should return totalBalance
- [✅] getActualBalance should return actual token balance

- [✅] Run tests: `npx hardhat test test/LiquidityVault.test.ts`

**Deliverable Ngày 4:**

- ✅ renewWithSamePlan implemented
- ✅ renewWithNewPlan implemented
- ✅ All view functions complete

---

## 📅 NGÀY 5: Complete SavingBank Testing

### ☀️ Sáng (2-3 giờ)

**1. Test Plan Management (1 giờ)**

**createPlan Tests:**

- [✅] Should create plan successfully
- [✅] Should increment nextPlanId
- [✅] Should set enabled = true
- [✅] Should emit PlanCreated event
- [✅] Should revert if tenorDays is zero
- [✅] Should revert if aprBps is zero
- [✅] Should revert if minDeposit is zero
- [✅] Should revert if maxDeposit < minDeposit
- [✅] Should revert if earlyWithdrawPenaltyBps is zero
- [✅] Should revert if earlyWithdrawPenaltyBps > 10000
- [✅] Should revert if not owner

**updatePlanStatus Tests:**

- [✅] Should update plan status
- [✅] Should emit PlanUpdated event
- [✅] Should revert if invalid planId
- [✅] Should revert if not owner

**updatePlan Tests:**

- [✅] Should update all plan fields
- [✅] Should emit PlanUpdated event
- [✅] Should revert with invalid parameters
- [✅] Should revert if not owner

**Admin Functions Tests:**

- [✅] setVault should work
- [✅] setFeeReceiver should work
- [✅] pause/unpause should work

**2. Test openDepositCertificate (1 giờ)**

**Happy Path Tests:**

- [✅] Should open deposit successfully
- [✅] Should transfer tokens from user to contract
- [✅] Should mint NFT to user
- [✅] Should increment nextDepositId
- [✅] Should add to userDepositIds
- [✅] Should emit DepositCertificateOpened event
- [✅] Should save correct deposit data
- [✅] Should calculate correct maturity
- [✅] Should snapshot plan data correctly

**Validation Tests:**

- [✅] Should revert if plan disabled
- [✅] Should revert if amount < minDeposit
- [✅] Should revert if amount > maxDeposit
- [✅] Should revert if contract paused
- [✅] Should revert if insufficient balance
- [✅] Should revert if insufficient allowance

**Multiple Deposits Tests:**

- [✅] Should allow multiple deposits from same user
- [✅] Should allow deposits from different users
- [✅] Each deposit should have unique NFT

### 🌙 Chiều (2-3 giờ)

**3. Test withdraw (1.5 giờ)**

**Happy Path Tests:**

- [✅] Should withdraw successfully at maturity
- [✅] Should transfer principal to user
- [✅] Should call vault.payInterest with correct amount
- [✅] Should burn NFT
- [✅] Should set status to false
- [✅] Should emit Withdrawn event

**Interest Calculation Tests:**

- [✅] Should calculate correct interest for 7-day plan
- [✅] Should calculate correct interest for 30-day plan
- [✅] Should calculate correct interest for 90-day plan
- [✅] Should calculate correct interest with different APRs
- [✅] Should calculate correct interest with different principals

**Error Tests:**

- [✅] Should revert if not matured yet
- [✅] Should revert if not owner
- [✅] Should revert if deposit inactive
- [✅] Should revert if reentrancy attack

**Integration Tests:**

- [✅] Should decrease vault balance correctly
- [✅] Should work when vault has exact amount
- [✅] Should revert if vault insufficient balance

**4. Test earlyWithdraw (1 giờ)**

**Happy Path Tests:**

- [✅] Should early withdraw successfully
- [✅] Should calculate correct penalty
- [✅] Should transfer (principal - penalty) to user
- [✅] Should transfer penalty to feeReceiver
- [✅] Should burn NFT
- [✅] Should set status to false
- [✅] Should emit EarlyWithdrawn event

**Penalty Calculation Tests:**

- [✅] Should calculate correct penalty with 5% rate
- [✅] Should calculate correct penalty with 10% rate
- [✅] Should calculate correct penalty with different principals

**Error Tests:**

- [✅] Should revert if already matured
- [✅] Should revert if not owner
- [✅] Should revert if deposit inactive
- [✅] Should revert if contract paused

**Deliverable Ngày 5:**

- ✅ Plan Management tests complete
- ✅ openDepositCertificate tests complete
- ✅ withdraw tests complete
- ✅ earlyWithdraw tests complete

---

## 📅 NGÀY 6: Integration, Edge Cases & Final Polish

### ☀️ Sáng (2 giờ)

**1. Complete Renew Tests (1 giờ)**

**renewWithSamePlan Tests:**

- [✅] Should renew successfully
- [✅] Should calculate correct interest
- [✅] Should create new deposit with principal + interest
- [✅] Should call vault.deductInterest
- [✅] Should burn old NFT
- [✅] Should mint new NFT
- [✅] Should set old deposit status = false
- [✅] Should set renew field to newDepositId
- [✅] Should emit Renewed + DepositCertificateOpened events
- [✅] Should snapshot current plan data (might have changed)

**Compound Interest Tests:**

- [✅] Should compound interest after 1 renew
- [✅] Should compound interest after 2 renews
- [✅] Should compound interest after 3 renews

**renewWithNewPlan Tests:**

- [✅] Should renew to different plan successfully
- [✅] Should snapshot new plan data
- [✅] 7-day → 30-day plan should work
- [✅] 180-day → 7-day plan should work
- [✅] Low APR → High APR should work

**Error Tests:**

- [✅] Should revert if not matured
- [✅] Should revert if not owner
- [✅] Should revert if plan disabled
- [✅] Should revert if deposit inactive

**View Functions Tests:**

- [✅] getCalculateInterest should return correct amount
- [✅] getUserDepositIds should return all user deposits
- [✅] getDepositInfo should return correct data

**2. Integration Tests (1 giờ)**

- [✅] Tạo `test/Integration.test.ts`:

**Flow 1: Open → Withdraw**

- [✅] User opens deposit
- [✅] Time travel to maturity
- [✅] User withdraws successfully
- [✅] Verify token flow
- [✅] Verify vault balance changes
- [✅] Verify NFT lifecycle

**Flow 2: Open → Early Withdraw**

- [✅] User opens deposit
- [✅] User early withdraws
- [✅] Verify penalty distribution

**Flow 3: Open → Renew → Withdraw**

- [✅] User opens deposit
- [✅] Time travel to maturity
- [✅] User renews
- [✅] Time travel to new maturity
- [✅] User withdraws
- [✅] Verify compound interest

**Flow 4: Open → Renew New Plan → Withdraw**

- [✅] User opens with plan 1
- [✅] Renew to plan 2
- [✅] Withdraw
- [✅] Verify different interest rates

**Flow 5: Multiple Users Scenario**

- [✅] 3 users open deposits
- [✅] Some withdraw early
- [✅] Some withdraw at maturity
- [✅] Some renew
- [✅] Verify isolation between users
- [✅] Verify vault balance tracking

### 🌙 Chiều (2-3 giờ)

**3. Edge Cases Tests (1 giờ)**

- [✅] Tạo `test/EdgeCases.test.ts`:

**Amount Edge Cases:**

- [✅] Deposit 1 wei
- [✅] Deposit very large amount (1M tokens)
- [✅] Withdraw with 0 interest (very short tenor)

**Time Edge Cases:**

- [✅] Withdraw exactly at maturity timestamp
- [✅] Withdraw 1 second before maturity (should fail)
- [✅] Withdraw 1 second after maturity (should work)

**Vault Liquidity Edge Cases:**

- [✅] Vault insufficient for interest payment
- [✅] Multiple users withdraw, vault depleted
- [✅] Vault empty scenario

**Plan Update Edge Cases:**

- [✅] Update plan after deposits opened (shouldn't affect old deposits)
- [✅] Disable plan after deposits opened (old deposits should work)
- [✅] Renew uses updated plan data

**Rounding Edge Cases (18 decimals):**

- [✅] Very small principal + short tenor = minimal interest
- [✅] Verify no precision loss

**4. Security Tests (30 phút)**

- [✅] Tạo `test/Security.test.ts`:

**Reentrancy Tests:**

- [✅] Verify ReentrancyGuard on withdraw
- [✅] Verify ReentrancyGuard on earlyWithdraw
- [✅] Verify ReentrancyGuard on renew
- [✅] Attempt reentrancy attack (should fail)

**Access Control Tests:**

- [✅] Non-owner cannot call admin functions
- [✅] Non-owner cannot withdraw others' deposits
- [✅] Non-savingBank cannot call vault functions

**Pause Tests:**

- [✅] Pause should block user operations
- [✅] Unpause should resume operations
- [✅] Admin can still pause/unpause when paused

**5. Final Review & Cleanup (1-1.5 giờ)**

**Run Full Test Suite:**

- [✅] `npx hardhat test`
- [✅] All tests should pass
- [✅] No warnings or errors

**Run Slither:**

- [✅] `slither .`
- [✅] Review all warnings
- [✅] Fix critical/high issues
- [✅] Document medium/low issues

**Code Cleanup:**

- [✅] Remove all `console.log` statements
- [✅] Remove commented-out code
- [✅] Clean up unused imports
- [✅] Verify all NatSpec comments complete
- [✅] Check event emissions

**Gas Optimization (if time permits):**

- [✅] `REPORT_GAS=true npx hardhat test`
- [✅] Review gas costs
- [✅] Optimize storage packing
- [✅] Minimize storage reads

**Final Checklist:**

- [ ] ✅ All tests pass (100%)
- [ ] ✅ LiquidityVault >= 90%
- [ ] ✅ SavingBank >= 85%
- [ ] ✅ No Slither critical issues
- [ ] ✅ No console.log in code
- [ ] ✅ All NatSpec complete
- [ ] ✅ Code clean and documented

**Deliverable Ngày 6:**

- ✅ Integration tests pass
- ✅ Edge cases handled
- ✅ Security verified
- ✅ Slither clean
- ✅ Code production-ready

---

## 📊 Timeline Summary

| Ngày | Morning                                  | Afternoon                        | Deliverable                 |
| ---- | ---------------------------------------- | -------------------------------- | --------------------------- |
| 1    | Setup + MockERC20 + Vault Part 1         | Vault Part 2 + Deploy            | Vault complete              |
| 2    | SavingBank structs + Constructor + Plans | Admin functions + Fixtures       | Admin done                  |
| 3    | openDeposit + calculateInterest          | withdraw + earlyWithdraw + Tests | Core user functions         |
| 4    | Renew functions + View functions         | Complete Vault Testing           | All functions + Vault tests |
| 5    | Plan + Deposit tests                     | Withdraw + EarlyWithdraw tests   | Core functions tested       |
| 6    | Renew tests + Integration                | Edge cases + Security + Review   | Complete & ready            |

---

## 🔧 Essential Commands

```bash
# Compile
npx hardhat compile

# Run all tests
npx hardhat test

# Run specific test file
npx hardhat test test/LiquidityVault.test.ts

# Run with gas report
REPORT_GAS=true npx hardhat test

# Slither
slither .

# Clean
npx hardhat clean
```

---

## 🎯 Success Criteria

✅ All functional requirements implemented
✅ LiquidityVault >= 90%
✅ SavingBank >= 85%
✅ ~175 tests passing
✅ No critical security issues
✅ Slither clean
✅ Code clean và documented
✅ Ready to deploy

---

**Let's build! 🚀**
