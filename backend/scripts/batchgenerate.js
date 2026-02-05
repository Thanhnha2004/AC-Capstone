#!/usr/bin/env node

import { metadataService } from '../src/services/metadata.service.js';
import fs from 'fs';

/**
 * Batch generate metadata for multiple certificates
 */

async function main() {
  console.log('\n🔄 Batch Metadata Generator\n');

  // Example: Generate for 5 certificates
  const certificates = [
    {
      depositId: 1,
      planId: 1,
      depositAmount: '1000000000000000000000',
      depositTime: Math.floor(Date.now() / 1000),
      tenorDays: 30,
      aprBps: 1000,
    },
    {
      depositId: 2,
      planId: 1,
      depositAmount: '2000000000000000000000',
      depositTime: Math.floor(Date.now() / 1000),
      tenorDays: 30,
      aprBps: 1000,
    },
    {
      depositId: 3,
      planId: 2,
      depositAmount: '5000000000000000000000',
      depositTime: Math.floor(Date.now() / 1000),
      tenorDays: 90,
      aprBps: 1200,
    },
  ];

  console.log(`📋 Processing ${certificates.length} certificates...\n`);

  try {
    const results = await metadataService.batchGenerateMetadata(certificates);

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    console.log('\n' + '='.repeat(60));
    console.log('📊 Batch Results');
    console.log('='.repeat(60));
    console.log(`Total: ${results.length}`);
    console.log(`Success: ${successful.length}`);
    console.log(`Failed: ${failed.length}`);

    if (successful.length > 0) {
      console.log('\n✅ Successful:');
      successful.forEach(r => {
        console.log(`   #${r.depositId}: ${r.metadataHash}`);
      });
    }

    if (failed.length > 0) {
      console.log('\n❌ Failed:');
      failed.forEach(r => {
        console.log(`   #${r.depositId}: ${r.error}`);
      });
    }

    // Save results
    const filename = `batch-results-${Date.now()}.json`;
    fs.writeFileSync(filename, JSON.stringify(results, null, 2));
    console.log(`\n💾 Results saved to: ${filename}`);
    console.log('='.repeat(60) + '\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();