# Phase 2 Roadmap - Security & Infrastructure Upgrades (Simplified)

## 📋 Overview

Phase 2 tập trung vào **Upgradeable Pattern** và **Timelock Governance** - 2 tính năng cốt lõi cho bảo mật và linh hoạt.

**Timeline**: 2-3 tuần
**Priority**: High
**Dependencies**: Phase 1 completed ✅

---

## 🎯 Main Objectives

1. ✅ Upgradeable contracts (có thể nâng cấp)
2. ✅ Timelock governance (delay cho admin actions)
3. ✅ Basic tests & documentation

---

## 📦 Tasks

### 1. Upgradeable Contracts (Tuần 1)

#### 1.1 Convert SavingBank ✅

- [✅] `SavingBankUpgradeable.sol`
- [✅] Deploy script: `06_savingbank_upgradeable_deploy.ts`
- [✅] Upgrade script: `scripts/upgrade/upgrade_savingbank.ts`
- [✅] **TODO**: Test file: `test/upgrade/SavingBank.upgrade.test.ts`

#### 1.2 Convert Vaults ✅

- [✅] `PrincipalVaultUpgradeable.sol`
- [✅] `InterestVaultUpgradeable.sol`
- [✅] Deploy script: `07_vaults_upgradeable_deploy.ts`
- [✅] **TODO**: Test file: `test/upgrade/VaultsUpgrade.test.ts`

#### 1.3 NFT with Separate Metadata ✅

- [✅] `SavingBankNFT.sol` (non-upgradeable core)
- [✅] `NFTMetadataUpgradeable.sol` (upgradeable metadata)
- [✅] **TODO**: Deploy script: `08_nft_separate_metadata_deploy.ts`
- [✅] **TODO**: Test file: `test/upgrade/NFTMetadata.upgrade.test.ts`

---

### 2. Timelock Governance (Tuần 2)

#### 2.1 Timelock Contract ✅

- [✅] `SavingBankTimelock.sol`
- [✅] Deploy script: `09_timelock_deploy.ts`
- [✅] Test file: `test/governance/Timelock.test.ts` ✅ **HOÀN CHỈNH**

#### 2.2 Governance Scripts ✅

- [✅] `scripts/timelock/propose.ts`
- [✅] `scripts/timelock/execute.ts`
- [✅] `scripts/timelock/cancel.ts`
- [✅] **TODO**: `scripts/timelock/event-listener.ts`

#### 2.3 Integration (Optional - có thể bỏ qua)

- [ ] Connect Timelock với contracts
- [ ] Transfer admin roles
- [ ] Document governance flow

---

### 3. Testing & Documentation (Tuần 3)

#### 3.1 Must-Have Tests

- [ ] **TODO**: `test/upgrade/SavingBank.upgrade.test.ts`
  - Test state preservation
  - Test old functions work
- [ ] **TODO**: `test/upgrade/VaultsUpgrade.test.ts`

  - Test state preservation

- [ ] **TODO**: `test/upgrade/NFTMetadata.upgrade.test.ts`
  - Test metadata preservation

#### 3.2 Basic Documentation

- [ ] **TODO**: `docs/UPGRADE_GUIDE.md` - Hướng dẫn upgrade
- [ ] **TODO**: `docs/TIMELOCK_GUIDE.md` - Hướng dẫn dùng Timelock
- [ ] **TODO**: Update README.md

---

## ✅ Simplified File Structure

```
contracts/
├── SavingBankUpgradeable.sol           ✅
├── PrincipalVaultUpgradeable.sol       ✅
├── InterestVaultUpgradeable.sol        ✅
├── SavingBankNFT.sol                   ✅
├── NFTMetadataUpgradeable.sol          ✅
└── SavingBankTimelock.sol              ✅

deploy/
├── 06_savingbank_upgradeable_deploy.ts ✅
├── 07_vaults_upgradeable_deploy.ts     ✅
├── 08_nft_separate_metadata_deploy.ts  ❌ TODO
└── 08_timelock_deploy.ts               ✅

scripts/
├── upgrade/
│   └── upgrade_savingbank.ts           ✅
└── timelock/
    ├── propose.ts                      ✅
    ├── execute.ts                      ✅
    ├── cancel.ts                       ✅
    └── event-listener.ts               ❌ TODO

test/
├── upgrade/
│   ├── SavingBank.upgrade.test.ts      ❌ TODO
│   ├── VaultsUpgrade.test.ts           ❌ TODO
│   └── NFTMetadata.upgrade.test.ts     ❌ TODO
└── governance/
    └── Timelock.test.ts                ✅

docs/
├── UPGRADE_GUIDE.md                    ❌ TODO
└── TIMELOCK_GUIDE.md                   ❌ TODO
```

---

## 📊 Progress Tracker

| Category             | Status | Done      | Total  | %       |
| -------------------- | ------ | --------- | ------ | ------- |
| **Contracts**        | ✅     | 5/5       | 5      | 100%    |
| **Deploy Scripts**   | ⚠️     | 3/4       | 4      | 75%     |
| **Upgrade Scripts**  | ✅     | 1/1       | 1      | 100%    |
| **Timelock Scripts** | ⚠️     | 3/4       | 4      | 75%     |
| **Tests**            | ⚠️     | 1/4       | 4      | 25%     |
| **Docs**             | ❌     | 0/2       | 2      | 0%      |
| **OVERALL**          | ⚠️     | **13/21** | **21** | **62%** |

---

## 🎯 TODO Priority List

### 🔴 High Priority (Làm ngay)

