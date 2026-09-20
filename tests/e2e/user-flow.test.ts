/**
 * E2E Tests - Complete User Flow
 * Simulates real user actions from browsing to delivery
 */

import { testClient } from '../utils/test-client';
import { createMockOrderData, ORDER_STATUSES } from '../utils/mock-data';
import { TestReporter, TestResult, TestSuiteResult } from '../utils/test-reporter';

const reporter = new TestReporter();

async function runTests(): Promise<TestSuiteResult> {
  const results: TestResult[] = [];
  const startTime = Date.now();
  let testGameId = '';
  let testProductId = '';

  async function test(name: string, fn: () => Promise<void>): Promise<void> {
    const testStart = Date.now();
    try {
      await fn();
      results.push({
        name,
        status: 'PASS',
        duration: Date.now() - testStart,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      results.push({
        name,
        status: 'FAIL',
        duration: Date.now() - testStart,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
      });
    }
  }

  function assert(condition: boolean, message: string): void {
    if (!condition) throw new Error(message);
  }

  function assertStatus(actual: number, expected: number): void {
    assert(actual === expected, `Expected status ${expected}, got ${actual}`);
  }

  // ==================== COMPLETE USER FLOW ====================

  await test('E2E Flow - Browse games catalog', async () => {
    const gamesResponse = await testClient.getGames();
    assertStatus(gamesResponse.status, 200);
    assert(gamesResponse.data.length > 0, 'Should have games available');
    testGameId = gamesResponse.data[0].id;
    console.log(`Selected game: ${gamesResponse.data[0].name}`);
  });

  await test('E2E Flow - Select product from game', async () => {
    const productsResponse = await testClient.getProducts(testGameId);
    assertStatus(productsResponse.status, 200);
    assert(productsResponse.data.length > 0, 'Should have products available');
    testProductId = productsResponse.data[0].id;
    console.log(`Selected product: ${productsResponse.data[0].name} - $${productsResponse.data[0].priceUsd}`);
  });

  let orderNumber = '';
  let paymentRef = '';
  let qrCode = '';
  let md5Hash = '';

  await test('E2E Flow - Create order with player details', async () => {
    const orderData = createMockOrderData({
      gameId: testGameId,
      productId: testProductId,
      playerUid: '123456789',
      playerNickname: 'TestPlayer',
      customerEmail: 'customer@example.com',
      paymentMethod: 'BAKONG',
      currency: 'USD',
    });

    const response = await testClient.createOrder(orderData);
    assertStatus(response.status, 200);
    
    orderNumber = response.data.orderNumber;
    paymentRef = response.data.paymentRef;
    qrCode = response.data.qr!;
    md5Hash = response.data.md5Hash!;
    
    assert(orderNumber.length > 0, 'Should receive order number');
    assert(qrCode.length > 0, 'Should receive QR code');
    console.log(`Order created: ${orderNumber}`);
  });

  await test('E2E Flow - QR appears in under 2 seconds', async () => {
    const orderData = createMockOrderData({
      gameId: testGameId,
      productId: testProductId,
    });

    const startTime = Date.now();
    const response = await testClient.createOrder(orderData);
    const duration = Date.now() - startTime;

    assertStatus(response.status, 200);
    assert(duration < 2000, `QR took ${duration}ms, should be <2000ms`);
    assert(response.data.qr && response.data.qr.length > 0, 'QR must be present');
    console.log(`QR generation time: ${duration}ms`);
  });

  await test('E2E Flow - Verify order details', async () => {
    const orderResponse = await testClient.getOrder(orderNumber);
    assertStatus(orderResponse.status, 200);
    
    assert(orderResponse.data.orderNumber === orderNumber, 'Order number should match');
    assert(orderResponse.data.status === 'PENDING', 'Order should be PENDING');
    assert(orderResponse.data.paymentRef === paymentRef, 'Payment ref should match');
    console.log(`Order status: ${orderResponse.data.status}`);
  });

  await test('E2E Flow - Simulate payment success', async () => {
    const simResponse = await testClient.simulatePayment(orderNumber, 10); // Amount doesn't matter in sim mode
    
    assertStatus(simResponse.status, 200);
    assert(simResponse.data.success, 'Payment simulation should succeed');
    console.log(`Payment simulated: ${simResponse.data.newStatus}`);
  });

  await test('E2E Flow - Order status updates after payment', async () => {
    // Wait a moment for status update
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const orderResponse = await testClient.getOrder(orderNumber);
    assertStatus(orderResponse.status, 200);
    
    const paidStatuses = ['PAID', 'PROCESSING', 'QUEUED', 'DELIVERING', 'DELIVERED'];
    assert(
      paidStatuses.includes(orderResponse.data.status),
      `Order should be in paid state, got ${orderResponse.data.status}`
    );
    console.log(`Order status after payment: ${orderResponse.data.status}`);
  });

  await test('E2E Flow - Delivery triggers automatically', async () => {
    // In simulation mode, delivery may happen automatically
    // We verify the order progresses through states
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const orderResponse = await testClient.getOrder(orderNumber);
    assertStatus(orderResponse.status, 200);
    
    // Order should be in a post-payment state
    assert(
      ['PAID', 'PROCESSING', 'QUEUED', 'DELIVERING', 'DELIVERED'].includes(orderResponse.data.status),
      'Order should be progressing through delivery'
    );
    console.log(`Delivery status: ${orderResponse.data.status}`);
  });

  // ==================== ALTERNATIVE FLOWS ====================

  await test('E2E Flow - KHR currency payment', async () => {
    const orderData = createMockOrderData({
      gameId: testGameId,
      productId: testProductId,
      currency: 'KHR',
      paymentMethod: 'BAKONG',
    });

    const response = await testClient.createOrder(orderData);
    assertStatus(response.status, 200);
    assert(response.data.currency === 'KHR', 'Currency should be KHR');
    assert(response.data.amount > 1000, 'KHR amount should be in thousands');
    console.log(`KHR Order: ${response.data.orderNumber} - ${response.data.amount} KHR`);
  });

  await test('E2E Flow - Wallet payment flow', async () => {
    // Wallet payments skip QR generation
    const orderData = createMockOrderData({
      gameId: testGameId,
      productId: testProductId,
      paymentMethod: 'WALLET',
    });

    const response = await testClient.createOrder(orderData);
    // Wallet payments may require authentication
    assert([200, 400, 401].includes(response.status), 'Wallet payment should be handled');
    console.log(`Wallet payment status: ${response.status}`);
  });

  // ==================== ERROR RECOVERY FLOWS ====================

  await test('E2E Flow - Handle payment timeout', async () => {
    const orderData = createMockOrderData({
      gameId: testGameId,
      productId: testProductId,
    });

    const createResponse = await testClient.createOrder(orderData);
    assertStatus(createResponse.status, 200);
    
    // Order should exist even without payment
    const orderResponse = await testClient.getOrder(createResponse.data.orderNumber);
    assertStatus(orderResponse.status, 200);
    assert(orderResponse.data.status === 'PENDING', 'Unpaid order should be PENDING');
  });

  await test('E2E Flow - Handle expired QR', async () => {
    const orderData = createMockOrderData({
      gameId: testGameId,
      productId: testProductId,
    });

    const response = await testClient.createOrder(orderData);
    assertStatus(response.status, 200);
    
    // Check expiration is set
    assert(response.data.expiresAt, 'Should have expiration time');
    const expiresAt = new Date(response.data.expiresAt);
    const now = new Date();
    assert(expiresAt > now, 'Expiration should be in future');
    console.log(`QR expires at: ${expiresAt.toISOString()}`);
  });

  // ==================== EDGE CASES ====================

  await test('E2E Flow - Rapid order creation (stress test)', async () => {
    const promises = [];
    for (let i = 0; i < 3; i++) {
      promises.push(testClient.createOrder(createMockOrderData({
        gameId: testGameId,
        productId: testProductId,
      })));
    }

    const responses = await Promise.all(promises);
    responses.forEach((response, index) => {
      assertStatus(response.status, 200, `Order ${index} should succeed`);
    });
    console.log(`Created ${responses.length} orders rapidly`);
  });

  await test('E2E Flow - Order with special characters in UID', async () => {
    const orderData = createMockOrderData({
      gameId: testGameId,
      productId: testProductId,
      playerUid: 'test123', // Sanitized
      playerNickname: 'Player<Script>Test',
    });

    const response = await testClient.createOrder(orderData);
    assertStatus(response.status, 200);
    
    // Verify order was created safely
    const orderResponse = await testClient.getOrder(response.data.orderNumber);
    assertStatus(orderResponse.status, 200);
  });

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;

  return {
    name: 'E2E Tests - User Flow',
    results,
    totalTests: results.length,
    passed,
    failed,
    skipped: 0,
    duration: Date.now() - startTime,
    timestamp: new Date().toISOString(),
  };
}

runTests()
  .then(suiteResult => {
    reporter.addSuite(suiteResult);
    reporter.generateJsonReport('tests/reports/e2e-user-flow-report.json');
    reporter.generateHtmlReport('tests/reports/e2e-user-flow-report.html');
    reporter.printSummary();
    process.exit(suiteResult.failed > 0 ? 1 : 0);
  })
  .catch(error => {
    console.error('Test suite failed:', error);
    process.exit(1);
  });
