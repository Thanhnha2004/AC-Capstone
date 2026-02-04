# Upgrade Guide - SavingBank UUPS Proxy

## 📋 Overview

This guide covers upgrading SavingBank upgradeable contracts using the UUPS (Universal Upgradeable Proxy Standard) pattern.

---

## 🏗️ Architecture

```
User/DApp
    ↓
ERC1967Proxy (unchanging address)
    ↓ delegatecall
Implementation Contract (upgradeable)
```

**Key Points:**
- Proxy address NEVER changes
- State stored at proxy
- Only implementation code changes
- Users/DApps always interact with proxy address

---

## ⚡ Quick Upgrade Steps

### 1. Prepare New Implementation

```solidity
// contracts/SavingBankUpgradeable.sol
contract SavingBankUpgradeable is Initializable, UUPSUpgradeable {
    // Add new variables at END only
    uint256 public newFeature;
    
    // Update storage gap
    uint256[49] private __gap; // Was 50, now 49
}
```

### 2. Run Upgrade Script

```bash
# Set proxy address in .env
PROXY_ADDRESS=0x1234... npx hardhat run scripts/upgrade/upgrade_savingbank.ts --network sepolia
```

### 3. Verify

```bash
# Check new implementation
npx hardhat verify --network sepolia <NEW_IMPL_ADDRESS>
```

---

## 📝 Upgrade Script Template

```typescript
// scripts/upgrade/upgrade_savingbank.ts
import { ethers, upgrades } from "hardhat";

async function main() {
  const PROXY_ADDRESS = process.env.PROXY_ADDRESS!;
  
  // Load new implementation
  const SavingBank = await ethers.getContractFactory("SavingBankUpgradeable");
  
  // Validate upgrade (checks storage layout)
  await upgrades.validateUpgrade(PROXY_ADDRESS, SavingBank, { kind: "uups" });
  
  // Perform upgrade
  const upgraded = await upgrades.upgradeProxy(PROXY_ADDRESS, SavingBank);
  await upgraded.waitForDeployment();
  
  console.log("✅ Upgraded to:", await upgrades.erc1967.getImplementationAddress(PROXY_ADDRESS));
}

main();
```

---

## ⚠️ CRITICAL RULES

### ❌ DON'T
- Delete existing variables
- Change variable order
- Change variable types
- Add variables before existing ones
- Remove inheritance

### ✅ DO
- Add new variables at END
- Reduce storage gap accordingly
- Test on testnet first
- Validate storage layout
- Keep proxy address unchanged

---

## 🧪 Testing Upgrades

```typescript
// test/upgrade/Example.upgrade.test.ts
it("Should preserve state after upgrade", async () => {
  // 1. Deploy initial version
  const proxy = await upgrades.deployProxy(Contract, [args]);
  
  // 2. Set some state
  await proxy.setValue(100);
  const valueBefore = await proxy.getValue();
  
  // 3. Upgrade
  const ContractV2 = await ethers.getContractFactory("ContractV2");
  const upgraded = await upgrades.upgradeProxy(proxy, ContractV2);
  
  // 4. Verify state preserved
  expect(await upgraded.getValue()).to.equal(valueBefore);
});
```

---

## 📦 Contracts Upgrade Order

**Recommended sequence:**

1. **Vaults First**
   ```bash
   # PrincipalVault & InterestVault (independent)
   npx hardhat run scripts/upgrade/upgrade_vaults.ts
   ```

2. **SavingBank Second**
   ```bash
   # Depends on vaults
   npx hardhat run scripts/upgrade/upgrade_savingbank.ts
   ```

3. **NFT Metadata Last**
   ```bash
   # Independent, optional
   npx hardhat run scripts/upgrade/upgrade_nft_metadata.ts
   ```

---

## 🔍 Verification Commands

```bash
# Get current implementation
npx hardhat run scripts/verify/get-implementation.ts

# Validate upgrade before executing
npx hardhat run scripts/verify/validate-upgrade.ts

# Check storage layout
npx hardhat check
```

---

## 🚨 Emergency Procedures

### If Upgrade Fails:

1. **DO NOT PANIC** - Proxy still has old implementation
2. Check error message
3. Fix storage layout issues
4. Test on testnet again
5. Re-run upgrade

### Rollback Not Possible:

- UUPS upgrades are one-way
- Old implementation code is replaced
- Test thoroughly before upgrading

---

## 📊 Storage Layout Example

```solidity
// V1
contract SavingBankV1 {
    IERC20 public token;              // slot 0
    address public principalVault;    // slot 1
    uint256 public nextPlanId;        // slot 2
    uint256[50] private __gap;        // slots 3-52
}

// V2 - Adding new variable
contract SavingBankV2 {
    IERC20 public token;              // slot 0 (same)
    address public principalVault;    // slot 1 (same)
    uint256 public nextPlanId;        // slot 2 (same)
    uint256 public newFeature;        // slot 3 (NEW - uses gap)
    uint256[49] private __gap;        // slots 4-52 (reduced by 1)
}
```

---

## 🔗 Useful Links

- OpenZeppelin Upgrades Plugin: https://docs.openzeppelin.com/upgrades-plugins
- UUPS Pattern: https://eips.ethereum.org/EIPS/eip-1822
- Storage Layouts: https://docs.soliditylang.org/en/latest/internals/layout_in_storage.html

---

## 📞 Quick Reference

| Command | Purpose |
|---------|---------|
| `upgrades.deployProxy()` | Deploy new upgradeable contract |
| `upgrades.upgradeProxy()` | Upgrade existing proxy |
| `upgrades.validateUpgrade()` | Check storage compatibility |
| `upgrades.erc1967.getImplementationAddress()` | Get current implementation |

---

**Last Updated:** 2026-02-03
**Version:** 1.0