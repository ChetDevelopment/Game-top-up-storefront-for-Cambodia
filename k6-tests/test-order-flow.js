// k6-tests/test-order-flow.js
// Full order flow simulation: browse -> create order -> pay -> check status

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { BASE_URL, THRESHOLDS } from './config.js';

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m', target: 30 },
    { duration: '3m', target: 80 },
    { duration: '2m', target: 80 },
    { duration: '1m', target: 30 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    ...THRESHOLDS,
    'http_req_duration{name:Browse Game}': ['p(95)<800'],
    'http_req_duration{name:Create Order}': ['p(95)<1500'],
    'http_req_duration{name:Check Order Status}': ['p(95)<1000'],
  },
};

const GAMES = [
  { id: 'mobile-legends', name: 'Mobile Legends' },
  { id: 'genshin-impact', name: 'Genshin Impact' },
  { id: 'pubg-mobile', name: 'PUBG Mobile' },
];

const PRODUCTS = [
  { id: 'ml-86-diamonds', price: 2.00 },
  { id: 'ml-172-diamonds', price: 4.00 },
  { id: 'gi-60-crystals', price: 10.00 },
];

export default function () {
  const vuId = __VU;
  const iterId = __ITER;

  group('Browse Game', function () {
    const gamesRes = http.get(`${BASE_URL}/api/games`, {
      tags: { name: 'Browse Game' },
    });

    const gamesSuccess = check(gamesRes, {
      'games loaded status 200': (r) => r.status === 200,
      'games has data': (r) => {
        try {
          const body = JSON.parse(r.body);
          return Array.isArray(body) && body.length > 0;
        } catch {
          return false;
        }
      },
    });

    if (!gamesSuccess) {
      console.error(`[FAIL] Browse Game: ${gamesRes.status}`);
      return;
    }

    sleep(Math.random() * 2 + 1);

    const productsRes = http.get(
      `${BASE_URL}/api/products?gameId=${GAMES[vuId % GAMES.length].id}`,
      { tags: { name: 'Browse Products' } }
    );

    check(productsRes, {
      'products loaded': (r) => r.status === 200,
    });

    sleep(Math.random() * 2 + 1);
  });

  group('Create Order', function () {
    const orderData = {
      gameId: GAMES[vuId % GAMES.length].id,
      productId: PRODUCTS[vuId % PRODUCTS.length].id,
      playerId: `PLAYER_${vuId}_${Date.now()}`,
      playerServer: '1000',
      email: `test${vuId}_${iterId}@example.com`,
      amount: PRODUCTS[vuId % PRODUCTS.length].price,
    };

    const orderRes = http.post(
      `${BASE_URL}/api/orders`,
      JSON.stringify(orderData),
      {
        headers: { 'Content-Type': 'application/json' },
        tags: { name: 'Create Order' },
      }
    );

    const orderSuccess = check(orderRes, {
      'order created': (r) => r.status === 201,
      'order has orderNumber': (r) => {
        try {
          return JSON.parse(r.body).orderNumber !== undefined;
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
      orderNumber = JSON.parse(orderRes.body).orderNumber;
    } catch {
      return;
    }

    sleep(2);

    group('Check Order Status', function () {
      const statusRes = http.get(
        `${BASE_URL}/api/orders/${orderNumber}`,
        { tags: { name: 'Check Order Status' } }
      );

      check(statusRes, {
        'order status retrieved': (r) => r.status === 200,
        'order status valid': (r) => {
          try {
            const body = JSON.parse(r.body);
            return body.status !== undefined;
          } catch {
            return false;
          }
        },
      });

      if (statusRes.timings.duration > 1000) {
        console.warn(`[SLOW] Check Order Status: ${statusRes.timings.duration}ms`);
      }
    });

    sleep(Math.random() * 3 + 2);
  });

  sleep(Math.random() * 5 + 3);
}
