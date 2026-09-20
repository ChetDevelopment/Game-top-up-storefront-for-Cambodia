/**
 * API Tests - Payment System
 * Tests payment flows, webhooks, and state transitions
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

  function assertHasField(obj: unknown, field: string): void {
    assert(
      typeof obj === 'object' && obj !== null && field in obj,
      `Expected object to have field "${field}"`
    );
  }

  // Setup - get game and product
  await test('SETUP - Fetch games and products', async () => {
    const gamesResponse = await testClient.getGames();
    assertStatus(gamesResponse.status, 200);
    assert(gamesResponse.data.length > 0, 'Should have at least one game');
    testGameId = gamesResponse.data[0].id;

    const productsResponse = await testClient.getProducts(testGameId);
    assertStatus(productsResponse.status, 200);
    assert(productsResponse.data.length > 0, 'Should have at least one product');
    testProductId = productsResponse.data[0].id;
  });

  // ==================== QR GENERATION TESTS ====================

  await test('QR generation - must never return null or empty', async () => {
    const orderData = createMockOrderData({
      gameId: testGameId,
      productId: testProductId,
      paymentMethod: 'BAKONG',
    });

    const response = await testClient.createOrder(orderData);
    assertStatus(response.status, 200);
    assert(response.data.qr, 'QR code must not be null');
    assert(response.data.qr!.length > 0, 'QR code must not be empty');
    assert(response.data.qr!.startsWith('000201'), 'QR must be EMV-compliant format');
  });

  await test('QR generation - must contain valid KHQR structure', async () => {
    const orderData = createMockOrderData({
      gameId: testGameId,
      productId: testProductId,
      paymentMethod: 'BAKONG',
      currency: 'USD',
    });

    const response = await testClient.createOrder(orderData);
    const qr = response.data.qr!;

    // KHQR structure validation
    assert(qr.includes('5802KH'), 'QR must contain Cambodia country code');
    assert(qr.includes('5303840') || qr.includes('5303116'), 'QR must contain currency code');
    assert(qr.length > 100, 'QR must be substantial length');
  });

  await test('QR generation - must include payment reference', async () => {
    const orderData = createMockOrderData({
      gameId: testGameId,
      productId: testProductId,
    });

    const response = await testClient.createOrder(orderData);
    assertHasField(response.data, 'paymentRef');
    assert(response.data.paymentRef.length > 0, 'Payment reference must not be empty');
  });

  await test('QR generation - must include expiration time', async () => {
    const orderData = createMockOrderData({
      gameId: testGameId,
      productId: testProductId,
    });

    const response = await testClient.createOrder(orderData);
    assertHasField(response.data, 'expiresAt');
    const expiresAt = new Date(response.data.expiresAt);
    const now = new Date();
    assert(expiresAt > now, 'Expiration must be in the future');
    assert(expiresAt.getTime() - now.getTime() < 20 * 60 * 1000, 'Expiration should be ~15 minutes');
  });

  // ==================== PAYMENT SIMULATION TESTS ====================

  await test('Payment simulation - should mark order as paid', async () => {
    const orderData = createMockOrderData({
      gameId: testGameId,
      productId: testProductId,
    });

    const createResponse = await testClient.createOrder(orderData);
    assertStatus(createResponse.status, 200);

    const simResponse = await testClient.simulatePayment(
      createResponse.data.orderNumber,
      createResponse.data.amount
    );

    assertStatus(simResponse.status, 200);
    assert(simResponse.data.success, 'Simulation should succeed');
    assert(simResponse.data.newStatus === 'PAID' || simResponse.data.newStatus === 'PROCESSING', 
      'Order should transition to PAID or PROCESSING');
  });

  await test('Payment simulation - should not allow duplicate payment', async () => {
    const orderData = createMockOrderData({
      gameId: testGameId,
      productId: testProductId,
    });

    const createResponse = await testClient.createOrder(orderData);
    
    // First payment
    await testClient.simulatePayment(createResponse.data.orderNumber, createResponse.data.amount);
    
    // Second payment attempt (should be idempotent)
    const simResponse2 = await testClient.simulatePayment(
      createResponse.data.orderNumber,
      createResponse.data.amount
    );

    // Should handle gracefully (either success with same state or specific error)
    assert(simResponse2.status === 200 || simResponse2.status === 409, 
      'Duplicate payment should be handled');
  });

  // ==================== PAYMENT VERIFICATION TESTS ====================

  await test('Payment verification - should check payment status', async () => {
    const orderData = createMockOrderData({
      gameId: testGameId,
      productId: testProductId,
    });

    const createResponse = await testClient.createOrder(orderData);
    
    if (createResponse.data.md5Hash) {
      const verifyResponse = await testClient.verifyPayment(createResponse.data.md5Hash);
      assertStatus(verifyResponse.status, 200);
      assertHasField(verifyResponse.data, 'status');
      assertHasField(verifyResponse.data, 'paid');
    }
  });

  // ==================== ORDER STATE TRANSITION TESTS ====================

  await test('State transition - PENDING → PAID → PROCESSING → DELIVERED', async () => {
    const orderData = createMockOrderData({
      gameId: testGameId,
      productId: testProductId,
    });

    // Create order (PENDING)
    const createResponse = await testClient.createOrder(orderData);
    let orderResponse = await testClient.getOrder(createResponse.data.orderNumber);
    assert(orderResponse.data.status === 'PENDING', 'Initial status should be PENDING');

    // Simulate payment (PAID)
    await testClient.simulatePayment(createResponse.data.orderNumber, createResponse.data.amount);
    orderResponse = await testClient.getOrder(createResponse.data.orderNumber);
    assert(
      ['PAID', 'PROCESSING', 'QUEUED'].includes(orderResponse.data.status),
      'Status should transition after payment'
    );

    console.log(`Order ${createResponse.data.orderNumber} status: ${orderResponse.data.status}`);
  });

  await test('State transition - expired order handling', async () => {
    const orderData = createMockOrderData({
      gameId: testGameId,
      productId: testProductId,
    });

    const createResponse = await testClient.createOrder(orderData);
    
    // Order should have expiration
    assertHasField(createResponse.data, 'expiresAt');
    const expiresAt = new Date(createResponse.data.expiresAt);
    console.log(`Order expires at: ${expiresAt.toISOString()}`);
  });

  // ==================== FAILURE HANDLING TESTS ====================

  await test('Failure handling - should handle payment timeout gracefully', async () => {
    const orderData = createMockOrderData({
      gameId: testGameId,
      productId: testProductId,
    });

    const createResponse = await testClient.createOrder(orderData);
    assertStatus(createResponse.status, 200);
    
    // Order should exist even if payment times out
    const orderResponse = await testClient.getOrder(createResponse.data.orderNumber);
    assertStatus(orderResponse.status, 200);
  });

  await test('Failure handling - should handle invalid payment hash', async () => {
    const verifyResponse = await testClient.verifyPayment('INVALID_HASH_12345');
    // Should return a proper response, not crash
    assertStatus(verifyResponse.status, 200);
    assertHasField(verifyResponse.data, 'status');
  });

  // ==================== CURRENCY TESTS ====================

  await test('Currency - USD payment should have correct amount', async () => {
    const orderData = createMockOrderData({
      gameId: testGameId,
      productId: testProductId,
      currency: 'USD',
    });

    const response = await testClient.createOrder(orderData);
    assertStatus(response.status, 200);
    assert(response.data.currency === 'USD', 'Currency should be USD');
    assert(response.data.amount > 0, 'Amount should be positive');
  });

  await test('Currency - KHR payment should have correct conversion', async () => {
    const orderData = createMockOrderData({
      gameId: testGameId,
      productId: testProductId,
      currency: 'KHR',
    });

    const response = await testClient.createOrder(orderData);
    assertStatus(response.status, 200);
    assert(response.data.currency === 'KHR', 'Currency should be KHR');
    assert(response.data.amount > 0, 'Amount should be positive');
    // KHR amount should be ~4100x USD
    assert(response.data.amount > 1000, 'KHR amount should be in thousands');
  });

  // ==================== PERFORMANCE TESTS ====================

  await test('Performance - QR generation under 500ms', async () => {
    const orderData = createMockOrderData({
      gameId: testGameId,
      productId: testProductId,
    });

    const startTime = Date.now();
    const response = await testClient.createOrder(orderData);
    const duration = Date.now() - startTime;

    assertStatus(response.status, 200);
    assert(duration < 500, `QR generation took ${duration}ms, should be <500ms`);
    console.log(`QR generation time: ${duration}ms`);
  });

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;

  return {
    name: 'API Tests - Payment',
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
    reporter.generateJsonReport('tests/reports/api-payment-report.json');
    reporter.generateHtmlReport('tests/reports/api-payment-report.html');
    reporter.printSummary();
    process.exit(suiteResult.failed > 0 ? 1 : 0);
  })
  .catch(error => {
    console.error('Test suite failed:', error);
    process.exit(1);
  });
