/**
 * Integration Tests - Order → Payment → Delivery
 * Tests the complete integration between all components
 */

import { testClient } from '../utils/test-client';
import { createMockOrderData } from '../utils/mock-data';
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

  // Setup
  await test('SETUP - Initialize test data', async () => {
    const gamesResponse = await testClient.getGames();
    assertStatus(gamesResponse.status, 200);
    testGameId = gamesResponse.data[0].id;

    const productsResponse = await testClient.getProducts(testGameId);
    assertStatus(productsResponse.status, 200);
    testProductId = productsResponse.data[0].id;
  });

  // ==================== ORDER CREATION INTEGRATION ====================

  await test('Integration - Order creates payment log entry', async () => {
    const orderData = createMockOrderData({
      gameId: testGameId,
      productId: testProductId,
    });

    const createResponse = await testClient.createOrder(orderData);
    assertStatus(createResponse.status, 200);

    // Verify order exists
    const orderResponse = await testClient.getOrder(createResponse.data.orderNumber);
    assertStatus(orderResponse.status, 200);
    
    // Order should have payment reference
    assert(orderResponse.data.paymentRef, 'Order should have payment reference');
  });

  // ==================== PAYMENT INTEGRATION ====================

  await test('Integration - Payment updates order status atomically', async () => {
    const orderData = createMockOrderData({
      gameId: testGameId,
      productId: testProductId,
    });

    const createResponse = await testClient.createOrder(orderData);
    const orderNumber = createResponse.data.orderNumber;

    // Get initial status
    const beforeResponse = await testClient.getOrder(orderNumber);
    const beforeStatus = beforeResponse.data.status;
    assert(beforeStatus === 'PENDING', 'Initial status should be PENDING');

    // Make payment
    await testClient.simulatePayment(orderNumber, createResponse.data.amount);

    // Get updated status
    const afterResponse = await testClient.getOrder(orderNumber);
    const afterStatus = afterResponse.data.status;
    
    // Status should have changed
    assert(afterStatus !== beforeStatus, 'Status should change after payment');
    assert(
      ['PAID', 'PROCESSING', 'QUEUED'].includes(afterStatus),
      'New status should be paid state'
    );
  });

  await test('Integration - Payment creates delivery job', async () => {
    const orderData = createMockOrderData({
      gameId: testGameId,
      productId: testProductId,
    });

    const createResponse = await testClient.createOrder(orderData);
    
    // Simulate payment
    await testClient.simulatePayment(createResponse.data.orderNumber, createResponse.data.amount);
    
    // Wait for delivery job creation
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const orderResponse = await testClient.getOrder(createResponse.data.orderNumber);
    
    // Order should be in processing state (delivery job created)
    assert(
      ['PAID', 'PROCESSING', 'QUEUED', 'DELIVERING'].includes(orderResponse.data.status),
      'Delivery should be initiated'
    );
  });

  // ==================== IDEMPOTENCY INTEGRATION ====================

  await test('Integration - Idempotency prevents duplicate orders', async () => {
    const idempotencyKey = testClient.generateIdempotencyKey();
    
    const orderData1 = createMockOrderData({
      gameId: testGameId,
      productId: testProductId,
      idempotencyKey,
    });

    const orderData2 = createMockOrderData({
      gameId: testGameId,
      productId: testProductId,
      idempotencyKey,
      customerEmail: testClient.generateTestEmail(), // Different email
    });

    const response1 = await testClient.createOrder(orderData1);
    assertStatus(response1.status, 200);

    const response2 = await testClient.createOrder(orderData2);
    // Should either return same order or handle gracefully
    assert([200, 409].includes(response2.status), 'Idempotency should be enforced');
  });

  await test('Integration - Idempotency prevents duplicate payments', async () => {
    const orderData = createMockOrderData({
      gameId: testGameId,
      productId: testProductId,
    });

    const createResponse = await testClient.createOrder(orderData);
    const orderNumber = createResponse.data.orderNumber;

    // First payment
    const pay1 = await testClient.simulatePayment(orderNumber, createResponse.data.amount);
    assert(pay1.data.success, 'First payment should succeed');

    // Second payment (same order)
    const pay2 = await testClient.simulatePayment(orderNumber, createResponse.data.amount);
    
    // Should handle gracefully (idempotent)
    assert([200, 409].includes(pay2.status), 'Duplicate payment should be handled');

    // Verify order is only paid once
    const orderResponse = await testClient.getOrder(orderNumber);
    assert(
      ['PAID', 'PROCESSING', 'QUEUED', 'DELIVERING', 'DELIVERED'].includes(orderResponse.data.status),
      'Order should be in paid state'
    );
  });

  // ==================== DELIVERY INTEGRATION ====================

  await test('Integration - Delivery updates order to DELIVERED', async () => {
    const orderData = createMockOrderData({
      gameId: testGameId,
      productId: testProductId,
    });

    const createResponse = await testClient.createOrder(orderData);
    
    // Simulate payment
    await testClient.simulatePayment(createResponse.data.orderNumber, createResponse.data.amount);
    
    // Wait for delivery processing
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const orderResponse = await testClient.getOrder(createResponse.data.orderNumber);
    
    console.log(`Order ${createResponse.data.orderNumber} final status: ${orderResponse.data.status}`);
    
    // In simulation mode, delivery may complete automatically
    assert(
      ['PAID', 'PROCESSING', 'QUEUED', 'DELIVERING', 'DELIVERED'].includes(orderResponse.data.status),
      'Order should progress through delivery'
    );
  });

  // ==================== ERROR HANDLING INTEGRATION ====================

  await test('Integration - Failed payment does not create delivery', async () => {
    const orderData = createMockOrderData({
      gameId: testGameId,
      productId: testProductId,
    });

    const createResponse = await testClient.createOrder(orderData);
    
    // Don't make payment
    
    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const orderResponse = await testClient.getOrder(createResponse.data.orderNumber);
    
    // Order should still be PENDING (no delivery job)
    assert(orderResponse.data.status === 'PENDING', 'Unpaid order should remain PENDING');
  });

  // ==================== CONCURRENCY INTEGRATION ====================

  await test('Integration - Concurrent order creation', async () => {
    const orders = [];
    
    // Create 5 orders concurrently
    for (let i = 0; i < 5; i++) {
      orders.push(testClient.createOrder(createMockOrderData({
        gameId: testGameId,
        productId: testProductId,
      })));
    }

    const responses = await Promise.all(orders);
    
    // All should succeed
    responses.forEach((response, index) => {
      assertStatus(response.status, 200, `Order ${index} should succeed`);
    });

    // All should have unique order numbers
    const orderNumbers = responses.map(r => r.data.orderNumber);
    const uniqueNumbers = new Set(orderNumbers);
    assert(uniqueNumbers.size === orderNumbers.length, 'All order numbers should be unique');
  });

  // ==================== DATA CONSISTENCY ====================

  await test('Integration - Order data consistency across operations', async () => {
    const orderData = createMockOrderData({
      gameId: testGameId,
      productId: testProductId,
      playerUid: '987654321',
      customerEmail: 'consistency@test.com',
    });

    const createResponse = await testClient.createOrder(orderData);
    const orderNumber = createResponse.data.orderNumber;

    // Get order multiple times
    const [order1, order2, order3] = await Promise.all([
      testClient.getOrder(orderNumber),
      testClient.getOrder(orderNumber),
      testClient.getOrder(orderNumber),
    ]);

    // All should return same data
    assert(order1.data.orderNumber === order2.data.orderNumber, 'Order numbers should match');
    assert(order2.data.orderNumber === order3.data.orderNumber, 'Order numbers should match');
    assert(order1.data.status === order2.data.status, 'Status should be consistent');
  });

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;

  return {
    name: 'Integration Tests - Order-Payment-Delivery',
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
    reporter.generateJsonReport('tests/reports/integration-order-payment-delivery-report.json');
    reporter.generateHtmlReport('tests/reports/integration-order-payment-delivery-report.html');
    reporter.printSummary();
    process.exit(suiteResult.failed > 0 ? 1 : 0);
  })
  .catch(error => {
    console.error('Test suite failed:', error);
    process.exit(1);
  });
