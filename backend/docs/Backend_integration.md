# Backend Integration Guide

## 📋 Overview

Hướng dẫn đầy đủ về cách tích hợp NFT Metadata Backend với SavingBank Smart Contracts để tự động generate và lưu trữ metadata cho NFT certificates.

---

## 🏗️ Architecture

```
Smart Contract (Blockchain)
    ↓ Event: DepositCertificateOpened
Blockchain Listener (Backend)
    ↓ Auto-detect new deposit
Certificate Generator
    ↓ Generate PNG image
IPFS Upload (Pinata)
    ↓ Get IPFS hash
Database Storage (SQLite)
    ↓ Save metadata
NFTMetadata Contract Update
    ↓ Set IPFS hash on-chain
Complete ✅
```

---

## 📦 Components

### 1. **Smart Contracts** (Blockchain Layer)

| Contract | Role | Events Emitted |
|----------|------|----------------|
| SavingBankUpgradeable | Main contract | `DepositCertificateOpened`, `Withdrawn` |
| NFTMetadataUpgradeable | Metadata storage | - |
| SavingBankNFT | NFT minting | - |

### 2. **Backend Services** (Node.js)

| Service | File | Purpose |
|---------|------|---------|
| Blockchain Listener | `blockchain.listener.js` | Listen to blockchain events |
| Certificate Generator | `certificate.service.js` | Generate PNG images |
| IPFS Service | `ipfs.service.js` | Upload to Pinata |
| Database Service | `database.service.js` | Store metadata |
| Metadata Service | `metadata.service.js` | Orchestrate workflow |

---

## 🚀 Setup Guide

### Step 1: Smart Contracts Deployment

```bash
# Deploy contracts
npx hardhat deploy --network sepolia --tags VaultsUpgradeable
npx hardhat deploy --network sepolia --tags NFT
npx hardhat deploy --network sepolia --tags SavingBankUpgradeable

# Setup system
npx hardhat run scripts/01_setup_system.ts --network sepolia
```

**Important Addresses to Note:**
- SavingBank Proxy: `0x...`
- NFT Contract: `0x...`
- NFTMetadata Proxy: `0x...`

### Step 2: Backend Installation

```bash
cd backend
npm install
```

**Dependencies:**
- `express` - Web server
- `ethers` - Blockchain interaction
- `canvas` - Image generation
- `axios`, `form-data` - IPFS upload
- `better-sqlite3` - Database

### Step 3: Configuration

Create `.env` file:

```env
# Server
PORT=3000

# IPFS / Pinata
PINATA_API_KEY=your_pinata_api_key
PINATA_SECRET_KEY=your_pinata_secret_key

# Blockchain
RPC_URL=https://sepolia.infura.io/v3/YOUR_KEY
SAVING_BANK_CONTRACT_ADDRESS=0x... # From deployment
NFT_CONTRACT_ADDRESS=0x...          # From deployment
METADATA_CONTRACT_ADDRESS=0x...     # From deployment

# Auto-update contract (optional)
UPDATER_PRIVATE_KEY=0x...           # Must have ADMIN_ROLE in NFTMetadata

# Database
DB_PATH=./data/metadata.db

# Listener
ENABLE_LISTENER=true
SYNC_PAST_EVENTS=false
FROM_BLOCK=0
```

### Step 4: Database Setup

```bash
# Create data directory
mkdir -p data

# Database will be auto-created on first run
```

### Step 5: Start Backend

```bash
# Start server
npm start

# Or development mode with auto-reload
npm run dev
```

**Expected Output:**
```
🚀 NFT Metadata Backend Server with Database
🌐 Server: http://localhost:3000
🔗 Blockchain Listener is ENABLED
[Listener] Initializing blockchain connection...
[Listener] Connected to network: sepolia (chainId: 11155111)
✅ Listening for blockchain events...
```

---

## 🔄 Complete Flow

### 1. User Opens Deposit

```solidity
// User calls on frontend
savingBank.openDepositCertificate(planId, depositAmount);
```

**Smart Contract Actions:**
1. Validates plan and amount
2. Transfers tokens to PrincipalVault
3. Creates DepositCertificate
4. Mints NFT to user
5. **Emits `DepositCertificateOpened` event** ← Backend listens here

### 2. Backend Auto-Detection

```javascript
// blockchain.listener.js
savingBankContract.on('DepositCertificateOpened', 
  async (depositId, user, planId, depositAmount, maturityTimestamp, event) => {
    console.log('🔔 New Deposit Certificate Opened!');
    console.log('Deposit ID:', depositId);
    
    // Auto-generate metadata...
  }
);
```

### 3. Metadata Generation Workflow

