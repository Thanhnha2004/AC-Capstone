# SavingBank V2 - High Level Architecture

## Overview

SavingBank V2 là một hệ thống tiết kiệm phi tập trung (DeFi) cho phép người dùng gửi tiền theo các gói tiết kiệm với lãi suất cố định. Hệ thống sử dụng kiến trúc vault tách biệt để quản lý tiền gốc và tiền lãi, kết hợp với NFT để đại diện cho chứng chỉ tiết kiệm.

---

## System Components

### 1. **SavingBankV2** (Core Contract)

- **Vai trò**: Contract trung tâm điều phối toàn bộ logic nghiệp vụ
- **Chức năng chính**:
  - Quản lý các gói tiết kiệm (SavingPlan)
  - Xử lý deposit/withdraw/early withdraw
  - Tính toán lãi suất
  - Quản lý chứng chỉ tiết kiệm (DepositCertificate)
  - Điều phối giao dịch giữa các vault
- **Đặc điểm**:
  - Không giữ tiền trực tiếp
  - Sử dụng AccessControl (ADMIN_ROLE, OPERATOR_ROLE)
  - Có Pausable và ReentrancyGuard

### 2. **PrincipalVault**

- **Vai trò**: Vault giữ tiền gốc của người dùng
- **Chức năng chính**:
  - Nhận tiền gốc khi user deposit
  - Trả tiền gốc khi user withdraw
  - Nhận tiền lãi compound từ InterestVault
  - Admin có thể fund/withdraw để quản lý thanh khoản
- **Access Control**: ADMIN_ROLE, OPERATOR_ROLE

### 3. **InterestVault**

- **Vai trò**: Vault giữ tiền lãi và trả lãi cho người dùng
- **Chức năng chính**:
  - Trả lãi cho user khi withdraw maturity
  - Transfer lãi sang PrincipalVault khi renew (compound)
  - Admin fund vault để đảm bảo có đủ tiền lãi
- **Access Control**: ADMIN_ROLE, OPERATOR_ROLE

### 4. **SavingBankNFT**

- **Vai trò**: NFT đại diện cho chứng chỉ tiết kiệm
- **Chức năng chính**:
  - Mint NFT khi user mở deposit mới
  - Burn NFT khi withdraw hoặc renew
  - Lưu trữ metadata on-chain (depositId, planId, amount, time)
  - Generate SVG image động
- **Đặc điểm**:
  - Soulbound (không thể transfer)
  - Owner control (chỉ SavingBank có thể mint/burn)
  - On-chain metadata với SVG động

### 5. **ERC20Mock** (Token)

- **Vai trò**: Token được sử dụng trong hệ thống
- **Chức năng**: Standard ERC20 token cho testing/demo

---

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                           USER LAYER                                │
│                                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐             │
│  │  User A  │  │  User B  │  │  User C  │  │  Admin   │             │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘             │
└───────┼─────────────┼─────────────┼─────────────┼───────────────────┘
        │             │             │             │
        │    Approve  │   Transfer  │   Control   │
        ▼             ▼             ▼             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       CONTRACT LAYER                                │
│                                                                     │
│  ┌────────────────────────────────────────────────────────────┐     │
│  │                     SavingBankV2                           │     │
│  │  ┌──────────────────────────────────────────────────────┐  │     │
│  │  │  Core Functions                                      │  │     │
│  │  │  • openDepositCertificate()                          │  │     │
│  │  │  • withdraw()                                        │  │     │
│  │  │  • earlyWithdraw()                                   │  │     │
│  │  │  • renewDeposit()                                    │  │     │
│  │  └──────────────────────────────────────────────────────┘  │     │
│  │  ┌──────────────────────────────────────────────────────┐  │     │
│  │  │  State Management                                    │  │     │
│  │  │  • savingPlans mapping                               │  │     │
│  │  │  • depositCertificates mapping                       │  │     │
│  │  │  • userDepositIds mapping                            │  │     │
│  │  └──────────────────────────────────────────────────────┘  │     │
│  └─────────┬──────────────┬──────────────┬────────────────────┘     │
│            │              │              │                          │
│     ┌──────▼─────┐ ┌──────▼─────┐ ┌──────▼───────┐                  │
│     │ Principal  │ │ Interest   │ │ SavingBank   │                  │
│     │   Vault    │ │   Vault    │ │     NFT      │                  │
│     │            │ │            │ │              │                  │
│     │ • deposit  │ │ • pay      │ │ • mint       │                  │
│     │ • withdraw │ │ • transfer │ │ • burn       │                  │
│     │ • receive  │ │            │ │ • metadata   │                  │
│     └─────┬──────┘ └─────┬──────┘ └──────────────┘                  │
└───────────┼──────────────┼──────────────────────────────────────────┘
            │              │
            │   Hold       │   Hold
            ▼              ▼
    ┌───────────────────────────────┐
    │     ERC20 Token Pool          │
    │                               │
    │  Principal Balance: XXXX      │
    │  Interest Balance: YYYY       │
    └───────────────────────────────┘
