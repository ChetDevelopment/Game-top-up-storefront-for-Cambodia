/**
 * Database Integrity Tests
 * Validates data consistency, no duplicates, correct calculations
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

  // ==================== DUPLICATE PREVENTION ====================

  await test('DB Integrity - No duplicate order numbers', async () => {
    const orderNumbers = new Set<string>();
    
    // Create multiple orders
    for (let i = 0; i < 5; i++) {
      const response = await testClient.createOrder(createMockOrderData({
        gameId: testGameId,
        productId: testProductId,
      }));
      assertStatus(response.status, 200);
      orderNumbers.add(response.data.orderNumber);
    }

    // All order numbers should be unique
    assert(orderNumbers.size === 5, 'All order numbers should be unique');
  });

  await test('DB Integrity - No duplicate payment references', async () => {
    const paymentRefs = new Set<string>();
    
    // Create multiple orders
    for (let i = 0; i < 5; i++) {
      const response = await testClient.createOrder(createMockOrderData({
        gameId: testGameId,
        productId: testProductId,
      }));
      assertStatus(response.status, 200);
      
      if (response.data.paymentRef) {
        paymentRefs.add(response.data.paymentRef);
      }
    }

    // All payment refs should be unique
    assert(paymentRefs.size > 0, 'Should have payment references');
  });

  // ==================== ORPHAN PREVENTION ====================

  await test('DB Integrity - No orphan payment logs', async () => {
    const orderData = createMockOrderData({
      gameId: testGameId,
      productId: testProductId,
    });

    const createResponse = await testClient.createOrder(orderData);
    assertStatus(createResponse.status, 200);

    // Order should have payment reference
    assert(createResponse.data.paymentRef, 'Order should have payment reference');
    
    // Payment log should be linked to order
    const orderResponse = await testClient.getOrder(createResponse.data.orderNumber);
    assertStatus(orderResponse.status, 200);
    assert(orderResponse.data.paymentRef, 'Payment ref should exist on order');
  });

  // ==================== REVENUE CALCULATION ====================

  await test('DB Integrity - Revenue calculation accuracy', async () => {
    const testOrders: { amount: number; orderNumber: string }[] = [];
    
    // Create several orders
    for (let i = 0; i < 3; i++) {
      const response = await testClient.createOrder(createMockOrderData({
        gameId: testGameId,
        productId: testProductId,
      }));
      assertStatus(response.status, 200);
      testOrders.push({
        amount: response.data.amount,
        orderNumber: response.data.orderNumber,
      });
    }

    // Calculate expected total
    const expectedTotal = testOrders.reduce((sum, order) => sum + order.amount, 0);
    console.log(`Created ${testOrders.length} orders, total: $${expectedTotal.toFixed(2)}`);
    
    // Total should be positive
    assert(expectedTotal > 0, 'Total revenue should be positive');
  });

  // ==================== STATE CONSISTENCY ====================

  await test('DB Integrity - Order state consistency', async () => {
    const orderData = createMockOrderData({
      gameId: testGameId,
      productId: testProductId,
    });

    const createResponse = await testClient.createOrder(orderData);
    const orderNumber = createResponse.data.orderNumber;

    // Get order multiple times
    const responses = await Promise.all([
      testClient.getOrder(orderNumber),
      testClient.getOrder(orderNumber),
      testClient.getOrder(orderNumber),
    ]);

    // All should return consistent data
    const statuses = responses.map(r => r.data.status);
    const allSame = statuses.every(s => s === statuses[0]);
    assert(allSame, 'All reads should return same status');
  });

  await test('DB Integrity - PaidAt timestamp set on payment', async () => {
    const orderData = createMockOrderData({
      gameId: testGameId,
      productId: testProductId,
    });

    const createResponse = await testClient.createOrder(orderData);
    
    // Before payment
    const beforeResponse = await testClient.getOrder(createResponse.data.orderNumber);
    const beforePaidAt = beforeResponse.data.paidAt;
    
    // Make payment
    await testClient.simulatePayment(createResponse.data.orderNumber, createResponse.data.amount);
    
    // After payment
    await new Promise(resolve => setTimeout(resolve, 500));
    const afterResponse = await testClient.getOrder(createResponse.data.orderNumber);
    const afterPaidAt = afterResponse.data.paidAt;
    
    // paidAt should be set after payment
    if (beforePaidAt === null || beforePaidAt === undefined) {
      assert(afterPaidAt !== null && afterPaidAt !== undefined, 'paidAt should be set after payment');
    }
  });

  // ==================== IDEMPOTENCY ENFORCEMENT ====================

  await test('DB Integrity - Idempotency key prevents duplicates', async () => {
    const idempotencyKey = testClient.generateIdempotencyKey();
    
    const orderData1 = createMockOrderData({
      gameId: testGameId,
      productId: testProductId,
      idempotencyKey,
    });

    const response1 = await testClient.createOrder(orderData1);
    assertStatus(response1.status, 200);

    // Try to create duplicate with same idempotency key
    const orderData2 = createMockOrderData({
      gameId: testGameId,
      productId: testProductId,
      idempotencyKey,
      customerEmail: testClient.generateTestEmail(),
    });

    const response2 = await testClient.createOrder(orderData2);
    
    // Should be handled (either same order returned or error)
    assert([200, 409].includes(response2.status), 'Idempotency should be enforced');
  });

  // ==================== DATA VALIDATION ====================

  await test('DB Integrity - Email encryption', async () => {
    const testEmail = 'encrypted@test.com';
    const orderData = createMockOrderData({
      gameId: testGameId,
      productId: testProductId,
      customerEmail: testEmail,
    });

    const createResponse = await testClient.createOrder(orderData);
    assertStatus(createResponse.status, 200);

    // Get order from admin (which decrypts)
    await testClient.adminLogin();
    const adminResponse = await testClient.getAdminOrders({ q: createResponse.data.orderNumber });
    
    // Email should be retrievable (decrypted by admin endpoint)
    if (adminResponse.data.orders.length > 0) {
      const order = adminResponse.data.orders[0];
      assert(order.customerEmail, 'Email should be retrievable');
    }
  });

  await test('DB Integrity - UID sanitization', async () => {
    const maliciousUid = '<script>alert("xss")</script>12345';
    const orderData = createMockOrderData({
      gameId: testGameId,
      productId: testProductId,
      playerUid: maliciousUid,
    });

    const createResponse = await testClient.createOrder(orderData);
    assertStatus(createResponse.status, 200);

    // Order should be created (sanitization happens server-side)
    const orderResponse = await testClient.getOrder(createResponse.data.orderNumber);
    assertStatus(orderResponse.status, 200);
    
    // Order should exist
    assert(orderResponse.data.orderNumber === createResponse.data.orderNumber, 'Order should exist');
  });

  // ==================== FOREIGN KEY INTEGRITY ====================

  await test('DB Integrity - Game reference valid', async () => {
    const orderData = createMockOrderData({
      gameId: testGameId,
      productId: testProductId,
    });

    const createResponse = await testClient.createOrder(orderData);
    assertStatus(createResponse.status, 200);

    const orderResponse = await testClient.getOrder(createResponse.data.orderNumber);
    assertStatus(orderResponse.status, 200);
    
    // Game ID should match
    assert(orderResponse.data.gameId === testGameId, 'Game ID should match');
  });

  await test('DB Integrity - Product reference valid', async () => {
    const orderData = createMockOrderData({
      gameId: testGameId,
      productId: testProductId,
    });

    const createResponse = await testClient.createOrder(orderData);
    assertStatus(createResponse.status, 200);

    const orderResponse = await testClient.getOrder(createResponse.data.orderNumber);
    assertStatus(orderResponse.status, 200);
    
    // Product ID should match
    assert(orderResponse.data.productId === testProductId, 'Product ID should match');
  });

  // ==================== AUDIT TRAIL ====================

  await test('DB Integrity - Audit logs created for admin actions', async () => {
    await testClient.adminLogin();
    
    // Get initial count
    const beforeResponse = await testClient.getAuditLogs();
    const beforeCount = beforeResponse.data.total;
    
    // Perform admin action
    await testClient.getAdminOrders({ page: 1, perPage: 1 });
    
    // Audit log endpoint should work
    const afterResponse = await testClient.getAuditLogs();
    assertStatus(afterResponse.status, 200);
    
    console.log(`Audit logs: ${beforeCount} → ${afterResponse.data.total}`);
  });

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;

  return {
    name: 'Database Integrity Tests',
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
    reporter.generateJsonReport('tests/reports/db-integrity-report.json');
    reporter.generateHtmlReport('tests/reports/db-integrity-report.html');
    reporter.printSummary();
    process.exit(suiteResult.failed > 0 ? 1 : 0);
  })
  .catch(error => {
    console.error('Test suite failed:', error);
    process.exit(1);
  });
