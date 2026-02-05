import express from 'express';
import cors from 'cors';
import { config } from './config/index.js';
import { metadataService } from './services/metadata.service.js';
import { databaseService } from './services/database.service.js';
import { blockchainListener } from './services/blockchain.listener.js';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// ============================================================================
// HEALTH & INFO
// ============================================================================

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: 'connected',
    listener: blockchainListener.isListening ? 'listening' : 'not listening',
  });
});

app.get('/api/stats', (req, res) => {
  try {
    const stats = metadataService.getStats();
    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('[API] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================================================
// METADATA GENERATION
// ============================================================================

app.post('/api/metadata/generate', async (req, res) => {
  try {
    const { depositId, planId, depositAmount, depositTime, tenorDays, aprBps } = req.body;

    if (!depositId || !planId || !depositAmount || !depositTime) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: depositId, planId, depositAmount, depositTime',
      });
    }

    console.log(`\n[API] Generate metadata for deposit #${depositId}`);

    const result = await metadataService.generateMetadata({
      depositId,
      planId,
      depositAmount,
      depositTime,
      tenorDays: tenorDays || 30,
      aprBps: aprBps || 1000,
    });

    console.log(`[API] Success! Metadata: ${result.metadataHash}\n`);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[API] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.post('/api/metadata/batch', async (req, res) => {
  try {
    const { certificates } = req.body;

    if (!Array.isArray(certificates) || certificates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'certificates must be a non-empty array',
      });
    }

    console.log(`\n[API] Batch generate for ${certificates.length} certificates`);

    const results = await metadataService.batchGenerateMetadata(certificates);

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log(`[API] Batch complete: ${successful} success, ${failed} failed\n`);

    res.json({
      success: true,
      summary: {
        total: certificates.length,
        successful,
        failed,
      },
      results,
    });
  } catch (error) {
    console.error('[API] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================================================
// METADATA RETRIEVAL
// ============================================================================

app.get('/api/metadata/:depositId', (req, res) => {
  try {
    const depositId = parseInt(req.params.depositId);

    if (isNaN(depositId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid depositId',
      });
    }

    const metadata = metadataService.getMetadata(depositId);

    if (!metadata) {
      return res.status(404).json({
        success: false,
        error: `Certificate #${depositId} not found`,
      });
    }

    res.json({
      success: true,
      data: metadata,
    });
  } catch (error) {
    console.error('[API] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.get('/api/metadata', (req, res) => {
  try {
    const filters = {
      status: req.query.status,
      planId: req.query.planId ? parseInt(req.query.planId) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit) : undefined,
    };

    const certificates = metadataService.getAllMetadata(filters);

    res.json({
      success: true,
      count: certificates.length,
      data: certificates,
    });
  } catch (error) {
    console.error('[API] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.get('/api/metadata/search', (req, res) => {
  try {
    const searchTerm = req.query.q;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;

    if (!searchTerm) {
      return res.status(400).json({
        success: false,
        error: 'Search term (q) is required',
      });
    }

    const results = metadataService.searchMetadata(searchTerm, limit);

    res.json({
      success: true,
      count: results.length,
      data: results,
    });
  } catch (error) {
    console.error('[API] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.get('/api/metadata/:depositId/logs', (req, res) => {
  try {
    const depositId = parseInt(req.params.depositId);
    const limit = req.query.limit ? parseInt(req.query.limit) : 10;

    if (isNaN(depositId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid depositId',
      });
    }

    const logs = databaseService.getGenerationLogs(depositId, limit);

    res.json({
      success: true,
      count: logs.length,
      data: logs,
    });
  } catch (error) {
    console.error('[API] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================================================
// STATUS MANAGEMENT
// ============================================================================

app.patch('/api/metadata/:depositId/status', (req, res) => {
  try {
    const depositId = parseInt(req.params.depositId);
    const { status } = req.body;

    if (isNaN(depositId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid depositId',
      });
    }

    if (!status) {
      return res.status(400).json({
        success: false,
        error: 'Status is required',
      });
    }

    const validStatuses = ['active', 'matured', 'withdrawn', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
      });
    }

    const updated = metadataService.updateStatus(depositId, status);

    if (!updated) {
      return res.status(404).json({
        success: false,
        error: `Certificate #${depositId} not found`,
      });
    }

    res.json({
      success: true,
      message: `Certificate #${depositId} status updated to ${status}`,
    });
  } catch (error) {
    console.error('[API] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================================================
// IPFS PROXY
// ============================================================================

app.get('/api/ipfs/:hash', async (req, res) => {
  try {
    const { hash } = req.params;
    const ipfsUrl = `https://gateway.pinata.cloud/ipfs/${hash}`;
    res.redirect(ipfsUrl);
  } catch (error) {
    console.error('[API] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================================================
// ERROR HANDLERS
// ============================================================================

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: err.message || 'Internal server error',
  });
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
  });
});

// ============================================================================
// SERVER START + BLOCKCHAIN LISTENER
// ============================================================================

const PORT = config.port;

async function startServer() {
  // Start Express server
  app.listen(PORT, () => {
    console.log('\n' + '='.repeat(70));
    console.log('🚀 NFT Metadata Backend Server with Database');
    console.log('='.repeat(70));
    console.log(`🌐 Server: http://localhost:${PORT}`);
    console.log(`🏥 Health:  http://localhost:${PORT}/health`);
    console.log(`📊 Stats:   http://localhost:${PORT}/api/stats`);
    console.log('\n📝 API Endpoints:');
    console.log('   Generation:');
    console.log(`      POST   /api/metadata/generate`);
    console.log(`      POST   /api/metadata/batch`);
    console.log('   Retrieval:');
    console.log(`      GET    /api/metadata/:depositId`);
    console.log(`      GET    /api/metadata`);
    console.log(`      GET    /api/metadata/search?q=term`);
    console.log(`      GET    /api/metadata/:depositId/logs`);
    console.log('   Management:');
    console.log(`      PATCH  /api/metadata/:depositId/status`);
    console.log('   Proxy:');
    console.log(`      GET    /api/ipfs/:hash`);
    console.log('\n✅ Ready to generate and serve metadata!');
    console.log('='.repeat(70) + '\n');
  });

  // Initialize and start blockchain listener if enabled
  if (config.listener.enabled) {
    console.log('🔗 Blockchain Listener is ENABLED\n');
    
    const initialized = await blockchainListener.init();
    
    if (initialized) {
      await blockchainListener.startListening();
      
      // Sync past events if configured
      if (config.listener.syncPastEvents) {
        console.log('🔄 Syncing past events...\n');
        await blockchainListener.syncPastEvents(config.listener.fromBlock);
      }
    } else {
      console.error('❌ Failed to initialize blockchain listener');
    }
  } else {
    console.log('⚠️  Blockchain Listener is DISABLED');
    console.log('   Enable in .env: ENABLE_LISTENER=true\n');
  }
}

// Start everything
startServer().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

export default app;