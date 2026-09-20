// k6-tests/test-payment.js
// Load test for payment flow (Bakong KHQR)

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { BASE_URL, THRESHOLDS } from './config.js';

export const options = {
  stages: [
    { duration: '30s', target: 5 },
    { duration: '1m', target: 20 },
    { duration: '2m', target: 50 },
    { duration: '1m', target: 50 },
    { duration: '1m', target: 20 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    ...THRESHOLDS,
    'http_req_duration{name:/api/orders}': ['p(95)<1500'],
    'http_req_duration{name:/api/payment/webhook/bakong}': ['p(95)<2000'],
  },
};

const TEST_ORDER_DATA = {
  gameId: 'test-game-1',
  productId: 'test-product-1',
  playerId: '123456789',
  playerServer: '1000',
  email: 'test@example.com',
  amount: 10.00,
};

export default function () {
  const vuId = __VU;
  const email = `testuser${vuId}_${Date.now()}@example.com`;

  group('Create Order', function () {
    const orderRes = http.post(
      `${BASE_URL}/api/orders`,
      JSON.stringify(TEST_ORDER_DATA),
      {
        headers: { 'Content-Type': 'application/json' },
        tags: { name: '/api/orders' },
      }
    );

    const orderSuccess = check(orderRes, {
      'order created status 201': (r) => r.status === 201,
      'order has orderNumber': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.orderNumber !== undefined;
        } catch {
          return false;
        }
      },
    });

    if (!orderSuccess) {
      console.error(`[FAIL] Create Order: ${orderRes.status} - ${orderRes.body}`);
      return;
    }

    let orderNumber;
    try {
      const body = JSON.parse(orderRes.body);
      orderNumber = body.orderNumber;
    } catch {
      console.error('[FAIL] Could not parse order response');
      return;
    }

    sleep(1);

    group('Verify Payment', function () {
      const verifyRes = http.post(
        `${BASE_URL}/api/orders/${orderNumber}`,
        JSON.stringify({ action: 'verify_payment' }),
        {
          headers: { 'Content-Type': 'application/json' },
          tags: { name: '/api/orders/[orderNumber]' },
        }
      );

      check(verifyRes, {
        'verify payment status < 400': (r) => r.status < 400,
      });
    });

    sleep(2);

    group('Simulate Webhook (if enabled)', function () {
      const webhookRes = http.post(
        `${BASE_URL}/api/payment/webhook/bakong`,
        JSON.stringify({
          orderNumber: orderNumber,
          status: 'SUCCESS',
          transactionId: `TXN_${Date.now()}_${vuId}`,
        }),
        {
          headers: { 'Content-Type': 'application/json' },
          tags: { name: '/api/payment/webhook/bakong' },
        }
      );

      check(webhookRes, {
        'webhook processed': (r) => r.status === 200 || r.status === 202,
      });
    });
  });

  sleep(Math.random() * 5 + 3);
}
