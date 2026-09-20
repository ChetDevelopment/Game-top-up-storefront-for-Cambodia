/**
 * STRESS TEST - High Concurrent User Load
 * 
 * Simulates 100+ concurrent users hitting the payment system
 * to find breaking points and performance bottlenecks.
 * 
 * Run with: node tests/stress-test.js
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

// Configuration
const CONFIG = {
  baseUrl: process.env.TEST_BASE_URL || 'http://localhost:3000',
  concurrentUsers: [10, 50, 100, 200], // Test different load levels
  testDuration: 30000, // 30 seconds per level
  gameId: null, // Will be fetched
  productId: null, // Will be fetched
};

// Metrics
const metrics = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  responseTimes: [],
  errors: {},
  ordersCreated: 0,
  paymentsSimulated: 0,
};

// Test results storage
const results = [];

console.log('╔══════════════════════════════════════════════════════════╗');
console.log('║      STRESS TEST - Payment System Under Load            ║');
console.log('╚══════════════════════════════════════════════════════════╝\n');

// Helper: Make HTTP request
function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const url = new URL(path, CONFIG.baseUrl);
    
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = (url.protocol === 'https:' ? https : http).request(options, (res) => {
      let body = '';
      
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        const duration = Date.now() - startTime;
        metrics.totalRequests++;
        metrics.responseTimes.push(duration);
        
        try {
          const jsonData = JSON.parse(body);
          resolve({
            status: res.statusCode,
            data: jsonData,
            duration: duration,
          });
        } catch {
          resolve({
            status: res.statusCode,
            data: body,
            duration: duration,
          });
        }
      });
    });

    req.on('error', (error) => {
      const duration = Date.now() - startTime;
      metrics.totalRequests++;
      metrics.failedRequests++;
      metrics.errors[error.message] = (metrics.errors[error.message] || 0) + 1;
      reject({ error, duration });
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.setTimeout(10000, () => {
      req.destroy();
      metrics.totalRequests++;
      metrics.failedRequests++;
      metrics.errors['TIMEOUT'] = (metrics.errors['TIMEOUT'] || 0) + 1;
      reject({ error: new Error('Request timeout'), duration: 10000 });
    });

    req.end();
  });
}

// Fetch test data
async function fetchTestData() {
  console.log('📥 Fetching test data...');
  
  try {
    // Get games
    const gamesRes = await makeRequest('GET', '/api/games');
    if (gamesRes.status === 200 && Array.isArray(gamesRes.data) && gamesRes.data.length > 0) {
      CONFIG.gameId = gamesRes.data[0].id;
      console.log(`✓ Selected game: ${gamesRes.data[0].name}`);
    }
    
    // Get products
    const productsRes = await makeRequest('GET', `/api/products?gameId=${CONFIG.gameId}`);
    if (productsRes.status === 200 && Array.isArray(productsRes.data) && productsRes.data.length > 0) {
      CONFIG.productId = productsRes.data[0].id;
      console.log(`✓ Selected product: ${productsRes.data[0].name} ($${productsRes.data[0].priceUsd})`);
    }
  } catch (error) {
    console.error('❌ Failed to fetch test data:', error);
    process.exit(1);
  }
}

// Simulate single user flow
async function simulateUser(userId) {
  try {
    // Step 1: Create order
    const orderData = {
      gameId: CONFIG.gameId,
      productId: CONFIG.productId,
      playerUid: `stress_${userId}_${Date.now()}`.substring(0, 20),
      playerNickname: `Stress${userId}`,
      customerEmail: `stress${userId}@test.com`,
      paymentMethod: 'BAKONG',
      currency: 'USD',
    };
    
    const orderRes = await makeRequest('POST', '/api/orders', orderData);
    
    if (orderRes.status === 200 && orderRes.data.orderNumber) {
      metrics.ordersCreated++;
      
      // Step 2: Simulate payment (with test header)
      const paymentRes = await makeRequest('POST', '/api/payment/simulate', {
        orderNumber: orderRes.data.orderNumber,
        amount: orderRes.data.amount,
      });
      
      if (paymentRes.status === 200 && paymentRes.data.success) {
        metrics.paymentsSimulated++;
        metrics.successfulRequests += 2; // Count both order + payment
      } else {
        metrics.failedRequests++;
      }
    } else {
      metrics.failedRequests++;
      const errorKey = `Order Creation ${orderRes.status}`;
      metrics.errors[errorKey] = (metrics.errors[errorKey] || 0) + 1;
      
      // Log first few errors for debugging
      if (metrics.failedRequests <= 5) {
        console.log(`  Debug: Order failed - Status: ${orderRes.status}`);
        if (orderRes.data) {
          console.log(`  Response: ${JSON.stringify(orderRes.data).substring(0, 200)}`);
        }
      }
    }
  } catch (error) {
    metrics.failedRequests++;
    const errorKey = error.error?.message || 'Unknown error';
    metrics.errors[errorKey] = (metrics.errors[errorKey] || 0) + 1;
  }
}

// Run load test at specific concurrency
async function runLoadTest(concurrency) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`👥 Testing with ${concurrency} concurrent users...`);
  console.log('='.repeat(70));
  
  // Reset metrics
  metrics.totalRequests = 0;
  metrics.successfulRequests = 0;
  metrics.failedRequests = 0;
  metrics.responseTimes = [];
  metrics.ordersCreated = 0;
  metrics.paymentsSimulated = 0;
  metrics.errors = {};
  
  const startTime = Date.now();
  const usersInterval = [];
  
  // Launch concurrent users
  const userInterval = setInterval(() => {
    if (Date.now() - startTime >= CONFIG.testDuration) {
      clearInterval(userInterval);
      return;
    }
    
    for (let i = 0; i < concurrency; i++) {
      const userId = usersInterval.length;
      usersInterval.push(simulateUser(userId));
    }
  }, 100); // Launch batch every 100ms
  
  // Wait for test duration + cleanup
  await new Promise(resolve => setTimeout(resolve, CONFIG.testDuration + 5000));
  await Promise.allSettled(usersInterval);
  
  const totalTime = Date.now() - startTime;
  
  // Calculate statistics
  const sortedTimes = metrics.responseTimes.sort((a, b) => a - b);
  const avgTime = sortedTimes.reduce((a, b) => a + b, 0) / sortedTimes.length || 0;
  const p50Time = sortedTimes[Math.floor(sortedTimes.length * 0.50)] || 0;
  const p95Time = sortedTimes[Math.floor(sortedTimes.length * 0.95)] || 0;
  const p99Time = sortedTimes[Math.floor(sortedTimes.length * 0.99)] || 0;
  const maxTime = sortedTimes[sortedTimes.length - 1] || 0;
  
  const successRate = metrics.totalRequests > 0 
    ? ((metrics.successfulRequests / metrics.totalRequests) * 100).toFixed(2)
    : 0;
  
  const requestsPerSecond = (metrics.totalRequests / (totalTime / 1000)).toFixed(2);
  
  // Store results
  results.push({
    concurrency,
    totalTime,
    totalRequests: metrics.totalRequests,
    successfulRequests: metrics.successfulRequests,
    failedRequests: metrics.failedRequests,
    successRate: parseFloat(successRate),
    avgResponseTime: avgTime.toFixed(0),
    p50ResponseTime: p50Time,
    p95ResponseTime: p95Time,
    p99ResponseTime: p99Time,
    maxResponseTime: maxTime,
    requestsPerSecond: parseFloat(requestsPerSecond),
    ordersCreated: metrics.ordersCreated,
    paymentsSimulated: metrics.paymentsSimulated,
    errors: { ...metrics.errors },
  });
  
  // Print results
  console.log(`\n📊 Results for ${concurrency} concurrent users:`);
  console.log(`   Total Requests:    ${metrics.totalRequests}`);
  console.log(`   Success Rate:      ${successRate}%`);
  console.log(`   Requests/Second:   ${requestsPerSecond}`);
  console.log(`   Avg Response:      ${avgTime.toFixed(0)}ms`);
  console.log(`   P50 Response:      ${p50Time}ms`);
  console.log(`   P95 Response:      ${p95Time}ms`);
  console.log(`   P99 Response:      ${p99Time}ms`);
  console.log(`   Max Response:      ${maxTime}ms`);
  console.log(`   Orders Created:    ${metrics.ordersCreated}`);
  console.log(`   Payments Done:     ${metrics.paymentsSimulated}`);
  
  if (Object.keys(metrics.errors).length > 0) {
    console.log(`\n   ⚠️  Errors:`);
    Object.entries(metrics.errors).forEach(([error, count]) => {
      console.log(`      • ${error}: ${count}`);
    });
  }
}

// Print final summary
function printSummary() {
  console.log('\n' + '='.repeat(70));
  console.log('📈 FINAL STRESS TEST SUMMARY');
  console.log('='.repeat(70));
  console.log('');
  
  console.log('┌─────────────┬──────────┬────────────┬────────────┬────────────┬────────────┐');
  console.log('│ Concurrency │ Requests │ Success %  │ Avg (ms)   │ P95 (ms)   │ P99 (ms)   │');
  console.log('├─────────────┼──────────┼────────────┼────────────┼────────────┼────────────┤');
  
  results.forEach(r => {
    console.log(`│ ${String(r.concurrency).padEnd(11)} │ ${String(r.totalRequests).padEnd(8)} │ ${String(r.successRate).padEnd(10)} │ ${String(r.avgResponseTime).padEnd(10)} │ ${String(r.p95ResponseTime).padEnd(10)} │ ${String(r.p99ResponseTime).padEnd(10)} │`);
  });
  
  console.log('└─────────────┴──────────┴────────────┴────────────┴────────────┴────────────┘');
  
  // Identify bottlenecks
  console.log('\n🔍 PERFORMANCE ANALYSIS:');
  
  const worstResult = results.reduce((worst, r) => 
    r.successRate < worst.successRate ? r : worst, results[0]);
  
  if (worstResult.successRate < 90) {
    console.log(`   ⚠️  System fails at ${worstResult.concurrency}+ concurrent users`);
    console.log(`      Success rate drops to ${worstResult.successRate}%`);
  }
  
  const slowestResult = results.reduce((slowest, r) => 
    parseFloat(r.p95ResponseTime) > parseFloat(slowest.p95ResponseTime) ? r : slowest, results[0]);
  
  if (parseFloat(slowestResult.p95ResponseTime) > 5000) {
    console.log(`   ⚠️  Response time exceeds 5s at ${slowestResult.concurrency} users`);
    console.log(`      P95: ${slowestResult.p95ResponseTime}ms`);
  }
  
  // Recommendations
  console.log('\n💡 RECOMMENDATIONS:');
  
  if (results.some(r => parseFloat(r.p95ResponseTime) > 3000)) {
    console.log('   1. Optimize database queries - add indexes');
    console.log('   2. Implement caching for games/products');
    console.log('   3. Use connection pooling for database');
  }
  
  if (results.some(r => r.successRate < 95)) {
    console.log('   1. Add request queuing for high load');
    console.log('   2. Implement rate limiting');
    console.log('   3. Scale horizontally (more server instances)');
  }
  
  if (results.some(r => parseFloat(r.maxResponseTime) > 10000)) {
    console.log('   1. Add timeout handling');
    console.log('   2. Implement circuit breakers');
    console.log('   3. Add retry logic with backoff');
  }
  
  console.log('');
  console.log('='.repeat(70));
  
  // Save results to file
  const fs = require('fs');
  const reportPath = 'tests/reports/stress-test-results.json';
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\n📁 Detailed results saved to: ${reportPath}`);
  console.log('');
}

// Main execution
async function main() {
  try {
    // Fetch test data
    await fetchTestData();
    
    // Run tests at different concurrency levels
    for (const concurrency of CONFIG.concurrentUsers) {
      await runLoadTest(concurrency);
    }
    
    // Print summary
    printSummary();
    
    // Exit with error if success rate too low
    const worstSuccessRate = Math.min(...results.map(r => r.successRate));
    if (worstSuccessRate < 80) {
      console.log('❌ STRESS TEST FAILED: Success rate below 80%');
      process.exit(1);
    } else {
      console.log('✅ STRESS TEST PASSED: System handles load adequately');
      process.exit(0);
    }
  } catch (error) {
    console.error('❌ Stress test failed:', error);
    process.exit(1);
  }
}

// Run the test
main();
