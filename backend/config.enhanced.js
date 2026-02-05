import dotenv from 'dotenv';
dotenv.config();

export const config = {
  // IPFS Settings (Pinata)
  pinata: {
    apiKey: process.env.PINATA_API_KEY,
    secretKey: process.env.PINATA_SECRET_KEY,
    gateway: 'https://gateway.pinata.cloud/ipfs',
  },

  // Contract Addresses
  contracts: {
    savingBank: process.env.SAVING_BANK_CONTRACT_ADDRESS || '',
    nft: process.env.NFT_CONTRACT_ADDRESS || '',
    metadata: process.env.METADATA_CONTRACT_ADDRESS || '',
  },

  // Blockchain
  rpcUrl: process.env.RPC_URL || 'http://localhost:8545',
  
  // Private key for auto-updating contract metadata (optional)
  updaterPrivateKey: process.env.UPDATER_PRIVATE_KEY || '',

  // Server
  port: parseInt(process.env.PORT || '3000'),

  // Database
  database: {
    path: process.env.DB_PATH || './data/metadata.db',
  },

  // Certificate Design
  certificate: {
    width: 1200,
    height: 800,
    backgroundColor: '#1a1a2e',
    primaryColor: '#6C5CE7',
    secondaryColor: '#A29BFE',
    textColor: '#FFFFFF',
  },

  // Event Listener
  listener: {
    enabled: process.env.ENABLE_LISTENER === 'true',
    syncPastEvents: process.env.SYNC_PAST_EVENTS === 'true',
    fromBlock: parseInt(process.env.FROM_BLOCK || '0'),
  },
};