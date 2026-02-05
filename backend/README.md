# NFT Metadata Backend - Complete Solution

Backend hoàn chỉnh với Database và Blockchain Listener để tự động generate và lưu trữ metadata cho NFT certificates.

## 🎯 Features

✅ **Metadata Generation**
- Tự động generate certificate images (PNG)
- Upload lên IPFS (Pinata)
- Tạo metadata JSON chuẩn ERC-721
- Lưu trữ trong database

✅ **Database Storage**
- SQLite database (dễ migrate sang PostgreSQL)
- Lưu trữ toàn bộ thông tin certificates
- Generation logs để tracking
- Search và filter capabilities

✅ **Blockchain Listener**
- Tự động lắng nghe Deposited events
- Auto-generate metadata khi có deposit mới
- Sync past events từ blockchain
- Auto-update certificate status

✅ **RESTful API**
- CRUD operations cho metadata
- Search và filter
- Batch generation
- Status management

✅ **Frontend Integration**
- React components để display metadata
- Responsive UI
- Direct IPFS gateway links

---

## 📦 Installation

### 1. Clone và Install Dependencies

```bash
npm install
```

Dependencies cần thiết:
- `express` - Web server
- `cors` - CORS support
- `dotenv` - Environment variables
- `axios` - HTTP client
- `form-data` - Multipart form data
- `canvas` - Image generation
- `ethers` - Blockchain interaction
- `better-sqlite3` - Database

### 2. Setup Environment Variables

Tạo file `.env`:

```bash
cp .env.example .env
```

Cập nhật các giá trị trong `.env`:

```env
# Server
PORT=3000

# IPFS / Pinata
PINATA_API_KEY=your_api_key
PINATA_SECRET_KEY=your_secret_key

# Blockchain
RPC_URL=https://your-rpc-endpoint
SAVING_BANK_CONTRACT_ADDRESS=0x...
NFT_CONTRACT_ADDRESS=0x...
METADATA_CONTRACT_ADDRESS=0x...

# Optional: Auto-update contract
UPDATER_PRIVATE_KEY=0x...

# Database
DB_PATH=./data/metadata.db

# Listener
ENABLE_LISTENER=true
SYNC_PAST_EVENTS=false
FROM_BLOCK=0
```

### 3. Create Data Directory

```bash
mkdir -p data
```

---

## 🚀 Usage

### Start Server

```bash
npm start
```

Server sẽ chạy tại: `http://localhost:3000`

### Development Mode (with auto-reload)

```bash
npm run dev
```

---

## 📡 API Endpoints

### Health & Stats

```bash
# Health check
GET /health

# Get statistics
GET /api/stats
```

### Metadata Generation

```bash
# Generate single certificate
POST /api/metadata/generate
{
  "depositId": 1,
  "planId": 1,
  "depositAmount": "1000000000000000000000",
  "depositTime": 1234567890,
  "tenorDays": 30,
  "aprBps": 1000
}

# Batch generate
POST /api/metadata/batch
{
  "certificates": [
    { "depositId": 1, ... },
    { "depositId": 2, ... }
  ]
}
```

### Metadata Retrieval

```bash
# Get single certificate
GET /api/metadata/:depositId

# Get all certificates
GET /api/metadata

# Filter by status
GET /api/metadata?status=active

# Filter by plan
GET /api/metadata?planId=1

# Limit results
GET /api/metadata?limit=10

# Search certificates
GET /api/metadata/search?q=1000

# Get generation logs
GET /api/metadata/:depositId/logs
```

### Status Management

```bash
# Update certificate status
PATCH /api/metadata/:depositId/status
{
  "status": "withdrawn"
}

# Valid statuses: active, matured, withdrawn, cancelled
```

### IPFS Proxy

```bash
# Redirect to IPFS gateway
GET /api/ipfs/:hash
```

---

## 🔧 Scripts

### Generate Single Metadata

```bash
npm run generate
```

Tạo metadata cho 1 certificate test.

### Batch Generate

```bash
npm run batch
```

Generate metadata cho nhiều certificates cùng lúc.

### Sync Past Events

```bash
npm run sync
```

Sync tất cả past deposit events từ blockchain và generate metadata.

### Test API

```bash
npm run test
```

Chạy test suite để kiểm tra tất cả API endpoints.

---

## 🔄 Flow Hoàn Chỉnh

### 1. User Deposits → Blockchain Event

```
User deposits tokens
    ↓
Smart contract emits Deposited event
    ↓
Blockchain listener catches event
```

### 2. Auto-Generate Metadata

```
Event listener receives depositId, planId, amount, etc.
    ↓
Fetch plan details from blockchain
    ↓
CertificateGenerator creates PNG image
    ↓
Upload image to IPFS → imageHash
    ↓
Create metadata JSON with image IPFS URL
    ↓
Upload metadata to IPFS → metadataHash
    ↓
Save to database
    ↓
Log generation activity
```

### 3. User Access Metadata