```javascript
// Automated steps:
1. Fetch plan details from blockchain
2. Generate certificate PNG image
3. Upload image to IPFS → imageHash
4. Create metadata JSON
5. Upload metadata to IPFS → metadataHash
6. Save to database
7. Update NFTMetadata contract with IPFS hash
```

**Generated Metadata Example:**
```json
{
  "name": "Saving Bank Certificate #1",
  "description": "Certificate of Deposit for 1,000.00 tokens...",
  "image": "ipfs://QmXyz123...",
  "attributes": [
    {"trait_type": "Deposit ID", "value": 1},
    {"trait_type": "Plan ID", "value": 1},
    {"trait_type": "Amount", "value": "1000000000000000000000"},
    {"trait_type": "APR", "value": "10.00%"},
    ...
  ]
}
```

### 4. On-Chain Update (Optional)

If `UPDATER_PRIVATE_KEY` is configured:

```javascript
// blockchain.listener.js - updateContractMetadata()
await nftMetadataContract.setTokenIPFSHash(depositId, metadataHash);
```

**Requirements:**
- Private key must have `ADMIN_ROLE` in NFTMetadata contract
- Sufficient ETH for gas fees

---

## 📡 API Usage

### Get Certificate Metadata

```bash
# Single certificate
GET http://localhost:3000/api/metadata/1

# Response
{
  "success": true,
  "data": {
    "depositId": 1,
    "imageUrl": "https://gateway.pinata.cloud/ipfs/QmXyz...",
    "metadataUrl": "ipfs://QmAbc...",
    "gatewayMetadataUrl": "https://gateway.pinata.cloud/ipfs/QmAbc...",
    "status": "active",
    ...
  }
}
```

### List All Certificates

```bash
# All certificates
GET http://localhost:3000/api/metadata

# Filter by status
GET http://localhost:3000/api/metadata?status=active

# Filter by plan
GET http://localhost:3000/api/metadata?planId=1
```

### Manual Generation

```bash
# Generate metadata manually
POST http://localhost:3000/api/metadata/generate
Content-Type: application/json

{
  "depositId": 1,
  "planId": 1,
  "depositAmount": "1000000000000000000000",
  "depositTime": 1706956800,
  "tenorDays": 30,
  "aprBps": 1000
}
```

---

## 🎨 Frontend Integration

### React Component Example

```jsx
import { useState, useEffect } from 'react';

function CertificateViewer({ depositId }) {
  const [metadata, setMetadata] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`http://localhost:3000/api/metadata/${depositId}`)
      .then(res => res.json())
      .then(data => {
        setMetadata(data.data);
        setLoading(false);
      });
  }, [depositId]);

  if (loading) return <div>Loading...</div>;

  return (
    <div className="certificate-card">
      <img src={metadata.imageUrl} alt="Certificate" />
      <h3>Certificate #{metadata.depositId}</h3>
      <p>Amount: {metadata.formattedAmount} tokens</p>
      <p>APR: {metadata.aprPercent}%</p>
      <p>Status: {metadata.status}</p>
      
      <a href={metadata.gatewayMetadataUrl} target="_blank">
        View Full Metadata
      </a>
    </div>
  );
}
```

### Direct Blockchain Read

```javascript
import { ethers } from 'ethers';

// Read from NFT contract
const nft = new ethers.Contract(NFT_ADDRESS, NFT_ABI, provider);
const tokenURI = await nft.tokenURI(depositId);

// tokenURI = "ipfs://QmAbc..."
// Convert to HTTP gateway
const httpURL = tokenURI.replace('ipfs://', 'https://ipfs.io/ipfs/');

// Fetch metadata
const metadata = await fetch(httpURL).then(r => r.json());
```

---

## 🔧 Advanced Configuration

### Custom Image Design

Edit `backend/config/index.js`:

```javascript
certificate: {
  width: 1200,
  height: 800,
  backgroundColor: '#1a1a2e',
  primaryColor: '#6C5CE7',
  secondaryColor: '#A29BFE',
  textColor: '#FFFFFF',
}
```

### Database Migration to PostgreSQL

```javascript
// Replace in database.service.js
import Database from 'better-sqlite3'; // Remove
import { Pool } from 'pg';              // Add

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});
```

### Rate Limiting

```javascript
// Add to server.js
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use('/api/', limiter);
```

---

## 🐛 Troubleshooting

### Issue 1: Blockchain Listener Not Starting

**Symptoms:**
```
❌ Failed to initialize blockchain connection
```

**Solutions:**
1. Check RPC_URL in `.env`
2. Verify contract addresses
3. Ensure network is correct (sepolia/mainnet)

```bash
# Test RPC connection
curl -X POST $RPC_URL \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
```

### Issue 2: IPFS Upload Failing

**Symptoms:**
```
❌ IPFS upload failed: Request failed with status code 401
```

**Solutions:**
1. Verify Pinata API keys
2. Check Pinata account limits
3. Try uploading manually to test credentials

```bash
# Test Pinata credentials
curl -X POST https://api.pinata.cloud/pinning/pinJSONToIPFS \
  -H "pinata_api_key: YOUR_KEY" \
  -H "pinata_secret_api_key: YOUR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"pinataContent":{"test":"data"}}'