```

---

## Data Flow

### Flow 1: Open Deposit Certificate

```
┌──────┐    1. Approve Token     ┌──────────────┐
│ User │ ─────────────────────>  │  ERC20Mock   │
└───┬──┘                         └──────────────┘
    │
    │ 2. openDepositCertificate(planId, amount)
    │
    ▼
┌─────────────────┐
│  SavingBankV2   │
│                 │
│ 3. Validate:    │
│    - Plan exist │
│    - Amount OK  │
│                 │
│ 4. Create Cert: │
│    - depositId  │
│    - owner      │
│    - principal  │
│    - maturity   │
└────┬─────┬──────┘
     │     │
     │     │ 5. mint(user, depositId, planId, amount)
     │     │
     │     ▼
     │  ┌──────────────┐
     │  │    NFT       │ ──> User receives NFT #depositId
     │  └──────────────┘
     │
     │ 6. depositPrincipal(user, amount)
     │
     ▼
┌──────────────────┐    7. transferFrom(user, vault, amount)   ┌──────────┐
│ PrincipalVault   │ <───────────────────────────────────────  │  Token   │
│                  │                                           └──────────┘
│ • totalBalance++ │
│ • emit Event     │
└──────────────────┘
```

**Steps:**

1. User approve token cho SavingBankV2
2. User gọi `openDepositCertificate(planId, amount)`
3. SavingBankV2 validate plan và amount
4. Tạo DepositCertificate mới với thông tin đầy đủ
5. Mint NFT cho user với metadata
6. Gọi PrincipalVault.depositPrincipal()
7. PrincipalVault pull token từ user

---

### Flow 2: Withdraw at Maturity

```
┌──────┐
│ User │ withdraw(depositId)
└───┬──┘
    │
    ▼
┌─────────────────┐
│  SavingBankV2   │
│                 │
│ 1. Validate:    │
│    - Is owner   │
│    - Is matured │
│    - Is active  │
│                 │
│ 2. Calculate:   │
│    interest =   │
│    P*APR*T/Y    │
│                 │
│ 3. Update:      │
│    status =     │
│    Withdrawn    │
└─┬───────────┬───┘
  │           │
  │ 4. withdrawPrincipal(user, principal)
  │           │
  ▼           │
┌──────────────────┐    Token Transfer    ┌──────┐
│ PrincipalVault   │ ──────────────────>  │ User │
│ • totalBalance-- │                      └──────┘
└──────────────────┘
                    │
                    │ 5. payInterest(user, interest)
                    │
                    ▼
                  ┌──────────────┐    Token Transfer    ┌──────┐
                  │InterestVault │ ──────────────────>  │ User │
                  │• totalBalance│                      └──────┘
                  └──────────────┘
                    │
                    │ 6. burn(depositId)
                    │
                    ▼
                  ┌──────────────┐
                  │     NFT      │ ──> NFT bị burn
                  └──────────────┘
```

**Steps:**

1. User gọi `withdraw(depositId)` sau maturity
2. Validate ownership và maturity
3. Tính toán lãi suất theo công thức: `interest = principal * APR * tenor / (365 days)`
4. PrincipalVault trả tiền gốc
5. InterestVault trả lãi
6. Burn NFT

---

### Flow 3: Early Withdraw (Before Maturity)

```
┌──────┐
│ User │ earlyWithdraw(depositId)
└───┬──┘
    │
    ▼
