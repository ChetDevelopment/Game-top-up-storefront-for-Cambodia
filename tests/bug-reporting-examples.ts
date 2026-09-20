/**
 * Bug Detection & Error Reporting Examples
 * 
 * This file demonstrates how the testing framework automatically
 * captures and reports bugs, errors, and failures.
 */

// ==================== ERROR CAPTURE EXAMPLES ====================

/**
 * Example 1: API Response Error
 * When an API returns unexpected status code
 */
async function exampleApiError() {
  try {
    const response = await fetch('http://localhost:3000/api/orders', {
      method: 'POST',
      body: JSON.stringify({ invalid: 'data' }),
    });

    if (response.status !== 200) {
      throw {
        type: 'HTTP_ERROR',
        message: `Expected status 200, got ${response.status}`,
        response: {
          status: response.status,
          data: await response.json(),
          headers: Object.fromEntries(response.headers.entries()),
        },
        request: {
          url: 'http://localhost:3000/api/orders',
          method: 'POST',
          body: { invalid: 'data' },
        },
      };
    }
  } catch (error) {
    // Error captured with full context
    console.error('Test failed:', error);
  }
}

/**
 * Example 2: Database Connection Error
 * Critical error that blocks testing
 */
async function exampleDatabaseError() {
  try {
    // Simulated DB connection
    throw {
      type: 'DATABASE_ERROR',
      message: 'Cannot connect to database',
      code: 'ECONNREFUSED',
      stack: new Error().stack,
    };
  } catch (error) {
    // Marked as CRITICAL in report
    console.error('Critical error:', error);
  }
}

/**
 * Example 3: Assertion Failure
 * Common test failure
 */
async function exampleAssertionFailure() {
  const expected = 'PAID';
  const actual = 'PENDING';

  if (actual !== expected) {
    throw {
      type: 'ASSERTION_ERROR',
      message: `Expected status "${expected}", got "${actual}"`,
      expected,
      actual,
      stack: new Error().stack,
    };
  }
}

/**
 * Example 4: Timeout Error
 * Operation took too long
 */
async function exampleTimeoutError() {
  const timeout = 5000;
  const startTime = Date.now();

  // Simulated slow operation
  await new Promise(resolve => setTimeout(resolve, 6000));

  if (Date.now() - startTime > timeout) {
    throw {
      type: 'TIMEOUT',
      message: `Operation timed out after ${Date.now() - startTime}ms (limit: ${timeout}ms)`,
      duration: Date.now() - startTime,
      timeout,
    };
  }
}

/**
 * Example 5: Validation Error
 * Data validation failed
 */
async function exampleValidationError() {
  const orderData = {
    playerUid: 'ab', // Too short
    customerEmail: 'invalid', // Invalid format
  };

  const errors: string[] = [];
  
  if (orderData.playerUid.length < 6) {
    errors.push('playerUid must be at least 6 characters');
  }
  
  if (!orderData.customerEmail.includes('@')) {
    errors.push('customerEmail must be valid email');
  }

  if (errors.length > 0) {
    throw {
      type: 'VALIDATION_ERROR',
      message: 'Data validation failed',
      errors,
      data: orderData,
    };
  }
}

// ==================== ERROR REPORTING OUTPUT ====================

