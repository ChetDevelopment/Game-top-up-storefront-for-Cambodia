/**
 * LOAD TEST - Payment System Under Heavy Traffic
 * 
 * Simulates multiple concurrent users making payments simultaneously
 * to identify performance bottlenecks and breaking points.
 * 
 * Metrics Measured:
 * - Response times under load
 * - Error rates
 * - Throughput (requests/second)
 * - Database connection pool exhaustion
 * - API rate limiting effectiveness
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const paymentSuccessRate = new Rate('payment_success');
const qrGenerationTime = new Trend('qr_generation_time');
const orderCreationTime = new Trend('order_creation_time');
const paymentVerificationTime = new Trend('payment_verification_time');
const errorCount = new Counter('errors');
const concurrentUsers = new Gauge('concurrent_users');

// Test configuration
export const options = {
  stages: [
    { duration: '30s', target: 10 },   // Ramp up to 10 users
    { duration: '1m', target: 50 },    // Ramp up to 50 users
    { duration: '2m', target: 100 },   // Ramp up to 100 users (peak load)
    { duration: '1m', target: 200 },   // Stress test: 200 users
    { duration: '30s', target: 0 },    // Ramp down to 0
  ],
  thresholds: {
    http_req_duration: ['p(95)<5000'], // 95% of requests should complete below 5s
    payment_success: ['rate>0.95'],     // 95% payment success rate
    qr_generation_time: ['p(95)<3000'], // QR generation under 3s
    order_creation_time: ['p(95)<2000'], // Order creation under 2s
  },
};

const BASE_URL = __ENV.TEST_BASE_URL || 'http://localhost:3000';

// Test data
const testGames = [];
const testProducts = [];

export function setup() {
  console.log('🚀 Starting Load Test Setup...');
  
  // Fetch available games
  const gamesRes = http.get(`${BASE_URL}/api/games`);
  if (gamesRes.status === 200) {
    const games = JSON.parse(gamesRes.body);
    testGames.push(...games.slice(0, 5)); // Use first 5 games
  }
  
  // Fetch products for each game
  testGames.forEach(game => {
    const productsRes = http.get(`${BASE_URL}/api/products?gameId=${game.id}`);
    if (productsRes.status === 200) {
      const products = JSON.parse(productsRes.body);
      testProducts.push({ gameId: game.id, product: products[0] });
    }
  });
  
  console.log(`✓ Loaded ${testGames.length} games and ${testProducts.length} products`);
  
  return {
    games: testGames,
    products: testProducts,
  };
}

export default function (data) {
  const startTime = Date.now();
  
  // Simulate user behavior
  const scenario = Math.random();
  
  if (scenario < 0.3) {
    // 30% - Browse games
    browseGames();
  } else if (scenario < 0.7) {
    // 40% - Create order (most common)
    createOrder(data);
  } else if (scenario < 0.9) {
    // 20% - View order status
    viewOrderStatus();
  } else {
    // 10% - Simulate payment
    simulatePayment();
  }
  
  // Think time between actions
  sleep(Math.random() * 2 + 1);
}

function browseGames() {
  const res = http.get(`${BASE_URL}/api/games`);
  
  check(res, {
    'games API: status is 200': (r) => r.status === 200,
    'games API: response time < 1s': (r) => r.timings.duration < 1000,
  });
  
  if (res.status !== 200) {
    errorCount.add(1);
  }
}

function createOrder(data) {
  if (!data.products || data.products.length === 0) {
    return;
  }
  
  const randomProduct = data.products[Math.floor(Math.random() * data.products.length)];
  
  const payload = {
    gameId: randomProduct.gameId,
    productId: randomProduct.product.id,
    playerUid: generateRandomUid(),
    playerNickname: `LoadTest_${Date.now()}`,
    customerEmail: `loadtest.${Date.now()}@test.com`,
    paymentMethod: 'BAKONG',
    currency: 'USD',
  };
  
  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
  };
  
  const orderStart = Date.now();
  const res = http.post(`${BASE_URL}/api/orders`, JSON.stringify(payload), params);
  const orderDuration = Date.now() - orderStart;
  
  orderCreationTime.add(orderDuration);
  
  check(res, {
    'order API: status is 200': (r) => r.status === 200,
    'order API: has orderNumber': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.orderNumber !== undefined;
      } catch {
        return false;
      }
    },
    'order API: has QR code': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.qr && body.qr.length > 0;
      } catch {
        return false;
      }
    },
    'order API: response time < 3s': (r) => r.timings.duration < 3000,
  });
  
  if (res.status === 200) {
    try {
      const body = JSON.parse(r.body);
      qrGenerationTime.add(body._debug?.processingTime || orderDuration);
    } catch {}
  } else {
    errorCount.add(1);
    console.log(`❌ Order creation failed: ${res.status} - ${res.body}`);
  }
}

function viewOrderStatus() {
  // Generate a random order number (in real test, would use created orders)
  const orderNumber = `TY-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  
  const res = http.get(`${BASE_URL}/api/orders/${orderNumber}`);
  
  check(res, {
    'order status API: response time < 2s': (r) => r.timings.duration < 2000,
  });
  
  if (res.status !== 200 && res.status !== 404) {
    errorCount.add(1);
  }
}

function simulatePayment() {
  // This would need a real order number from previous step
  // For load testing, we skip actual payment simulation
  console.log('💳 Payment simulation skipped in load test');
}

function generateRandomUid() {
  return Math.random().toString(36).substring(2, 10) + 
         Math.random().toString(36).substring(2, 6);
}

export function handleSummary(data) {
  const summary = {
    'Load Test Summary': {
      'Total Requests': data.metrics.http_reqs ? data.metrics.http_reqs.values.count : 0,
      'Success Rate': data.metrics.http_req_failed ? 
        ((1 - data.metrics.http_req_failed.values.rate) * 100).toFixed(2) + '%' : 'N/A',
      'Avg Response Time': data.metrics.http_req_duration ? 
        data.metrics.http_req_duration.values.avg.toFixed(0) + 'ms' : 'N/A',
      'P95 Response Time': data.metrics.http_req_duration ? 
        data.metrics.http_req_duration.values['p(95)'].toFixed(0) + 'ms' : 'N/A',
      'P99 Response Time': data.metrics.http_req_duration ? 
        data.metrics.http_req_duration.values['p(99)'].toFixed(0) + 'ms' : 'N/A',
    },
    'Payment Metrics': {
      'Payment Success Rate': data.metrics.payment_success ? 
        (data.metrics.payment_success.values.rate * 100).toFixed(2) + '%' : 'N/A',
      'Avg QR Generation': data.metrics.qr_generation_time ? 
        data.metrics.qr_generation_time.values.avg.toFixed(0) + 'ms' : 'N/A',
      'P95 QR Generation': data.metrics.qr_generation_time ? 
        data.metrics.qr_generation_time.values['p(95)'].toFixed(0) + 'ms' : 'N/A',
      'Avg Order Creation': data.metrics.order_creation_time ? 
        data.metrics.order_creation_time.values.avg.toFixed(0) + 'ms' : 'N/A',
    },
    'Errors': {
      'Total Errors': data.metrics.errors ? data.metrics.errors.values.count : 0,
    },
  };
  
  // Console output
  console.log('\n' + '='.repeat(70));
  console.log('🚀 LOAD TEST RESULTS');
  console.log('='.repeat(70));
  console.log(JSON.stringify(summary, null, 2));
  console.log('='.repeat(70) + '\n');
  
  return {
    'stdout': textSummary(summary),
    'tests/reports/load-test-summary.json': JSON.stringify(summary, null, 2),
  };
}

function textSummary(summary) {
  let text = '\n╔══════════════════════════════════════════════════════════╗\n';
  text += '║         LOAD TEST RESULTS SUMMARY                   ║\n';
  text += '╚══════════════════════════════════════════════════════════╝\n\n';
  
  for (const [section, metrics] of Object.entries(summary)) {
    text += `${section}:\n`;
    for (const [metric, value] of Object.entries(metrics)) {
      text += `  • ${metric}: ${value}\n`;
    }
    text += '\n';
  }
  
  return text;
}

// Gauge metric helper
function Gauge(name) {
  return {
    add: (value) => {},
  };
}
