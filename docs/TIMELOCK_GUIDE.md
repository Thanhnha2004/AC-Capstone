# Timelock Governance Guide

## 📋 Overview

Timelock adds a **2-day delay** to all critical admin operations, allowing time for community review and emergency cancellation.

---

## 🎯 Why Timelock?

- **Security**: Prevents instant malicious changes
- **Transparency**: Community can review proposals
- **Emergency Stop**: Can cancel dangerous operations
- **Trust**: Users have time to exit if they disagree

---

## 🏗️ Architecture

```
Admin proposes change
    ↓
Wait 2 days (MIN_DELAY)
    ↓
Anyone can execute (or cancel if dangerous)
    ↓
Change applied
```

---

## 👥 Roles

| Role | Can Do | Who |
|------|--------|-----|
| **PROPOSER** | Schedule operations | Admin, Operator |
| **EXECUTOR** | Execute after delay | Anyone (ZeroAddress) |
| **CANCELLER** | Cancel operations | Admin |
| **ADMIN** | Manage roles | Admin |

---

## ⚡ Quick Usage

### 1. Propose a Change

```bash
# Edit scripts/timelock/propose.ts with your operation
nano scripts/timelock/propose.ts

# Run proposal
npx hardhat run scripts/timelock/propose.ts --network sepolia
```

**Example: Update Plan APR**

```typescript
// scripts/timelock/propose.ts
const TIMELOCK_ADDRESS = "0x...";
const SAVING_BANK_ADDRESS = "0x...";

const savingBank = await ethers.getContractAt("SavingBankUpgradeable", SAVING_BANK_ADDRESS);

// Encode the function call
const calldata = savingBank.interface.encodeFunctionData("updatePlan", [
  1,                            // planId
  180,                          // tenorDays (6 months)
  1200,                         // aprBps (12%)
  ethers.parseEther("100"),     // minDeposit
  ethers.parseEther("100000"),  // maxDeposit
  500                           // earlyWithdrawPenaltyBps (5%)
]);

// Schedule operation
const timelock = await ethers.getContractAt("SavingBankTimelock", TIMELOCK_ADDRESS);
const salt = ethers.id("Update Plan 1 to 12% APR");

await timelock.schedule(
  SAVING_BANK_ADDRESS,  // target
  0,                     // value
  calldata,              // data
  ethers.ZeroHash,       // predecessor
  salt,                  // salt
  await timelock.getMinDelay()  // delay (2 days)
);
```

**Output:**
```
✅ Operation scheduled!
Operation Hash: 0xabc123...
Execution Time: 2026-02-05 14:30:00
```

---

### 2. Wait 2 Days

Monitor the operation:

```bash
# Check status
npx hardhat run scripts/timelock/status.ts --network sepolia
```

**Statuses:**
- **Pending**: Waiting for delay to pass
- **Ready**: Can be executed now
- **Done**: Already executed

---

### 3. Execute (After 2 Days)

```bash
# Edit scripts/timelock/execute.ts with operation data
nano scripts/timelock/execute.ts

# Execute
npx hardhat run scripts/timelock/execute.ts --network sepolia
```

**Example:**

```typescript
// scripts/timelock/execute.ts
const OPERATION_DATA = {
  target: "0x...",              // SavingBank address
  value: 0,
  calldata: "0x...",            // From propose output
  predecessor: ethers.ZeroHash,
  salt: "0x...",                // From propose output
  operationHash: "0x..."        // From propose output
};

const timelock = await ethers.getContractAt("SavingBankTimelock", TIMELOCK_ADDRESS);

await timelock.execute(
  OPERATION_DATA.target,
  OPERATION_DATA.value,
  OPERATION_DATA.calldata,
  OPERATION_DATA.predecessor,
  OPERATION_DATA.salt
);
```

---

### 4. Cancel (Emergency Only)

```bash
# Edit scripts/timelock/cancel.ts
nano scripts/timelock/cancel.ts

# Cancel operation
npx hardhat run scripts/timelock/cancel.ts --network sepolia
```

**Example:**

```typescript
// scripts/timelock/cancel.ts
const OPERATION_HASH = "0xabc123...";  // From propose output
const CANCEL_REASON = "Security vulnerability detected";

const timelock = await ethers.getContractAt("SavingBankTimelock", TIMELOCK_ADDRESS);

await timelock.cancel(OPERATION_HASH);
console.log("❌ Operation cancelled:", CANCEL_REASON);
```

---

