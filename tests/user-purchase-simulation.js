/**
 * REALISTIC USER PURCHASE SIMULATION
 * Simulates multiple real users browsing and buying products
 * with realistic delays and behavior patterns
 */

const http = require('http');
const fs = require('fs');

const BASE_URL = 'http://localhost:3000';

// Configuration - realistic user behavior
const CONFIG = {
  totalUsers: 50,           // Simulate 50 users
  concurrentUsers: 5,       // 5 users at a time (realistic)
  testDuration: 60000,      // 1 minute test
  thinkTime: { min: 2000, max: 8000 }, // Users think 2-8 seconds between actions
};

// Metrics
const metrics = {
  totalRequests: 0,
  successfulPurchases: 0,
  failedPurchases: 0,
  browseActions: 0,
  addToCartActions: 0,
  checkoutActions: 0,
  responseTimes: [],
  errors: {},
  purchasesBySecond: [],
};

console.log('╔══════════════════════════════════════════════════════════╗');
console.log('║     REAL USER PURCHASE SIMULATION                       ║');
console.log('╚══════════════════════════════════════════════════════════╝\n');

console.log('📊 Test Configuration:');
console.log(`   • Total Users: ${CONFIG.totalUsers}`);
console.log(`   • Concurrent Users: ${CONFIG.concurrentUsers}`);
console.log(`   • Test Duration: ${CONFIG.testDuration / 1000} seconds`);
console.log(`   • Think Time: ${CONFIG.thinkTime.min/1000}s - ${CONFIG.thinkTime.max/1000}s\n`);