┌─────────────────┐
│  SavingBankV2   │
│                 │
│ 1. Validate:    │
│    - Is owner   │
│    - Not mature │
│    - Is active  │
│                 │
│ 2. Calculate:   │
│    penalty =    │
│    principal *  │
│    penaltyBps   │
│                 │
│    received =   │
│    principal -  │
│    penalty      │
│                 │
│ 3. Update:      │
│    status =     │
│    EarlyWith... │
└─┬───────────┬───┘
  │           │
  │ 4. withdrawPrincipal(user, received)
  │           │
  ▼           │
┌──────────────────┐    Transfer (principal - penalty)    ┌──────┐
│ PrincipalVault   │ ────────────────────────────────>    │ User │
│ • totalBalance-- │                                     └──────┘
└──────────────────┘
                    │
                    │ 5. withdrawPrincipal(feeReceiver, penalty)
                    │
                    ▼
                  ┌──────────────┐    Transfer penalty    ┌─────────────┐
                  │PrincipalVault│ ────────────────────>  │FeeReceiver  │
                  │• totalBalance│                        └─────────────┘
                  └──────────────┘
                    │
                    │ 6. burn(depositId)
                    │
                    ▼
                  ┌──────────────┐
                  │     NFT      │ ──> NFT bị burn
                  └──────────────┘
```

**Steps:**

1. User gọi `earlyWithdraw(depositId)` trước maturity
2. Validate ownership và status
3. Tính penalty và số tiền nhận được
4. PrincipalVault trả tiền cho user (đã trừ penalty)
5. PrincipalVault trả penalty cho feeReceiver
6. Burn NFT (không có lãi)

---

### Flow 4: Renew Deposit (Compound)

```
┌──────┐
│ User │ renewDeposit(depositId, newPlanId)
└───┬──┘
    │
    ▼
┌─────────────────┐
│  SavingBankV2   │
│                 │
│ 1. Validate:    │
│    - Is owner   │
│    - Is matured │
│    - Is active  │
│    - Plan exist │
│                 │
│ 2. Calculate:   │
│    interest =   │
│    P*APR*T/Y    │
│                 │
│    newPrincipal │
│    = principal  │
│      + interest │
│                 │
│ 3. Create new:  │
│    depositId =  │
│    nextDepositId│
└─┬───────────────┘
  │
  │ 4. transferInterestToPrincipal(principalVault, user, interest)
  │
  ▼
┌──────────────┐    Transfer interest    ┌──────────────────┐
│InterestVault │ ─────────────────────>  │ PrincipalVault   │
│• balance--   │                         │ • balance++      │
└──────────────┘                         └──────────────────┘

  5. Old NFT burned, New NFT minted

┌──────────────┐                         ┌──────────────┐
│   Old NFT    │  burn(oldId)            │   New NFT    │
│  #depositId  │ ───────> X              │ #newId       │
└──────────────┘                         └──────────────┘
                     mint(newId) ────────────────┘

  6. Update certificates