## 📝 Common Operations

### Update Plan Parameters

```typescript
const calldata = savingBank.interface.encodeFunctionData("updatePlan", [
  planId, tenorDays, aprBps, minDeposit, maxDeposit, penaltyBps
]);
```

### Set Fee Receiver

```typescript
const calldata = savingBank.interface.encodeFunctionData("setFeeReceiver", [
  newFeeReceiverAddress
]);
```

### Pause Contract

```typescript
const calldata = savingBank.interface.encodeFunctionData("pause", []);
```

### Upgrade Contract

```typescript
// This goes through Timelock too!
const calldata = savingBank.interface.encodeFunctionData("upgradeTo", [
  newImplementationAddress
]);
```

---

## 🔍 Monitoring Operations

### Check Operation Status

```bash
# scripts/timelock/status.ts
const isReady = await timelock.isOperationReady(operationHash);
const isPending = await timelock.isOperationPending(operationHash);
const isDone = await timelock.isOperationDone(operationHash);

if (isPending) {
  const timestamp = await timelock.getTimestamp(operationHash);
  console.log("Executable at:", new Date(timestamp * 1000));
}
```

### Listen to Events

```typescript
// scripts/timelock/event-listener.ts
timelock.on("CallScheduled", (id, index, target, value, data, predecessor, delay) => {
  console.log("📅 New operation scheduled:", id);
  console.log("   Executable after:", new Date((Date.now() + delay * 1000)));
});

timelock.on("CallExecuted", (id, index, target, value, data) => {
  console.log("✅ Operation executed:", id);
});

timelock.on("Cancelled", (id) => {
  console.log("❌ Operation cancelled:", id);
});
```

---

## ⚠️ Best Practices

### ✅ DO

1. **Test on testnet first**
2. **Announce proposals publicly** (Twitter, Discord, etc.)
3. **Wait full 2 days** - don't rush
4. **Document the reason** for each proposal
5. **Save operation data** from propose step

### ❌ DON'T

1. **Don't lose operation hash** - you can't execute without it
2. **Don't execute before delay** - will revert
3. **Don't forget salt** - must match propose step
4. **Don't use same salt twice** - operations will conflict

---

## 🚨 Emergency Procedures

### Dangerous Proposal Detected

```bash
# 1. Verify it's dangerous
# 2. Cancel immediately (as CANCELLER)
npx hardhat run scripts/timelock/cancel.ts --network sepolia

# 3. Announce cancellation
# 4. Investigate how it was proposed
# 5. Review PROPOSER role grants
```

### Wrong Parameters Proposed

```bash
# 1. Cancel the operation
# 2. Propose new operation with correct parameters
# 3. Wait 2 days again
```

---

## 📊 Workflow Example

**Goal:** Increase Plan 1 APR from 10% to 12%

**Day 0 (Monday 10:00 AM):**
```bash
# Propose change
npx hardhat run scripts/timelock/propose.ts
# Output: Operation Hash: 0xabc123...
# Executable: Wednesday 10:00 AM
```

**Day 0-2 (Monday-Wednesday):**
- Post announcement on social media
- Community reviews proposal
- Monitor for objections
- Operation status: PENDING

**Day 2 (Wednesday 10:00 AM):**
```bash
# Check status
npx hardhat run scripts/timelock/status.ts
# Status: READY ✅

# Execute
npx hardhat run scripts/timelock/execute.ts
# ✅ APR updated to 12%
```

---

## 🔗 Contract Addresses

| Network | Timelock Address |
|---------|------------------|
| Sepolia | `0x...` |
| Mainnet | `0x...` |

---

## 📞 Quick Reference

| Command | Purpose |
|---------|---------|
| `schedule()` | Propose operation (2-day delay starts) |
| `execute()` | Execute operation (after delay) |
| `cancel()` | Cancel pending operation |
| `isOperationReady()` | Check if executable |
| `getTimestamp()` | Get execution time |

**Delay:** 2 days (172,800 seconds)

---

## 🛠️ Troubleshooting

### "TimelockController: operation is not ready"
→ Wait for 2-day delay to pass

### "TimelockController: operation already executed"
→ Can't execute twice, operation is done

### "TimelockController: missing role"
→ Check if signer has PROPOSER/CANCELLER role

### "TimelockController: operation not found"
→ Check operation hash, may be wrong salt

---

**Last Updated:** 2026-02-03
**Version:** 1.0
**MIN_DELAY:** 2 days (172,800 seconds)