1. [ ] Fix NFT deploy script (`08_nft_separate_metadata_deploy.ts`)
2. [ ] Create upgrade tests (`SavingBank.upgrade.test.ts`)
3. [ ] Create upgrade tests (`VaultsUpgrade.test.ts`)

### 🟡 Medium Priority (Tuần tới)

4. [ ] Create NFT metadata test (`NFTMetadata.upgrade.test.ts`)
5. [ ] Create event listener script
6. [ ] Write `UPGRADE_GUIDE.md`

### 🟢 Low Priority (Có thể bỏ qua)

7. [ ] Write `TIMELOCK_GUIDE.md`
8. [ ] Integration tests
9. [ ] Transfer admin roles

---

## 🚀 Quick Start Checklist

### Để hoàn thành Phase 2:

**Week 1:**

- [ ] Create 3 upgrade test files
- [ ] Fix NFT deployment script
- [ ] Test deploy on localhost

**Week 2:**

- [ ] Create event listener
- [ ] Write basic docs
- [ ] Deploy to Sepolia testnet

**Week 3 (Optional):**

- [ ] Security review
- [ ] Gas optimization
- [ ] Final documentation

---

## ⚠️ Known Issues to Fix

### 1. NFT Deploy Script Mismatch

**Problem**:

- Current script deploys `SavingBankNFTUpgradeable`
- But actual contracts are `SavingBankNFT` + `NFTMetadataUpgradeable`

**Fix**: Create new deploy script

```typescript
// deploy/08_nft_separate_metadata_deploy.ts
// 1. Deploy NFTMetadataUpgradeable (proxy)
// 2. Deploy SavingBankNFT (non-upgradeable)
// 3. Update metadata contract with NFT address
```

### 2. Event Listener Empty

**Problem**: File `scripts/timelock/event-listener.ts` exists but empty

**Fix**: Implement basic listener

```typescript
// Listen for:
// - CallScheduled
// - CallExecuted
// - Cancelled
```

### 3. Missing Test Files

**Problem**: 3 upgrade test files missing

**Fix**: Copy template from `Timelock.test.ts` and adapt

---

## 📝 Simplified Success Criteria

Phase 2 hoàn thành khi:

1. ✅ Tất cả contracts upgradeable hoạt động
2. ✅ Timelock hoạt động với propose/execute/cancel
3. ⚠️ Có ít nhất 3 upgrade test files (coverage ≥75%)
4. ⚠️ Có basic documentation (UPGRADE_GUIDE.md)
5. ⚠️ Deploy thành công lên testnet

**Current Status**: 62% complete - cần 1-2 tuần nữa

---

## 💡 Tips

### Workflow Suggestions:

1. **Không cần làm hết**: Focus vào High Priority items
2. **Copy & Modify**: Dùng existing tests làm template
3. **Test locally first**: Chạy `npx hardhat test` trước khi deploy
4. **One step at a time**: Làm từng item một, đừng làm song song

### Testing Tips:

```bash
# Compile contracts
npx hardhat compile

# Run specific test
npx hardhat test test/governance/Timelock.test.ts

# Deploy to localhost
npx hardhat deploy --tags VaultsUpgradeable

# Deploy to Sepolia
npx hardhat deploy --network sepolia --tags SavingBankUpgradeable
```

### Common Commands:

```bash
# Check test coverage
npx hardhat coverage

# Run all tests
npx hardhat test

# Gas report
REPORT_GAS=1 npx hardhat test

# Clean & recompile
npx hardhat clean && npx hardhat compile
```

---

## 📞 Quick Reference

### File Locations:

- **Contracts**: `contracts/`
- **Deploy**: `deploy/`
- **Tests**: `test/`
- **Scripts**: `scripts/`
- **Docs**: `docs/`

### Key Files:

- Main contract: `contracts/SavingBankUpgradeable.sol`
- Timelock: `contracts/SavingBankTimelock.sol`
- Deploy config: `hardhat.config.ts`

### Important Addresses (after deploy):

```
Token: 0x...
PrincipalVault Proxy: 0x...
InterestVault Proxy: 0x...
SavingBank Proxy: 0x...
NFT: 0x...
NFT Metadata Proxy: 0x...
Timelock: 0x...
```

---

## 🔄 Next Steps After Phase 2

Once Phase 2 is complete (100%):

1. **Deploy to Testnet**: Full deployment on Sepolia
2. **User Testing**: Test with real scenarios
3. **Phase 3 Planning**: Auto-compound & partial withdrawal features
4. **Security Audit** (Optional): External audit if needed
5. **Mainnet Preparation**: Final checks before production

---

## 📈 Version History

| Version | Date       | Changes         | Completion |
| ------- | ---------- | --------------- | ---------- |
| 1.0     | 2026-02-01 | Initial roadmap | 0%         |
| 1.1     | 2026-02-02 | Contracts done  | 30%        |
| 1.2     | 2026-02-02 | Timelock done   | 62%        |
| 2.0     | TBD        | Phase complete  | 100%       |

---

**Last Updated**: 2026-02-02
**Status**: 🟡 In Progress (62%)
**Next Action**: Fix NFT deploy script → Create upgrade tests
**Estimated Completion**: 2 weeks

---

## 📋 Daily Checklist Template

Copy this for daily tracking:

```markdown
### Day X - [Date]

**Focus**: [Main task]

**Completed**:

- [ ] Task 1
- [ ] Task 2

**Blocked**:

- Issue 1 - need help with X

**Tomorrow**:

- [ ] Task 3
- [ ] Task 4

**Notes**:

- Learning: ...
- Questions: ...
```

---

**END OF PHASE 2 ROADMAP**
