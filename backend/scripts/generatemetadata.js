#!/usr/bin/env node

import { metadataService } from '../src/services/metadata.service.js';
import fs from 'fs';

/**
 * Standalone script to test metadata generation
 */

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('🎨 NFT Metadata Generator - Standalone Test');
  console.log('='.repeat(60) + '\n');

  // Example certificate data
  const certificateData = {
    depositId: 1,
    planId: 1,
    depositAmount: '1000000000000000000000', // 1000 tokens
    depositTime: Math.floor(Date.now() / 1000),
    tenorDays: 30,
    aprBps: 1000, // 10%
  };

  console.log('📋 Certificate Data:');
  console.log(JSON.stringify(certificateData, null, 2));
  console.log('\n🔄 Generating metadata...\n');

  try {
    const result = await metadataService.generateMetadata(certificateData);

    console.log('\n' + '='.repeat(60));
    console.log('✅ SUCCESS!');
    console.log('='.repeat(60));
    console.log('\n📊 Results:');
    console.log(`   Image Hash:    ${result.imageHash}`);
    console.log(`   Metadata Hash: ${result.metadataHash}`);
    console.log('\n🔗 URLs:');
    console.log(`   Image:    ${result.imageUrl}`);
    console.log(`   Metadata: ${result.metadataUrl}`);
    console.log('\n📄 Metadata JSON:');
    console.log(JSON.stringify(result.metadata, null, 2));

    // Save to file
    const output = {
      ...result,
      generatedAt: new Date().toISOString(),
      certificateData,
    };

    const filename = `metadata-output-${certificateData.depositId}.json`;
    fs.writeFileSync(filename, JSON.stringify(output, null, 2));

    console.log(`\n💾 Saved to: ${filename}`);
    console.log('='.repeat(60) + '\n');

    console.log('🎉 Done! You can now:');
    console.log('   1. View image at:', result.imageUrl);
    console.log('   2. View metadata at:', result.metadataUrl.replace('ipfs://', 'https://gateway.pinata.cloud/ipfs/'));
    console.log('   3. Use metadataHash in your contract:', result.metadataHash);
    console.log('');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

main();