/**
 * Console Output Example:
 * 
 * ======================================================================
 * 📊 TEST SUMMARY
 * ======================================================================
 * Total Tests:  88
 * Passed:       85 (96.6%)
 * Failed:       3
 * Skipped:      0
 * Duration:     78.45s
 * 
 * ----------------------------------------------------------------------
 * 🚨 ERRORS DETECTED
 * ----------------------------------------------------------------------
 * Total Errors:     3
 * Critical Errors:  1
 * 
 * Error Types:
 *   • HTTP_ERROR: 1
 *   • ASSERTION_ERROR: 1
 *   • DATABASE_ERROR: 1
 * 
 * ⚠️  CRITICAL ERRORS (Immediate Action Required):
 *   1. Cannot connect to database
 * 
 * ----------------------------------------------------------------------
 * ❌ FAILED TESTS:
 * ----------------------------------------------------------------------
 *   • API - Orders
 *     Test: POST /api/orders - should create order
 *     Error: Expected status 200, got 500
 *     Type: HTTP_ERROR
 * 
 *   • API - Payment
 *     Test: QR generation - must never return null
 *     Error: QR code must not be null
 *     Type: ASSERTION_ERROR
 * 
 *   • Integration - DB Integrity
 *     Test: DB Integrity - No duplicate order numbers
 *     Error: Cannot connect to database
 *     Type: DATABASE_ERROR
 * 
 * ======================================================================
 * 
 * 📁 Reports saved to:
 *    • tests/reports/*.html  (Visual reports)
 *    • tests/reports/*.json  (Machine-readable)
 *    • tests/reports/error-log.txt  (Error details)
 * ======================================================================
 */

// ==================== HTML REPORT FEATURES ====================

/**
 * HTML Report Shows:
 * 
 * 1. ERROR SUMMARY BOX (Red Alert)
 *    - Total error count
 *    - Error type breakdown
 *    - Critical error warnings
 * 
 * 2. PER-TEST ERROR DETAILS
 *    - Error message (highlighted in red)
 *    - Error type badge
 *    - Expandable stack trace
 *    - Expandable request/response details
 * 
 * 3. VISUAL INDICATORS
 *    - ✓ Green circle for PASS
 *    - ✗ Red circle for FAIL
 *    - ○ Yellow circle for SKIP
 * 
 * 4. ERROR LOG FILE
 *    - Plain text format
 *    - Timestamp for each error
 *    - Full error context
 *    - Stack traces
 */

// ==================== ERROR LOG FILE FORMAT ====================

/**
 * tests/reports/error-log.txt
 * 
 * [2026-05-05T09:30:15.123Z] API - Orders - POST /api/orders - should create order
 *   Type: HTTP_ERROR
 *   Message: Expected status 200, got 500
 *   Stack: Error: Expected status 200, got 500
 *     at test (tests/api/orders.test.ts:45:11)
 *     at async runTests (tests/api/orders.test.ts:120:3)
 *   Response: {"status":500,"data":{"error":"Internal server error"}}
 *   Request: {"url":"/api/orders","method":"POST","body":{"gameId":"abc"}}
 * 
 * [2026-05-05T09:30:18.456Z] API - Payment - QR generation - must never return null
 *   Type: ASSERTION_ERROR
 *   Message: QR code must not be null
 *   Stack: Error: QR code must not be null
 *     at test (tests/api/payment.test.ts:67:5)
 *     at async runTests (tests/api/payment.test.ts:150:3)
 * 
 * [2026-05-05T09:30:22.789Z] Integration - DB Integrity - No duplicate order numbers
 *   Type: DATABASE_ERROR
 *   Message: Cannot connect to database
 *   Code: ECONNREFUSED
 *   Stack: Error: Cannot connect to database
 *     at createDatabaseConnection (tests/utils/db.ts:23:11)
 */

// ==================== INTEGRATION WITH CI/CD ====================

/**
 * GitHub Actions parses test results:
 * 
 * - name: Run Tests
 *   run: npm run test:all
 *   
 * - name: Upload Error Report
 *   if: failure()
 *   uses: actions/upload-artifact@v4
 *   with:
 *     name: error-logs
 *     path: tests/reports/error-log.txt
 * 
 * - name: Notify on Failure
 *   if: failure()
 *   run: |
 *     echo "Tests failed! Check error log:"
 *     cat tests/reports/error-log.txt
 */

export {
  exampleApiError,
  exampleDatabaseError,
  exampleAssertionFailure,
  exampleTimeoutError,
  exampleValidationError,
};