// Helper: Make HTTP request
function makeRequest(method, path, data = null, headers = {}) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': `RealUser-${Math.floor(Math.random() * 10000)}`,
        ...headers,
      },
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        const duration = Date.now() - startTime;
        metrics.totalRequests++;
        metrics.responseTimes.push(duration);
        
        try {
          resolve({
            status: res.statusCode,
            data: JSON.parse(body),
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
      metrics.errors[error.message] = (metrics.errors[error.message] || 0) + 1;
      resolve({ error, duration, status: 0 });
    });

    req.setTimeout(15000, () => {
      req.destroy();
      metrics.totalRequests++;
      metrics.errors['TIMEOUT'] = (metrics.errors['TIMEOUT'] || 0) + 1;
      resolve({ error: new Error('Timeout'), duration: 15000, status: 0 });
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

// Simulate realistic user journey
async function simulateUserJourney(userId) {
  const userStartTime = Date.now();
  const journey = [];
  
  try {
    // Step 1: Browse homepage
    journey.push({ action: 'browse_home', start: Date.now() });
    const homeRes = await makeRequest('GET', '/');
    metrics.browseActions++;
    await sleep(randomRange(CONFIG.thinkTime.min, CONFIG.thinkTime.max));
    
    // Step 2: View games list
    journey.push({ action: 'view_games', start: Date.now() });
    const gamesRes = await makeRequest('GET', '/api/games');
    metrics.browseActions++;
    
    if (gamesRes.status !== 200 || !gamesRes.data || !Array.isArray(gamesRes.data) || gamesRes.data.length === 0) {
      journey.push({ action: 'view_games', success: false, error: 'No games available' });
      return { userId, journey, success: false, reason: 'No games' };
    }
    
    const selectedGame = gamesRes.data[0];
    await sleep(randomRange(CONFIG.thinkTime.min, CONFIG.thinkTime.max));
    
    // Step 3: View products for game
    journey.push({ action: 'view_products', start: Date.now(), gameId: selectedGame.id });
    const productsRes = await makeRequest('GET', `/api/products?gameId=${selectedGame.id}`);
    metrics.browseActions++;
    
    if (productsRes.status !== 200 || !productsRes.data || !Array.isArray(productsRes.data) || productsRes.data.length === 0) {
      journey.push({ action: 'view_products', success: false, error: 'No products available' });
      return { userId, journey, success: false, reason: 'No products' };
    }
    
    const selectedProduct = productsRes.data[0];
    await sleep(randomRange(CONFIG.thinkTime.min, CONFIG.thinkTime.max));
    
    // Step 4: Create order (add to cart + checkout)
    journey.push({ action: 'create_order', start: Date.now(), productId: selectedProduct.id });
    metrics.checkoutActions++;
    
    const orderData = {
      gameId: selectedGame.id,
      productId: selectedProduct.id,
      playerUid: generateRandomUid(),
      playerNickname: `User${userId}`,
      customerEmail: `user${userId}@test.com`,
      paymentMethod: 'BAKONG',
      currency: 'USD',
    };
    
    const orderRes = await makeRequest('POST', '/api/orders', orderData);
    
    if (orderRes.status === 200 && orderRes.data.orderNumber) {
      journey.push({ 
        action: 'create_order', 
        success: true, 
        orderNumber: orderRes.data.orderNumber,
        duration: Date.now() - journey[journey.length - 1].start 
      });
      metrics.successfulPurchases++;
      
      // Step 5: Simulate payment (with delay like real user)
      await sleep(randomRange(3000, 8000)); // User takes time to scan QR
      
      journey.push({ action: 'simulate_payment', start: Date.now() });
      const paymentRes = await makeRequest('POST', '/api/payment/simulate', {
        orderNumber: orderRes.data.orderNumber,
        amount: orderRes.data.amount,
      }, {
        'x-allow-test-payment': 'true',
      });
      
      if (paymentRes.status === 200 && paymentRes.data.success) {
        journey.push({ action: 'simulate_payment', success: true });
        metrics.successfulPurchases++;
      } else {
        journey.push({ action: 'simulate_payment', success: false, error: paymentRes.status });
        metrics.failedPurchases++;
      }
      
      return { 
        userId, 
        journey, 
        success: true, 
        orderNumber: orderRes.data.orderNumber,
        totalDuration: Date.now() - userStartTime 
      };
    } else {
      journey.push({ 
        action: 'create_order', 
        success: false, 
        error: orderRes.status,
        response: orderRes.data 
      });
      metrics.failedPurchases++;
      
      return { userId, journey, success: false, reason: 'Order failed' };
    }
    
  } catch (error) {
    journey.push({ action: 'error', error: error.message });
    metrics.errors[error.message] = (metrics.errors[error.message] || 0) + 1;
    metrics.failedPurchases++;
    return { userId, journey, success: false, reason: error.message };
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomRange(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateRandomUid() {
  return Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 6);
}

// Run simulation
async function runSimulation() {
  const startTime = Date.now();
  const results = [];
  const activeUsers = [];
  
  console.log('🚀 Starting user simulation...\n');
  
  // Launch users in waves
  const userPromises = [];
  
  for (let i = 0; i < CONFIG.totalUsers; i++) {
    if (Date.now() - startTime >= CONFIG.testDuration) {
      break;
    }
    
    const promise = simulateUserJourney(i + 1)
      .then(result => {
        results.push(result);
        
        // Log progress every 5 users
        if (results.length % 5 === 0) {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          const successRate = ((results.filter(r => r.success).length / results.length) * 100).toFixed(1);
          console.log(`⏱️  ${elapsed}s | Completed: ${results.length}/${CONFIG.totalUsers} | Success: ${successRate}%`);
        }
      });
    
    userPromises.push(promise);
    
    // Launch users with realistic delay (users don't all arrive at once)
    await sleep(randomRange(500, 2000));
  }
  
  // Wait for all users to complete
  await Promise.allSettled(userPromises);
  
  const totalTime = Date.now() - startTime;
  
  // Calculate statistics
  const successfulUsers = results.filter(r => r.success);
  const failedUsers = results.filter(r => r => !r.success);
  const successRate = results.length > 0 ? ((successfulUsers.length / results.length) * 100).toFixed(2) : 0;
  
  const sortedTimes = metrics.responseTimes.sort((a, b) => a - b);
  const avgTime = sortedTimes.length > 0 ? sortedTimes.reduce((a, b) => a + b, 0) / sortedTimes.length : 0;
  const p50Time = sortedTimes[Math.floor(sortedTimes.length * 0.50)] || 0;
  const p95Time = sortedTimes[Math.floor(sortedTimes.length * 0.95)] || 0;
  const p99Time = sortedTimes[Math.floor(sortedTimes.length * 0.99)] || 0;
  
  const requestsPerSecond = (metrics.totalRequests / (totalTime / 1000)).toFixed(2);
  const purchasesPerMinute = ((successfulUsers.length / (totalTime / 1000)) * 60).toFixed(2);
  
  // Print results
  console.log('\n' + '═'.repeat(70));
  console.log('📊 REAL USER PURCHASE SIMULATION RESULTS');
  console.log('═'.repeat(70));
  console.log('');
  console.log(`Total Users Simulated:    ${results.length}`);
  console.log(`Successful Purchases:     ${successfulUsers.length} (${successRate}%)`);
  console.log(`Failed Purchases:         ${failedUsers.length}`);
  console.log(`Test Duration:            ${(totalTime / 1000).toFixed(1)} seconds`);
  console.log('');
  console.log(`Total Requests:           ${metrics.totalRequests}`);
  console.log(`Requests/Second:          ${requestsPerSecond}`);
  console.log(`Purchases/Minute:         ${purchasesPerMinute}`);
  console.log('');
  console.log('Response Times:');
  console.log(`  Average:                ${avgTime.toFixed(0)}ms`);
  console.log(`  P50 (Median):           ${p50Time}ms`);
  console.log(`  P95:                    ${p95Time}ms`);
  console.log(`  P99:                    ${p99Time}ms`);
  console.log('');
  console.log('User Actions:');
  console.log(`  Browse Actions:         ${metrics.browseActions}`);
  console.log(`  Checkout Actions:       ${metrics.checkoutActions}`);
  console.log('');
  
  if (Object.keys(metrics.errors).length > 0) {
    console.log('⚠️  Errors Encountered:');
    Object.entries(metrics.errors).forEach(([error, count]) => {
      console.log(`  • ${error}: ${count}`);
    });
    console.log('');
  }
  
  // Performance rating
  console.log('📈 PERFORMANCE RATING:');
  let rating = '🔴 POOR';
  let color = '\x1b[31m'; // Red
  
  if (parseFloat(successRate) >= 95 && p95Time < 2000) {
    rating = '🟢 EXCELLENT';
    color = '\x1b[32m'; // Green
  } else if (parseFloat(successRate) >= 80 && p95Time < 5000) {
    rating = '🟡 GOOD';
    color = '\x1b[33m'; // Yellow
  } else if (parseFloat(successRate) >= 60 && p95Time < 8000) {
    rating = '🟠 ACCEPTABLE';
    color = '\x1b[38;5;208m'; // Orange
  }
  
  console.log(`  Overall: ${color}${rating}\x1b[0m`);
  console.log('');
  
  // Recommendations
  console.log('💡 RECOMMENDATIONS:');
  
  if (parseFloat(successRate) < 80) {
    console.log('  🔴 CRITICAL: Low success rate!');
    console.log('     • Check server logs for errors');
    console.log('     • Verify database connections');
    console.log('     • Review rate limiting settings');
  }
  
  if (p95Time > 5000) {
    console.log('  🟡 WARNING: High response times!');
    console.log('     • Add caching layer (Redis)');
    console.log('     • Optimize database queries');
    console.log('     • Consider CDN for static assets');
  }
  
  if (parseFloat(successRate) >= 80 && p95Time < 5000) {
    console.log('  ✅ System is performing well!');
    console.log('     • Ready for production traffic');
    console.log('     • Monitor in production');
  }
  
  console.log('');
  console.log('═'.repeat(70));
  
  // Save detailed results
  const reportData = {
    timestamp: new Date().toISOString(),
    configuration: CONFIG,
    summary: {
      totalUsers: results.length,
      successfulUsers: successfulUsers.length,
      failedUsers: failedUsers.length,
      successRate: parseFloat(successRate),
      testDuration: totalTime,
    },
    performance: {
      totalRequests: metrics.totalRequests,
      requestsPerSecond: parseFloat(requestsPerSecond),
      purchasesPerMinute: parseFloat(purchasesPerMinute),
      avgResponseTime: avgTime.toFixed(0),
      p50ResponseTime: p50Time,
      p95ResponseTime: p95Time,
      p99ResponseTime: p99Time,
    },
    actions: {
      browse: metrics.browseActions,
      checkout: metrics.checkoutActions,
    },
    errors: metrics.errors,
    rating: rating.split(' ')[1],
  };
  
  fs.writeFileSync('tests/reports/user-purchase-simulation.json', JSON.stringify(reportData, null, 2));
  console.log(`📁 Detailed report saved to: tests/reports/user-purchase-simulation.json\n`);
  
  // Return success/failure
  return parseFloat(successRate) >= 80;
}

// Run the test
runSimulation()
  .then(success => {
    if (success) {
      console.log('✅ PURCHASE SIMULATION PASSED\n');
      process.exit(0);
    } else {
      console.log('❌ PURCHASE SIMULATION FAILED\n');
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  });