┌─────────────────────────────────────────────────────────┐
│  Old Certificate:                                       │
│    status = Renewed                                     │
│    renewedDepositId = newId                             │
├─────────────────────────────────────────────────────────┤
│  New Certificate:                                       │
│    principal = oldPrincipal + interest (COMPOUNDED)     │
│    maturityAt = now + newPlan.tenor                     │
│    status = Active                                      │
└─────────────────────────────────────────────────────────┘
```

**Steps:**

1. User gọi `renewDeposit(oldDepositId, newPlanId)` sau maturity
2. Validate và tính lãi của deposit cũ
3. Tạo deposit mới với principal = principal cũ + lãi
4. InterestVault transfer lãi trực tiếp vào PrincipalVault
5. Burn NFT cũ và mint NFT mới
6. Update certificates: old = Renewed, new = Active

---

## Access Control Matrix

| Function                      | User     | OPERATOR        | ADMIN           | Description            |
| ----------------------------- | -------- | --------------- | --------------- | ---------------------- |
| **SavingBankV2**              |          |                 |                 |                        |
| openDepositCertificate()      | ✅       | ✅              | ✅              | Mở deposit mới         |
| withdraw()                    | ✅ owner | ✅ owner        | ✅ owner        | Rút tiền khi maturity  |
| earlyWithdraw()               | ✅ owner | ✅ owner        | ✅ owner        | Rút tiền sớm           |
| renewDeposit()                | ✅ owner | ✅ owner        | ✅ owner        | Gia hạn deposit        |
| createPlan()                  | ❌       | ✅              | ✅              | Tạo gói tiết kiệm      |
| updatePlan()                  | ❌       | ✅              | ✅              | Update gói             |
| updatePlanStatus()            | ❌       | ✅              | ✅              | Enable/disable plan    |
| setVaults()                   | ❌       | ❌              | ✅              | Đổi vault address      |
| setNFT()                      | ❌       | ❌              | ✅              | Đổi NFT address        |
| setFeeReceiver()              | ❌       | ❌              | ✅              | Đổi fee receiver       |
| pause/unpause()               | ❌       | ❌              | ✅              | Dừng/tiếp tục contract |
| **PrincipalVault**            |          |                 |                 |                        |
| depositPrincipal()            | ❌       | ✅              | ✅              | Nhận tiền gốc          |
| withdrawPrincipal()           | ❌       | ✅              | ✅              | Trả tiền gốc           |
| receiveDirectDeposit()        | ❌       | ✅              | ✅              | Nhận lãi compound      |
| depositFund()                 | ❌       | ❌              | ✅              | Admin fund vault       |
| withdrawFund()                | ❌       | ❌              | ✅              | Admin rút tiền         |
| pause/unpause()               | ❌       | ❌              | ✅              | Dừng/tiếp tục          |
| **InterestVault**             |          |                 |                 |                        |
| payInterest()                 | ❌       | ✅              | ✅              | Trả lãi cho user       |
| transferInterestToPrincipal() | ❌       | ✅              | ✅              | Chuyển lãi compound    |
| depositFund()                 | ❌       | ❌              | ✅              | Admin fund vault       |
| withdrawFund()                | ❌       | ❌              | ✅              | Admin rút tiền         |
| pause/unpause()               | ❌       | ❌              | ✅              | Dừng/tiếp tục          |
| **SavingBankNFT**             |          |                 |                 |                        |
| mint()                        | ❌       | SavingBank only | SavingBank only | Mint NFT               |
| burn()                        | ❌       | SavingBank only | SavingBank only | Burn NFT               |
| setSavingBank()               | ❌       | ❌              | Owner only      | Set SavingBank address |
| transfer()                    | ❌       | ❌              | ❌              | BLOCKED (soulbound)    |

---

## Role Hierarchy

```
┌────────────────────────────────────────────────────┐
│                   DEFAULT_ADMIN_ROLE               │
│              (Can grant/revoke all roles)          │
└─────────────────────┬──────────────────────────────┘
                      │
          ┌───────────┴───────────┐
          │                       │
┌─────────▼────────┐    ┌─────────▼────────┐
│   ADMIN_ROLE     │    │  OPERATOR_ROLE   │
│                  │    │                  │
│ • Pause system   │    │ • Create plans   │
│ • Change config  │    │ • Update plans   │
│ • Fund vaults    │    │ • Process txns   │
│ • Emergency ops  │    │ • Vault ops      │
└──────────────────┘    └──────────────────┘
```

**Role Assignment Strategy:**

- **DEFAULT_ADMIN_ROLE**: Multi-sig wallet hoặc DAO governance
- **ADMIN_ROLE**: Team administrators (có thể là nhiều addresses)
- **OPERATOR_ROLE**: SavingBankV2 contract + backend operators
- **Owner (NFT)**: Deployer account (có thể transfer ownership)

---

## Security Features

### 1. **Separation of Concerns**

- SavingBankV2: Logic nghiệp vụ, không giữ tiền
- PrincipalVault: Chỉ giữ tiền gốc
- InterestVault: Chỉ giữ tiền lãi
- NFT: Chỉ quản lý certificates

### 2. **Access Control**

- Sử dụng OpenZeppelin AccessControl
- Phân quyền rõ ràng: ADMIN, OPERATOR
- Modifier protection cho tất cả sensitive functions

### 3. **Reentrancy Protection**

- Tất cả contracts đều có ReentrancyGuard
- Nonreentrant modifier cho external functions

### 4. **Pausable**

- Admin có thể pause system trong emergency
- Áp dụng cho cả SavingBank và 2 vaults

### 5. **NFT Soulbound**

- NFT không thể transfer giữa users
- Chỉ có thể mint và burn
- Đảm bảo certificates không bị trade

### 6. **Input Validation**

- Custom errors cho gas efficiency
- Validate tất cả inputs trước khi xử lý
- Check ownership, maturity, status

### 7. **State Management**

- Immutable token addresses
- Snapshot plan data trong certificate
- Clear status tracking (Active, Withdrawn, EarlyWithdrawn, Renewed)

---

## Gas Optimization

1. **Immutable Variables**: `token`, `ADMIN_ROLE`, `OPERATOR_ROLE`
2. **Custom Errors**: Thay vì require strings
3. **Packed Structs**: Tối ưu storage layout
4. **View Functions**: Không tốn gas cho queries
5. **Minimal Storage**: Chỉ lưu data cần thiết

---

## Upgrade Strategy

Hệ thống hiện tại **không upgradeable**. Để upgrade:

### Option 1: Deploy New Contracts

1. Deploy contracts mới
2. Pause contracts cũ
3. Migrate data sang hệ thống mới
4. Update frontend để point tới contracts mới

### Option 2: Use Proxy Pattern (Future)

- Implement TransparentUpgradeableProxy
- Separate storage và logic
- Admin có thể upgrade implementation

---

## Deployment Sequence

```
1. Deploy ERC20Mock
   ↓
