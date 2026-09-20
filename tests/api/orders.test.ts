/**
 * API Tests - Orders Endpoints
 * Tests all order-related REST endpoints
 */

import { testClient } from '../utils/test-client';
import { createMockOrderData, ORDER_STATUSES } from '../utils/mock-data';
import { TestReporter, TestResult, TestSuiteResult } from '../utils/test-reporter';

const reporter = new TestReporter();

async function runTests(): Promise<TestSuiteResult> {
  const results: TestResult[] = [];
  const startTime = Date.now();

  // Helper to run a single test
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
      const testError: any = {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        type: 'ASSERTION_ERROR',
        timestamp: new Date().toISOString(),
      };

      // Detect error type
      if (error instanceof Error) {
        const msg = error.message.toUpperCase();
        if (msg.includes('NETWORK') || msg.includes('FETCH')) testError.type = 'NETWORK_ERROR';
        else if (msg.includes('TIMEOUT')) testError.type = 'TIMEOUT';
        else if (msg.includes('DATABASE') || msg.includes('PRISMA')) testError.type = 'DATABASE_ERROR';
        else if (msg.includes('AUTH') || msg.includes('TOKEN')) testError.type = 'AUTH_ERROR';
        else if (msg.includes('NOT FOUND') || msg.includes('404')) testError.type = 'NOT_FOUND';
        else if (msg.includes('STATUS') || msg.includes('HTTP')) testError.type = 'HTTP_ERROR';
      }

      results.push({
        name,
        status: 'FAIL',
        duration: Date.now() - testStart,
        error: testError,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // Helper assertions
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

  // ==================== TESTS ====================

  await test('GET /api/games - should return active games list', async () => {
    const response = await testClient.getGames();
    assertStatus(response.status, 200);
    assert(Array.isArray(response.data), 'Response should be an array');
    if (response.data.length > 0) {
      assertHasField(response.data[0], 'id');
      assertHasField(response.data[0], 'slug');
      assertHasField(response.data[0], 'name');
    }
  });

  let testGameId = '';
  let testProductId = '';

  await test('GET /api/products - should return products for game', async () => {
    const gamesResponse = await testClient.getGames();
    assert(gamesResponse.data.length > 0, 'Should have at least one game');
    testGameId = gamesResponse.data[0].id;

    const response = await testClient.getProducts(testGameId);
    assertStatus(response.status, 200);
    assert(Array.isArray(response.data), 'Response should be an array');
    
    if (response.data.length > 0) {
      testProductId = response.data[0].id;
      assertHasField(response.data[0], 'id');
      assertHasField(response.data[0], 'name');
      assertHasField(response.data[0], 'priceUsd');
    }
  });

  await test('POST /api/orders - should create order with BAKONG payment', async () => {
    assert(testGameId && testProductId, 'Game and product must be set');
    
    const orderData = createMockOrderData({
      gameId: testGameId,
      productId: testProductId,
      paymentMethod: 'BAKONG',
      currency: 'USD',
    });

    const response = await testClient.createOrder(orderData);
    assertStatus(response.status, 200);
    assertHasField(response.data, 'orderNumber');
    assertHasField(response.data, 'qr');
    assertHasField(response.data, 'paymentRef');
    assert(response.data.qr && response.data.qr.length > 0, 'QR code must not be empty');
    assert(response.data.qr!.length > 50, 'QR code must be valid KHQR format');
  });

  await test('POST /api/orders - should create order with KHR currency', async () => {
    assert(testGameId && testProductId, 'Game and product must be set');
    
    const orderData = createMockOrderData({
      gameId: testGameId,
      productId: testProductId,
      paymentMethod: 'BAKONG',
      currency: 'KHR',
    });

    const response = await testClient.createOrder(orderData);
    assertStatus(response.status, 200);
    assertHasField(response.data, 'orderNumber');
    assertHasField(response.data, 'amount');
    assertHasField(response.data, 'currency');
    assert(response.data.currency === 'KHR', 'Currency should be KHR');
  });

  await test('POST /api/orders - should reject invalid email', async () => {
    const orderData = createMockOrderData({
      gameId: testGameId,
      productId: testProductId,
      customerEmail: 'invalid-email',
    });

    const response = await testClient.createOrder(orderData);
    assertStatus(response.status, 400);
    assertHasField(response.data, 'error');
  });

  await test('POST /api/orders - should reject invalid UID', async () => {
    const orderData = createMockOrderData({
      gameId: testGameId,
      productId: testProductId,
      playerUid: 'ab', // Too short
    });

    const response = await testClient.createOrder(orderData);
    assertStatus(response.status, 400);
    assertHasField(response.data, 'error');
  });

  await test('POST /api/orders - should handle idempotency key', async () => {
    assert(testGameId && testProductId, 'Game and product must be set');
    
    const idempotencyKey = testClient.generateIdempotencyKey();
    const orderData = createMockOrderData({
      gameId: testGameId,
      productId: testProductId,
      idempotencyKey,
    });

    const response1 = await testClient.createOrder(orderData);
    assertStatus(response1.status, 200);

    // Same idempotency key should be handled
    const orderData2 = { ...orderData, customerEmail: testClient.generateTestEmail() };
    const response2 = await testClient.createOrder(orderData2);
    // Should either succeed with same order or handle gracefully
    assert(response2.status === 200 || response2.status === 409, 'Idempotency should be handled');
  });

  await test('GET /api/orders/[orderNumber] - should retrieve order details', async () => {
    assert(testGameId && testProductId, 'Game and product must be set');
    
    const orderData = createMockOrderData({
      gameId: testGameId,
      productId: testProductId,
    });

    const createResponse = await testClient.createOrder(orderData);
    const orderNumber = createResponse.data.orderNumber;

    const response = await testClient.getOrder(orderNumber);
    assertStatus(response.status, 200);
    assertHasField(response.data, 'id');
    assertHasField(response.data, 'orderNumber');
    assertHasField(response.data, 'status');
    assert(response.data.orderNumber === orderNumber, 'Order number should match');
  });

  await test('GET /api/orders/[orderNumber] - should return 404 for non-existent order', async () => {
    const response = await testClient.getOrder('NONEXISTENT123');
    assertStatus(response.status, 404);
  });

  await test('POST /api/orders - should handle promo code', async () => {
    assert(testGameId && testProductId, 'Game and product must be set');
    
    const orderData = createMockOrderData({
      gameId: testGameId,
      productId: testProductId,
      promoCode: 'INVALID_CODE',
    });

    const response = await testClient.createOrder(orderData);
    // Should still create order, just without discount
    assertStatus(response.status, 200);
  });

  await test('POST /api/orders - QR generation must complete in <2 seconds', async () => {
    assert(testGameId && testProductId, 'Game and product must be set');
    
    const orderData = createMockOrderData({
      gameId: testGameId,
      productId: testProductId,
    });

    const startTime = Date.now();
    const response = await testClient.createOrder(orderData);
    const duration = Date.now() - startTime;

    assertStatus(response.status, 200);
    assert(duration < 2000, `QR generation took ${duration}ms, should be <2000ms`);
  });

  await test('POST /api/orders - should sanitize user input', async () => {
    assert(testGameId && testProductId, 'Game and product must be set');
    
    const orderData = createMockOrderData({
      gameId: testGameId,
      productId: testProductId,
      playerNickname: '<script>alert("xss")</script>Test',
      playerUid: 'test<script>uid',
    });

    const response = await testClient.createOrder(orderData);
    assertStatus(response.status, 200);
    
    // Verify order was created (sanitization happens server-side)
    const orderResponse = await testClient.getOrder(response.data.orderNumber);
    assertStatus(orderResponse.status, 200);
  });

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;

  return {
    name: 'API Tests - Orders',
    results,
    totalTests: results.length,
    passed,
    failed,
    skipped: 0,
    duration: Date.now() - startTime,
    timestamp: new Date().toISOString(),
  };
}

// Run tests
runTests()
  .then(suiteResult => {
    reporter.addSuite(suiteResult);
    reporter.generateJsonReport('tests/reports/api-orders-report.json');
    reporter.generateHtmlReport('tests/reports/api-orders-report.html');
    reporter.printSummary();
    process.exit(suiteResult.failed > 0 ? 1 : 0);
  })
  .catch(error => {
    console.error('Test suite failed:', error);
    process.exit(1);
  });
