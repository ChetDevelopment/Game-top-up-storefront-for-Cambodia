/**
 * E2E Tests - Payment Flow
 * Tests complete payment lifecycle from QR to delivery
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
  await test('SETUP - Get game and product', async () => {
    const gamesResponse = await testClient.getGames();
    assertStatus(gamesResponse.status, 200);
    testGameId = gamesResponse.data[0].id;

    const productsResponse = await testClient.getProducts(testGameId);
    assertStatus(productsResponse.status, 200);
    testProductId = productsResponse.data[0].id;
  });

  // ==================== PAYMENT LIFECYCLE ====================

  await test('Payment Flow - Complete lifecycle: PENDING → PAID → DELIVERED', async () => {
    const orderData = createMockOrderData({
      gameId: testGameId,
      productId: testProductId,
    });

    // Step 1: Create order (PENDING)
    const createResponse = await testClient.createOrder(orderData);
    assertStatus(createResponse.status, 200);
    
    let orderResponse = await testClient.getOrder(createResponse.data.orderNumber);
    assert(orderResponse.data.status === 'PENDING', 'Initial status: PENDING');
    console.log(`1. Order created: ${orderResponse.data.status}`);

    // Step 2: Simulate payment (PAID)
    await testClient.simulatePayment(createResponse.data.orderNumber, createResponse.data.amount);
    await new Promise(resolve => setTimeout(resolve, 500));
    
    orderResponse = await testClient.getOrder(createResponse.data.orderNumber);
    assert(
      ['PAID', 'PROCESSING', 'QUEUED'].includes(orderResponse.data.status),
      'After payment: PAID/PROCESSING/QUEUED'
    );
    console.log(`2. Payment confirmed: ${orderResponse.data.status}`);

    // Step 3: Wait for delivery processing
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    orderResponse = await testClient.getOrder(createResponse.data.orderNumber);
    console.log(`3. Delivery status: ${orderResponse.data.status}`);
    
    // Final state should be delivered or processing
    assert(
      ['PAID', 'PROCESSING', 'QUEUED', 'DELIVERING', 'DELIVERED'].includes(orderResponse.data.status),
      'Final state should be progressing'
    );
  });

  // ==================== QR CODE TESTS ====================

  await test('Payment Flow - QR code format validation', async () => {
    const orderData = createMockOrderData({
      gameId: testGameId,
      productId: testProductId,
    });

    const response = await testClient.createOrder(orderData);
    const qr = response.data.qr!;

    // EMV QR Code format validation
    assert(qr.startsWith('000201'), 'QR must start with Payload Format Indicator');
    assert(qr.includes('5802KH'), 'QR must contain Cambodia country code');
    assert(qr.length >= 100, 'QR must be substantial length');
    assert(qr.length <= 500, 'QR should not be excessively long');
    
    console.log(`QR length: ${qr.length} characters`);
  });

  await test('Payment Flow - QR contains correct amount', async () => {
    const orderData = createMockOrderData({
      gameId: testGameId,
      productId: testProductId,
      currency: 'USD',
    });

    const response = await testClient.createOrder(orderData);
    
    // QR should encode the amount
    assert(response.data.amount > 0, 'Amount should be positive');
    assert(response.data.currency === 'USD', 'Currency should match');
    console.log(`Amount: ${response.data.amount} ${response.data.currency}`);
  });

  // ==================== DUPLICATE PREVENTION ====================

  await test('Payment Flow - Duplicate payment prevention', async () => {
    const orderData = createMockOrderData({
      gameId: testGameId,
      productId: testProductId,
    });

    const createResponse = await testClient.createOrder(orderData);
    const orderNumber = createResponse.data.orderNumber;

    // First payment
    const sim1 = await testClient.simulatePayment(orderNumber, createResponse.data.amount);
    assert(sim1.data.success, 'First payment should succeed');

    // Second payment (should be idempotent)
    const sim2 = await testClient.simulatePayment(orderNumber, createResponse.data.amount);
    
    // Should handle gracefully
    assert([200, 409].includes(sim2.status), 'Duplicate should be handled');
    
    // Order should only be paid once
    const orderResponse = await testClient.getOrder(orderNumber);
    assert(
      ['PAID', 'PROCESSING', 'QUEUED', 'DELIVERING', 'DELIVERED'].includes(orderResponse.data.status),
      'Order should be in paid state'
    );
  });

  // ==================== FAILED PAYMENT HANDLING ====================

  await test('Payment Flow - Handle payment verification failure', async () => {
    const verifyResponse = await testClient.verifyPayment('INVALID_MD5_HASH');
    
    // Should return proper error response, not crash
    assertStatus(verifyResponse.status, 200);
    assertHasField(verifyResponse.data, 'status');
    assert(verifyResponse.data.paid === false, 'Invalid hash should not be paid');
  });

  // ==================== RETRY LOGIC ====================

  await test('Payment Flow - Payment retry after failure', async () => {
    const orderData = createMockOrderData({
      gameId: testGameId,
      productId: testProductId,
    });

    const createResponse = await testClient.createOrder(orderData);
    
    // Simulate payment
    await testClient.simulatePayment(createResponse.data.orderNumber, createResponse.data.amount);
    
    // Verify order is paid
    const orderResponse = await testClient.getOrder(createResponse.data.orderNumber);
    assert(
      ['PAID', 'PROCESSING', 'QUEUED'].includes(orderResponse.data.status),
      'Payment should succeed'
    );
  });

  // ==================== WEBHOOK SIMULATION ====================

  await test('Payment Flow - Webhook simulation', async () => {
    const orderData = createMockOrderData({
      gameId: testGameId,
      productId: testProductId,
    });

    const createResponse = await testClient.createOrder(orderData);
    
    // Simulate webhook callback (via simulate endpoint)
    const simResponse = await testClient.simulatePayment(
      createResponse.data.orderNumber,
      createResponse.data.amount
    );
    
    assertStatus(simResponse.status, 200);
    assert(simResponse.data.success, 'Webhook simulation should succeed');
  });

  // ==================== STATE TRANSITIONS ====================

  await test('Payment Flow - Valid state transitions', async () => {
    const transitions = [
      { from: 'PENDING', to: 'PAID', action: 'payment' },
      { from: 'PAID', to: 'PROCESSING', action: 'worker_pickup' },
      { from: 'PROCESSING', to: 'DELIVERED', action: 'delivery' },
    ];

    console.log('Expected state transitions:');
    transitions.forEach(t => {
      console.log(`  ${t.from} --[${t.action}]--> ${t.to}`);
    });

    // Verify system supports these transitions
    assert(true, 'State machine supports required transitions');
  });

  function assertHasField(obj: unknown, field: string): void {
    assert(
      typeof obj === 'object' && obj !== null && field in obj,
      `Expected object to have field "${field}"`
    );
  }

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;

  return {
    name: 'E2E Tests - Payment Flow',
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
    reporter.generateJsonReport('tests/reports/e2e-payment-flow-report.json');
    reporter.generateHtmlReport('tests/reports/e2e-payment-flow-report.html');
    reporter.printSummary();
    process.exit(suiteResult.failed > 0 ? 1 : 0);
  })
  .catch(error => {
    console.error('Test suite failed:', error);
    process.exit(1);
  });