2. Deploy InterestVault(token, admin, operator)
   ↓
3. Deploy PrincipalVault(token, admin, operator)
   ↓
4. Deploy SavingBankNFT()
   ↓
5. Deploy SavingBankV2(token, principalVault, interestVault, nft, feeReceiver, admin, operator)
   ↓
6. Set Permissions:
   - Grant OPERATOR_ROLE to SavingBankV2 on both vaults
   - Set savingBank address on NFT contract
   ↓
7. Initialize:
   - Admin fund InterestVault with interest reserve
   - Operator create initial saving plans
```

---

## Key Design Decisions

### 1. **Why 2 Separate Vaults?**

- **Clear accounting**: Tách biệt tiền gốc và tiền lãi
- **Risk isolation**: Nếu 1 vault có vấn đề, vault kia vẫn an toàn
- **Flexible funding**: Admin có thể quản lý thanh khoản riêng biệt
- **Compound support**: Dễ dàng transfer lãi sang principal

### 2. **Why Soulbound NFT?**

- **Prevent trading**: Certificates không nên được trade
- **Ownership guarantee**: Chỉ depositor mới có quyền withdraw
- **Regulatory compliance**: Tránh vấn đề pháp lý về securities

### 3. **Why Snapshot Plan Data?**

- **Immutability**: Plan có thể thay đổi nhưng deposit cũ không bị ảnh hưởng
- **Fair treatment**: User được đảm bảo điều khoản khi deposit
- **Audit trail**: Có thể track lại điều kiện của mỗi deposit

### 4. **Why No Automatic Interest Distribution?**

- **Gas efficiency**: Không cần loop qua nhiều users
- **User control**: User chọn khi nào withdraw
- **Simpler logic**: Tránh phức tạp trong accounting

---

## Future Enhancements

1. **Multi-token Support**: Hỗ trợ nhiều loại token
2. **Variable APR**: Lãi suất thay đổi theo thời gian
3. **Partial Withdrawal**: Rút một phần tiền gốc
4. **Auto-compound**: Tự động renew khi maturity
5. **Referral System**: Thưởng cho người giới thiệu
6. **Insurance Fund**: Bảo hiểm cho depositors
7. **Governance**: DAO voting cho parameters
8. **Cross-chain**: Deploy trên nhiều chains

---

## Conclusion

SavingBank V2 được thiết kế với các nguyên tắc:

- **Security First**: AccessControl, ReentrancyGuard, Pausable
- **Separation of Concerns**: Mỗi contract một trách nhiệm
- **Gas Efficient**: Custom errors, immutable, packed structs
- **User Friendly**: Simple flows, clear status
- **Auditable**: Events cho mọi action, on-chain metadata

Kiến trúc này cho phép hệ thống scale, maintain, và upgrade dễ dàng trong tương lai.