**Option 1: Direct API Call**
```javascript
const response = await fetch(`http://localhost:3000/api/metadata/${depositId}`);
const data = await response.json();

// Access URLs
console.log(data.data.imageUrl);        // Image gateway URL
console.log(data.data.metadataUrl);     // ipfs://...
console.log(data.data.gatewayMetadataUrl); // Gateway URL
```

**Option 2: React Component**
```jsx
import CertificateViewer from './CertificateViewer';

function App() {
  return <CertificateViewer depositId={1} />;
}
```

**Option 3: Smart Contract**
```solidity
// Contract returns: ipfs://{metadataHash}
string memory uri = nftContract.tokenURI(tokenId);
```

---

## 🗄️ Database Schema

### Certificates Table

```sql
CREATE TABLE certificates (
  deposit_id INTEGER PRIMARY KEY,
  plan_id INTEGER NOT NULL,
  deposit_amount TEXT NOT NULL,
  deposit_time INTEGER NOT NULL,
  tenor_days INTEGER NOT NULL,
  apr_bps INTEGER NOT NULL,
  maturity_timestamp INTEGER NOT NULL,
  
  image_hash TEXT NOT NULL,
  metadata_hash TEXT NOT NULL,
  image_url TEXT NOT NULL,
  metadata_url TEXT NOT NULL,
  
  status TEXT DEFAULT 'active',
  created_at INTEGER,
  updated_at INTEGER
);
```

### Generation Log Table

```sql
CREATE TABLE generation_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deposit_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  status TEXT NOT NULL,
  error_message TEXT,
  metadata TEXT,
  created_at INTEGER
);
```

---

## 🎨 Frontend Integration Examples

### Fetch and Display Certificate

```javascript
// Vanilla JavaScript
async function displayCertificate(depositId) {
  const response = await fetch(`http://localhost:3000/api/metadata/${depositId}`);
  const { data } = await response.json();
  
  // Display image
  document.getElementById('cert-image').src = data.imageUrl;
  
  // Display details
  document.getElementById('amount').textContent = 
    (Number(data.depositAmount) / 1e18).toLocaleString();
  document.getElementById('apr').textContent = 
    (data.aprBps / 100).toFixed(2) + '%';
}
```

### React Hook

```javascript
function useCertificate(depositId) {
  const [certificate, setCertificate] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`http://localhost:3000/api/metadata/${depositId}`)
      .then(res => res.json())
      .then(({ data }) => {
        setCertificate(data);
        setLoading(false);
      });
  }, [depositId]);

  return { certificate, loading };
}
```

---

## 📊 Response Examples

### GET /api/metadata/1

```json
{
  "success": true,
  "data": {
    "depositId": 1,
    "planId": 1,
    "depositAmount": "1000000000000000000000",
    "depositTime": 1234567890,
    "tenorDays": 30,
    "aprBps": 1000,
    "maturityTimestamp": 1237159890,
    "imageHash": "QmXyz123...",
    "metadataHash": "QmAbc456...",
    "imageUrl": "https://gateway.pinata.cloud/ipfs/QmXyz123...",
    "metadataUrl": "ipfs://QmAbc456...",
    "gatewayMetadataUrl": "https://gateway.pinata.cloud/ipfs/QmAbc456...",
    "status": "active",
    "createdAt": 1234567890,
    "updatedAt": 1234567890
  }
}
```

### GET /api/metadata

```json
{
  "success": true,
  "count": 3,
  "data": [
    {
      "depositId": 3,
      "planId": 2,
      "depositAmount": "5000000000000000000000",
      "formattedAmount": "5,000.00",
      "tenorDays": 90,
      "aprBps": 1500,
      "aprPercent": "15.00",
      "status": "active",
      "imageUrl": "https://gateway.pinata.cloud/ipfs/...",
      "metadataUrl": "ipfs://...",
      "createdAt": 1234567890
    },
    ...
  ]
}
```

---

## 🔐 Security Notes

1. **Private Key**: Nếu enable auto-update contract, private key phải có `METADATA_UPDATER_ROLE`

2. **API Rate Limiting**: Nên thêm rate limiting cho production

3. **CORS**: Cấu hình CORS phù hợp với domain của bạn

4. **Database**: Backup database thường xuyên

---

## 🚧 Production Deployment

### 1. Use PostgreSQL

Thay SQLite bằng PostgreSQL:

```bash
npm install pg
```

Update database service để dùng PostgreSQL adapter.

### 2. Environment Variables

Đảm bảo tất cả sensitive data ở trong `.env`, không commit vào git.

### 3. Process Manager

Use PM2 để manage process:

```bash
npm install -g pm2
pm2 start server.js --name nft-backend
pm2 save
```

### 4. Reverse Proxy

Setup Nginx reverse proxy:

```nginx
location /api {
    proxy_pass http://localhost:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
}
```

---

## 📞 Support

Nếu có vấn đề, check logs:

```bash
# Server logs
tail -f logs/server.log

# Database queries
# Bật debug mode trong database.service.js
```

---

## 📄 License

MIT