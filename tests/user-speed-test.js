/**
 * Real User Request Speed Test
 * Simulates actual user browsing and payment flows
 */

const http = require('http');
const https = require('https');

const BASE_URL = 'http://localhost:3000';

console.log('🚀 Testing Real User Request Speeds...\n');

// Test scenarios that real users actually do
const scenarios = [
  { name: 'Homepage Load', url: '/', method: 'GET' },
  { name: 'Games List API', url: '/api/games', method: 'GET' },
  { name: 'Products API', url: '/api/products?gameId=test', method: 'GET' },
  { name: 'Order Creation', url: '/api/orders', method: 'POST', body: {
    gameId: 'test',
    productId: 'test',
    playerUid: '123456789',
    customerEmail: 'user@example.com',
    paymentMethod: 'BAKONG',
    currency: 'USD'
  }},
];

async function testRequest(scenario) {
  const times = [];
  const errors = [];
  
  // Test 5 times to get average
  for (let i = 0; i < 5; i++) {
    const start = Date.now();
    
    try {
      await new Promise((resolve, reject) => {
        const url = new URL(scenario.url, BASE_URL);
        const options = {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname + url.search,
          method: scenario.method,
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'RealUser-Browser/1.0'
          }
        };
        
        const req = http.request(options, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            const duration = Date.now() - start;
            times.push(duration);
            if (res.statusCode >= 400) {
              errors.push(`HTTP ${res.statusCode}`);
            }
            resolve();
          });
        });
        
        req.on('error', (e) => {
          errors.push(e.message);
          resolve();
        });
        
        req.setTimeout(10000, () => {
          errors.push('TIMEOUT');
          req.destroy();
          resolve();
        });
        
        if (scenario.body) {
          req.write(JSON.stringify(scenario.body));
        }
        req.end();
      });
    } catch (e) {
      errors.push(e.message);
    }
    
    // Wait 500ms between requests (real user behavior)
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  const avgTime = times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0;
  const minTime = Math.min(...times.filter(t => t > 0));
  const maxTime = Math.max(...times.filter(t => t > 0));
  const successRate = ((5 - errors.length) / 5 * 100).toFixed(1);
  
  return {
    name: scenario.name,
    avgTime: avgTime.toFixed(0),
    minTime,
    maxTime,
    successRate,
    errors: errors.slice(0, 3) // First 3 errors
  };
}

async function runTests() {
  const results = [];
  
  for (const scenario of scenarios) {
    console.log(`Testing: ${scenario.name}...`);
    const result = await testRequest(scenario);
    results.push(result);
    
    const status = parseFloat(result.successRate) >= 80 ? '✅' : '⚠️';
    const speed = result.avgTime < 1000 ? '🟢' : result.avgTime < 3000 ? '🟡' : '🔴';
    
    console.log(`  ${status} ${speed} Avg: ${result.avgTime}ms | Min: ${result.minTime}ms | Max: ${result.maxTime}ms | Success: ${result.successRate}%`);
    
    if (result.errors.length > 0) {
      console.log(`  Errors: ${result.errors.join(', ')}`);
    }
    console.log('');
  }
  
  // Summary
  console.log('═'.repeat(70));
  console.log('📊 SPEED TEST SUMMARY');
  console.log('═'.repeat(70));
  
  const overallAvg = results.reduce((sum, r) => sum + parseFloat(r.avgTime), 0) / results.length;
  const overallSuccess = results.reduce((sum, r) => sum + parseFloat(r.successRate), 0) / results.length;
  
  console.log(`Overall Average Response: ${overallAvg.toFixed(0)}ms`);
  console.log(`Overall Success Rate: ${overallSuccess.toFixed(1)}%`);
  console.log('');
  
  // Performance rating
  let rating = '🔴 POOR';
  if (overallAvg < 1000) rating = '🟢 EXCELLENT';
  else if (overallAvg < 2000) rating = '🟡 GOOD';
  else if (overallAvg < 3000) rating = '🟠 ACCEPTABLE';
  
  console.log(`Performance Rating: ${rating}`);
  console.log('');
  
  // Recommendations
  console.log('💡 RECOMMENDATIONS:');
  
  if (overallAvg > 3000) {
    console.log('   🔴 CRITICAL: Response times too slow!');
    console.log('      • Enable response compression');
    console.log('      • Add Redis caching');
    console.log('      • Optimize database queries');
  } else if (overallAvg > 2000) {
    console.log('   🟡 WARNING: Response times could be better');
    console.log('      • Add caching layer');
    console.log('      • Optimize slow endpoints');
  } else if (overallAvg > 1000) {
    console.log('   🟢 GOOD: Response times acceptable');
    console.log('      • Consider caching for further improvement');
  } else {
    console.log('   ✅ EXCELLENT: Response times are great!');
  }
  
  if (overallSuccess < 80) {
    console.log('');
    console.log('   ⚠️  HIGH ERROR RATE - Check:');
    console.log('      • Rate limiting too aggressive');
    console.log('      • Server errors in logs');
    console.log('      • Database connection issues');
  }
  
  console.log('═'.repeat(70));
  
  // Save results
  const fs = require('fs');
  fs.writeFileSync('tests/reports/user-speed-test.json', JSON.stringify({
    timestamp: new Date().toISOString(),
    results,
    overallAvg: overallAvg.toFixed(0),
    overallSuccess: overallSuccess.toFixed(1),
    rating: rating.split(' ')[1]
  }, null, 2));
  
  console.log('\n📁 Results saved to: tests/reports/user-speed-test.json\n');
}

runTests().catch(console.error);
