// k6-tests/test-api-stress.js
// Stress test for API endpoints - ramp up to find breaking point

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { BASE_URL, THRESHOLDS } from './config.js';

export const options = {
  stages: [
    { duration: '1m', target: 50 },
    { duration: '2m', target: 100 },
    { duration: '3m', target: 200 },
    { duration: '3m', target: 300 },
    { duration: '2m', target: 400 },
    { duration: '2m', target: 400 },
    { duration: '2m', target: 200 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    'http_req_failed': ['rate<0.05'],
    'http_req_duration': ['p(95)<2000'],
  },
  ext: {
    loadimpact: {
      projectID: undefined,
      name: 'API Stress Test',
    },
  },
};

const API_ENDPOINTS = [
  { method: 'GET', path: '/api/games', weight: 30 },
  { method: 'GET', path: '/api/products?gameId=mobile-legends', weight: 25 },
  { method: 'GET', path: '/api/banners', weight: 15 },
  { method: 'GET', path: '/api/faqs', weight: 10 },
  { method: 'GET', path: '/api/bundles', weight: 10 },
  { method: 'POST', path: '/api/orders/lookup', weight: 5, body: { email: 'test@example.com' } },
  { method: 'POST', path: '/api/games/check-id', weight: 5, body: { game: 'mobile-legends', playerId: '123456' } },
];

function getRandomEndpoint() {
  const totalWeight = API_ENDPOINTS.reduce((sum, e) => sum + e.weight, 0);
  let random = Math.random() * totalWeight;
  for (const endpoint of API_ENDPOINTS) {
    random -= endpoint.weight;
    if (random <= 0) return endpoint;
  }
  return API_ENDPOINTS[0];
}

export default function () {
  const endpoint = getRandomEndpoint();
  const vuId = __VU;

  group(`API: ${endpoint.path}`, function () {
    let res;

    if (endpoint.method === 'GET') {
      res = http.get(`${BASE_URL}${endpoint.path}`, {
        tags: { name: endpoint.path },
      });
    } else {
      res = http.post(
        `${BASE_URL}${endpoint.path}`,
        JSON.stringify(endpoint.body || {}),
        {
          headers: { 'Content-Type': 'application/json' },
          tags: { name: endpoint.path },
        }
      );
    }

    const success = check(res, {
      'status < 400': (r) => r.status < 400,
      'response time < 2000ms': (r) => r.timings.duration < 2000,
    });

    if (!success) {
      const errorMsg = `[STRESS FAIL] ${endpoint.method} ${endpoint.path}: ${res.status} - ${res.timings.duration}ms`;
      if (res.status >= 500) {
        console.error(errorMsg);
      } else if (res.status === 429) {
        console.warn(`[RATE LIMITED] ${endpoint.path} - Rate limit hit`);
      } else {
        console.warn(errorMsg);
      }
    } else if (res.timings.duration > 1500) {
      console.warn(`[SLOW] ${endpoint.path}: ${res.timings.duration}ms`);
    }
  });

  sleep(Math.random() * 2 + 0.5);
}
