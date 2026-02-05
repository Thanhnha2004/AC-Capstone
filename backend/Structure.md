# 📁 Project Structure

```
backend/
├── src/
│   ├── config/
│   │   └── index.js              # Cấu hình (Pinata, colors, sizes)
│   │
│   ├── services/
│   │   ├── ipfs.service.js       # Upload to IPFS (Pinata API)
│   │   ├── certificate.service.js # Generate certificate images
│   │   └── metadata.service.js   # Create & upload metadata JSON
│   │
│   ├── scripts/
│   │   ├── generateMetadata.js   # Standalone: generate 1 certificate
│   │   └── batchGenerate.js      # Standalone: batch generate
│   │
│   └── index.js                  # Express API server
│
├── .env.example                  # Environment template
├── .env                          # Your config (create this)
├── .gitignore                    # Git ignore rules
├── package.json                  # Dependencies
├── test-api.sh                   # API test script
├── README.md                     # Full documentation
└── QUICK_START.md                # Quick guide
```

---

## 📄 File Details

### `src/config/index.js`
- Load environment variables
- Certificate design config (colors, sizes)
- Pinata credentials

### `src/services/ipfs.service.js`
**Methods:**
- `uploadJSON(metadata, name)` → Upload JSON to IPFS
- `uploadBuffer(buffer, filename)` → Upload image buffer
- `getGatewayUrl(hash)` → Get HTTP URL
- `getIPFSUrl(hash)` → Get ipfs:// URL

**API Used:** Pinata Cloud

### `src/services/certificate.service.js`
**Methods:**
- `generateCertificate(data)` → Generate PNG buffer
- `drawBackground()`, `drawBorder()`, `drawTitle()`... → Drawing functions

**Tech:** Node Canvas (Cairo graphics)

### `src/services/metadata.service.js`
**Methods:**
- `generateMetadata(certData)` → Complete flow
- `batchGenerateMetadata(certs[])` → Batch processing

**Flow:**
1. Generate image → Buffer
2. Upload image → IPFS hash
3. Create metadata JSON
4. Upload metadata → IPFS hash
5. Return all hashes & URLs

### `src/index.js`
**Express API Server**

**Endpoints:**
- `GET /health` → Health check
- `POST /api/metadata/generate` → Single certificate
- `POST /api/metadata/batch` → Multiple certificates
- `GET /api/metadata/:id` → Get info (placeholder)

**Features:**
- CORS enabled
- JSON body parser
- Error handling
- Request logging

### `src/scripts/generateMetadata.js`
Standalone script để test generate 1 certificate

**Usage:**
```bash
npm run generate
```

**Output:**
- Console logs
- `metadata-output-1.json` file

### `src/scripts/batchGenerate.js`
Batch generate example

**Usage:**
```bash
npm run batch
```

**Output:**
- Console summary
- `batch-results-{timestamp}.json`

---

## 🎯 Usage Patterns

### Pattern 1: API Server (Production)

```bash
# Start server
npm start

# Server runs at http://localhost:3000

# Call API from your app
POST /api/metadata/generate
{
  "depositId": 1,
  "planId": 1,
  "depositAmount": "1000000000000000000000",
  "depositTime": 1706956800
}
```

### Pattern 2: Standalone Script (Testing)

```bash
# Quick test
npm run generate

# Batch test
npm run batch
```

### Pattern 3: Event Listener (Automation)

```javascript
// In your blockchain listener
nftContract.on('CertificateMinted', async (tokenId, ...) => {
  const response = await fetch('http://localhost:3000/api/metadata/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      depositId: tokenId,
      ...certificateData
    })
  });
  
  const { data } = await response.json();
  await contract.setTokenIPFSHash(tokenId, data.metadataHash);
});
```

---

## 🔧 Customization Points

### Change Certificate Design
Edit `src/config/index.js`:
```javascript
certificate: {
  width: 1200,      // Width in pixels
  height: 800,      // Height in pixels
  backgroundColor: '#1a1a2e',
  primaryColor: '#6C5CE7',
  secondaryColor: '#A29BFE',
  textColor: '#FFFFFF',
}
```

### Add More Drawing
Edit `src/services/certificate.service.js`:
```javascript
drawMainContent(ctx, data) {
  // Add your custom elements here
  ctx.fillText('Your text', x, y);
}
```

### Change Metadata Format
Edit `src/services/metadata.service.js`:
```javascript
const metadata = {
  name: `Custom name #${depositId}`,
  description: 'Your description',
  // Add more fields
};
```

### Add Database Storage
Edit `src/index.js`:
```javascript
app.post('/api/metadata/generate', async (req, res) => {
  const result = await metadataService.generateMetadata(data);
  
  // Save to database
  await db.metadata.create({
    depositId: data.depositId,
    metadataHash: result.metadataHash,
    ...
  });
  
  res.json({ success: true, data: result });
});
```

---

## 📦 Dependencies Explained

### Production
- **express** - Web server
- **cors** - Cross-origin requests
- **dotenv** - Environment variables
- **axios** - HTTP client (Pinata API)
- **form-data** - Multipart form (file upload)
- **canvas** - Image generation (Cairo)
- **ethers** - Blockchain utilities (optional)

### Development
- **nodemon** - Auto-reload during development

---

## 🚀 Deployment

### Local Development
```bash
npm run dev  # Auto-reload
```

### Production
```bash
npm start
```

### Docker (Optional)
```dockerfile
FROM node:18
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

### Environment Variables (Production)
```env
PINATA_API_KEY=your_production_key
PINATA_SECRET_KEY=your_production_secret
PORT=3000
NODE_ENV=production
```

---

## 📊 Flow Diagram

```
User Request
    │
    ▼
┌─────────────────────────────────────────┐
│  Express Server (src/index.js)          │
│  • Validate request                     │
│  • Route to handler                     │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  Metadata Service                       │
│  (src/services/metadata.service.js)     │
│  • Orchestrate flow                     │
└─────────┬───────────────┬───────────────┘
          │               │
          ▼               ▼
┌──────────────────┐  ┌─────────────────┐
│ Certificate Svc  │  │   IPFS Service  │
│ Generate Image   │  │   Upload Files  │
└──────────────────┘  └─────────────────┘
          │               │
          └───────┬───────┘
                  │
                  ▼
          ┌──────────────┐
          │ IPFS/Pinata  │
          │ Storage      │
          └──────────────┘
                  │
                  ▼
          Return Hashes & URLs
```

---

## ✅ Complete!

All src files are ready to use! 🎉