```

### Issue 3: Contract Update Permission Denied

**Symptoms:**
```
❌ Error updating contract metadata: AccessControl
```

**Solutions:**
1. Ensure UPDATER_PRIVATE_KEY has ADMIN_ROLE
2. Grant role if needed:

```javascript
// On frontend or hardhat console
const ADMIN_ROLE = await nftMetadata.ADMIN_ROLE();
await nftMetadata.grantRole(ADMIN_ROLE, updaterAddress);
```

### Issue 4: Database Locked

**Symptoms:**
```
Error: SQLITE_BUSY: database is locked
```

**Solutions:**
1. Ensure only one backend instance running
2. Close any database connections
3. Delete `.db-wal` and `.db-shm` files

```bash
rm data/metadata.db-wal data/metadata.db-shm
```

---

## 📊 Monitoring & Logs

### View Logs

```bash
# Server logs
tail -f logs/server.log

# Database queries
# Enable debug in database.service.js
const db = new Database(dbPath, { verbose: console.log });
```

### Health Check

```bash
# Check server health
curl http://localhost:3000/health

# Expected response
{
  "status": "ok",
  "timestamp": "2026-02-05T10:30:00.000Z",
  "uptime": 3600,
  "database": "connected",
  "listener": "listening"
}
```

### Stats Dashboard

```bash
# Get system statistics
curl http://localhost:3000/api/stats

# Response
{
  "success": true,
  "data": {
    "total": 150,
    "active": 120,
    "matured": 20,
    "withdrawn": 10,
    "totalDepositAmount": "150000000000000000000000",
    "totalDepositAmountFormatted": "150,000.00"
  }
}
```

---

## 🚀 Production Deployment

### 1. Environment Setup

```bash
# Install PM2
npm install -g pm2

# Start with PM2
pm2 start server.js --name nft-backend

# Auto-start on reboot
pm2 startup
pm2 save
```

### 2. Nginx Configuration

```nginx
server {
  listen 80;
  server_name api.yourproject.com;

  location /api {
    proxy_pass http://localhost:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
  }
}
```

### 3. SSL Setup

```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d api.yourproject.com
```

### 4. Database Backup

```bash
# Backup script
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
cp data/metadata.db backups/metadata_$DATE.db

# Add to crontab (daily at 2am)
0 2 * * * /path/to/backup.sh
```

---

## 📝 Best Practices

### 1. Error Handling

```javascript
// Always wrap async operations
try {
  const result = await metadataService.generateMetadata(data);
} catch (error) {
  console.error('Generation failed:', error);
  // Log to database
  databaseService.logGeneration(depositId, 'generate_failed', 'error', error.message);
}
```

### 2. Retry Logic

```javascript
// Retry IPFS uploads
async function uploadWithRetry(buffer, filename, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await ipfsService.uploadBuffer(buffer, filename);
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await sleep(1000 * (i + 1)); // Exponential backoff
    }
  }
}
```

### 3. Event Deduplication

```javascript
// Check before processing
const existing = databaseService.getCertificate(depositId);
if (existing) {
  console.log('Already processed, skipping...');
  return;
}
```

### 4. Gas Optimization

```javascript
// Batch update multiple tokens
async function batchUpdateMetadata(tokens) {
  const tx = await nftMetadata.batchSetTokenIPFSHash(
    tokenIds,
    ipfsHashes
  );
  await tx.wait();
}
```

---

## 🔗 Related Documentation

- [Smart Contracts Architecture](ARCHITECTURE.md)
- [Upgrade Guide](UPGRADEABLE_GUIDE.md)
- [Timelock Guide](TIMELOCK_GUIDE.md)
- [Backend README](../backend/README.md)

---

## 📞 Support

**Issues:**
- Check logs first: `tail -f logs/server.log`
- Verify contract addresses
- Test IPFS connection
- Check database integrity

**Contact:**
- GitHub Issues: https://github.com/your-repo/issues
- Discord: https://discord.gg/yourserver
- Email: support@yourproject.com

---

**Last Updated:** 2026-02-05
**Version:** 2.0.0