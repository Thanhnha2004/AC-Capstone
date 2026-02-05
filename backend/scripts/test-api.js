#!/usr/bin/env node

import axios from 'axios';

const BASE_URL = 'http://localhost:3000';

/**
 * Test API Endpoints
 */

async function testAPI() {
  console.log('\n' + '='.repeat(60));
  console.log('🧪 API Testing Suite');
  console.log('='.repeat(60) + '\n');

  try {
    // 1. Health check
    console.log('1️⃣  Testing /health...');
    const health = await axios.get(`${BASE_URL}/health`);
    console.log('✅ Health:', health.data.status);

    // 2. Get stats
    console.log('\n2️⃣  Testing /api/stats...');
    const stats = await axios.get(`${BASE_URL}/api/stats`);
    console.log('✅ Stats:', JSON.stringify(stats.data.data, null, 2));

    // 3. Generate metadata
    console.log('\n3️⃣  Testing /api/metadata/generate...');
    const generateData = {
      depositId: Date.now(), // Random ID for testing
      planId: 1,
      depositAmount: '1000000000000000000000',
      depositTime: Math.floor(Date.now() / 1000),
      tenorDays: 30,
      aprBps: 1000,
    };

    const generated = await axios.post(`${BASE_URL}/api/metadata/generate`, generateData);
    console.log('✅ Generated:');
    console.log('   Deposit ID:', generateData.depositId);
    console.log('   Image Hash:', generated.data.data.imageHash);
    console.log('   Metadata Hash:', generated.data.data.metadataHash);
    console.log('   Gateway URL:', generated.data.data.gatewayMetadataUrl);

    const testDepositId = generateData.depositId;

    // 4. Get single metadata
    console.log('\n4️⃣  Testing /api/metadata/:depositId...');
    const single = await axios.get(`${BASE_URL}/api/metadata/${testDepositId}`);
    console.log('✅ Retrieved metadata for deposit:', testDepositId);
    console.log('   Status:', single.data.data.status);
    console.log('   Amount:', single.data.data.depositAmount);

    // 5. Get all metadata
    console.log('\n5️⃣  Testing /api/metadata...');
    const all = await axios.get(`${BASE_URL}/api/metadata?limit=5`);
    console.log('✅ Retrieved all metadata, count:', all.data.count);

    // 6. Update status
    console.log('\n6️⃣  Testing /api/metadata/:depositId/status...');
    const statusUpdate = await axios.patch(
      `${BASE_URL}/api/metadata/${testDepositId}/status`,
      { status: 'matured' }
    );
    console.log('✅ Status updated:', statusUpdate.data.message);

    // 7. Get logs
    console.log('\n7️⃣  Testing /api/metadata/:depositId/logs...');
    const logs = await axios.get(`${BASE_URL}/api/metadata/${testDepositId}/logs`);
    console.log('✅ Retrieved logs, count:', logs.data.count);

    // 8. Search
    console.log('\n8️⃣  Testing /api/metadata/search...');
    const search = await axios.get(`${BASE_URL}/api/metadata/search?q=${testDepositId}`);
    console.log('✅ Search results:', search.data.count);

    // 9. Batch generate
    console.log('\n9️⃣  Testing /api/metadata/batch...');
    const batchData = {
      certificates: [
        {
          depositId: Date.now() + 1,
          planId: 1,
          depositAmount: '2000000000000000000000',
          depositTime: Math.floor(Date.now() / 1000),
          tenorDays: 60,
          aprBps: 1200,
        },
        {
          depositId: Date.now() + 2,
          planId: 2,
          depositAmount: '5000000000000000000000',
          depositTime: Math.floor(Date.now() / 1000),
          tenorDays: 90,
          aprBps: 1500,
        },
      ],
    };

    const batch = await axios.post(`${BASE_URL}/api/metadata/batch`, batchData);
    console.log('✅ Batch generated:');
    console.log('   Total:', batch.data.summary.total);
    console.log('   Successful:', batch.data.summary.successful);
    console.log('   Failed:', batch.data.summary.failed);

    console.log('\n' + '='.repeat(60));
    console.log('🎉 All Tests Passed!');
    console.log('='.repeat(60) + '\n');

  } catch (error) {
    console.error('\n❌ Test Failed:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
    process.exit(1);
  }
}

// Check if server is running
async function checkServer() {
  try {
    await axios.get(`${BASE_URL}/health`, { timeout: 2000 });
    return true;
  } catch (error) {
    console.error('❌ Server is not running at', BASE_URL);
    console.error('Please start the server first: npm start');
    return false;
  }
}

async function main() {
  const isRunning = await checkServer();
  if (!isRunning) {
    process.exit(1);
  }

  await testAPI();
}

main();