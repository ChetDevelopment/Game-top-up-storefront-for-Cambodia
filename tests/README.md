# Automated Testing Framework

Complete end-to-end automated testing system for Ty Khai TopUp platform.

## 🎯 Coverage

### API Tests
- **Orders API** - Order creation, retrieval, validation
- **Payment API** - QR generation, payment simulation, verification
- **Admin API** - Dashboard, order management, refunds, audit logs

### E2E Tests
- **User Flow** - Browse → Select → Order → Pay → Deliver
- **Payment Flow** - Complete payment lifecycle

### Integration Tests
- **Order-Payment-Delivery** - Component integration
- **Database Integrity** - Consistency, duplicates, calculations

## 🚀 Quick Start

### Prerequisites
```bash
# Install dependencies
npm install

# Setup test environment
cp tests/.env.example tests/.env
```

### Run Tests

```bash
# Run all tests
npm run test:all

# Run specific test suites
npm run test:api        # All API tests
npm run test:api:orders # Orders API only
npm run test:api:payment # Payment API only
npm run test:api:admin  # Admin API only

npm run test:e2e        # All E2E tests
npm run test:e2e:user   # User flow tests
npm run test:e2e:payment # Payment flow tests

npm run test:integration # All integration tests
npm run test:db         # Database integrity tests

# Run with filter
npm run test:all -- API    # Run tests matching "API"
npm run test:all -- Payment # Run tests matching "Payment"
```

## 📊 Test Reports

Reports are generated in `tests/reports/`:

- **HTML Reports** - Visual test results with pass/fail status
- **JSON Reports** - Machine-readable results for CI/CD
- **Summary Report** - Combined test run summary

View reports:
```bash
# Open HTML report
open tests/reports/api-orders-report.html
open tests/reports/e2e-user-flow-report.html
```

## 🏗️ Architecture

```
tests/
├── api/                    # API endpoint tests
│   ├── orders.test.ts      # Order CRUD operations
│   ├── payment.test.ts     # Payment flows
│   └── admin.test.ts       # Admin panel APIs
├── e2e/                    # End-to-end tests
│   ├── user-flow.test.ts   # Complete user journey
│   └── payment-flow.test.ts # Payment lifecycle
├── integration/            # Integration tests
│   ├── order-payment-delivery.test.ts
│   └── db-integrity.test.ts
├── utils/                  # Test utilities
│   ├── test-client.ts      # API test client
│   ├── mock-data.ts        # Test data generators
│   └── test-reporter.ts    # Report generation
├── reports/                # Generated reports
│   ├── *.html              # HTML reports
│   └── *.json              # JSON reports
└── run-all.ts              # Master test runner
```

## 🧪 Test Scenarios

### User Flow Tests
1. Browse games catalog
2. Select product
3. Create order with player details
4. Receive QR code (<2 seconds)
5. Simulate payment
6. Verify order status update
7. Confirm delivery

### Admin Panel Tests
1. Admin authentication
2. View dashboard statistics
3. List and filter orders
4. Search orders
5. Process refunds
6. View audit logs
7. Manage games/products

### Payment System Tests
1. QR generation (never null)
2. QR format validation (EMV-compliant)
3. Payment simulation
4. Duplicate payment prevention
5. Payment verification
6. State transitions: PENDING → PAID → DELIVERED
7. Failed payment handling

### Database Integrity Tests
1. No duplicate order numbers
2. No duplicate payment references
3. No orphan payment logs
4. Revenue calculation accuracy
5. Order state consistency
6. Idempotency enforcement
7. Foreign key integrity

## 🔧 Configuration

### Environment Variables

Create `tests/.env`:

```bash
TEST_BASE_URL=http://localhost:3000
TEST_ADMIN_EMAIL=admin@tykhai.com
TEST_ADMIN_PASSWORD=admin123
PAYMENT_SIMULATION_MODE=true
DATABASE_URL=postgresql://...
```

### Test Modes

- **Simulation Mode**: Uses mock payment QR codes (safe for testing)
- **Production Mode**: Uses real payment APIs (use with caution)

## 📈 CI/CD Integration

### GitHub Actions Example

```yaml
name: Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - run: npm ci
      - run: npm run build
      
      - name: Run Tests
        run: npm run test:all
        env:
          TEST_BASE_URL: http://localhost:3000
          PAYMENT_SIMULATION_MODE: true
      
      - name: Upload Reports
        uses: actions/upload-artifact@v3
        with:
          name: test-reports
          path: tests/reports/
```

### GitLab CI Example

```yaml
test:
  stage: test
  image: node:20
  script:
    - npm ci
    - npm run build
    - npm run test:all
  artifacts:
    paths:
      - tests/reports/
    reports:
      junit: tests/reports/junit.xml
```

## ✅ Validation Rules

Every test validates:
- ✓ HTTP status code
- ✓ Response structure
- ✓ Database state change
- ✓ No duplicate execution
- ✓ Correct final order state

## 🛠️ Utilities

### Test Client

```typescript
import { testClient } from './utils/test-client';

// Create order
const response = await testClient.createOrder({
  gameId: '...',
  productId: '...',
  playerUid: '123456',
  customerEmail: 'test@example.com',
  paymentMethod: 'BAKONG',
  currency: 'USD',
});

// Simulate payment
await testClient.simulatePayment(orderNumber, amount);

// Admin login
await testClient.adminLogin();

// Get orders
const orders = await testClient.getAdminOrders({ status: 'PENDING' });
```

### Mock Data

```typescript
import { createMockOrderData, generateTestEmail } from './utils/mock-data';

const orderData = createMockOrderData({
  gameId: '...',
  productId: '...',
  customerEmail: generateTestEmail(),
});
```

## 📝 Writing New Tests

```typescript
import { testClient } from '../utils/test-client';
import { TestReporter, TestResult, TestSuiteResult } from '../utils/test-reporter';

const reporter = new TestReporter();

async function runTests(): Promise<TestSuiteResult> {
  const results: TestResult[] = [];
  
  async function test(name: string, fn: () => Promise<void>): Promise<void> {
    const start = Date.now();
    try {
      await fn();
      results.push({ name, status: 'PASS', duration: Date.now() - start, timestamp: new Date().toISOString() });
    } catch (error) {
      results.push({ name, status: 'FAIL', duration: Date.now() - start, error: error.message, timestamp: new Date().toISOString() });
    }
  }
  
  await test('should do something', async () => {
    const response = await testClient.getGames();
    if (response.status !== 200) throw new Error('Failed');
  });
  
  return {
    name: 'My Test Suite',
    results,
    totalTests: results.length,
    passed: results.filter(r => r.status === 'PASS').length,
    failed: results.filter(r => r.status === 'FAIL').length,
    skipped: 0,
    duration: Date.now() - startTime,
    timestamp: new Date().toISOString(),
  };
}
```

## 🎯 Goals

- **Zero Manual Testing**: All flows automated
- **CI/CD Ready**: Run with one command
- **Production Safe**: Uses test database and simulation mode
- **Comprehensive Coverage**: API + E2E + Integration + DB
- **Fast Feedback**: Tests complete in <5 minutes
- **Clear Reports**: HTML + JSON output

## 📞 Support

For issues or questions about the testing framework, check:
- Test logs in `tests/reports/`
- Console output during test runs
- Source code in `tests/utils/`
