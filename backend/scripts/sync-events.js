#!/usr/bin/env node

import { blockchainListener } from '../services/blockchain.listener.js';
import { config } from '../config/index.js';

/**
 * Sync past deposit events từ blockchain
 */

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('🔄 Blockchain Events Sync');
  console.log('='.repeat(60) + '\n');

  try {
    // Initialize listener
    console.log('[Sync] Initializing blockchain connection...');
    const initialized = await blockchainListener.init();

    if (!initialized) {
      console.error('❌ Failed to initialize blockchain connection');
      process.exit(1);
    }

    // Sync events
    const fromBlock = config.listener.fromBlock;
    const toBlock = 'latest';

    console.log(`[Sync] Syncing events from block ${fromBlock} to ${toBlock}...\n`);

    await blockchainListener.syncPastEvents(fromBlock, toBlock);

    console.log('\n' + '='.repeat(60));
    console.log('✅ Sync Complete!');
    console.log('='.repeat(60) + '\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Sync Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

main();