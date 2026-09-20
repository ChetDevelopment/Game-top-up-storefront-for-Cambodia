// k6-tests/test-security.js
// Security tests: rate limiting, abuse detection, repeated requests

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { BASE_URL } from './config.js';

export const options = {
  stages: [
    { duration: '10s', target: 1 },
    { duration: '30s', target: 1 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    'http_req_duration': ['p(95)<2000'],
  },
};

const RATE_LIMIT_TEST_ENDPOINTS = [
  { path: '/api/games', method: 'GET', name: 'Games (Rate Limit)' },
  { path: '/api/promo-codes/validate', method: 'POST', name: 'Promo Validate (Rate Limit)', body: { code: 'TEST123' } },
  { path: '/api/user/auth/login', method: 'POST', name: 'Login (Brute Force)', body: { email: 'test@example.com', password: 'wrong' } },
  { path: '/api/games/check-id', method: 'POST', name: 'Check ID (Abuse)', body: { game: 'mobile-legends', playerId: '123456' } },
];

export default function () {
  const vuId = __VU;
  const endpoint = RATE_LIMIT_TEST_ENDPOINTS[vuId % RATE_LIMIT_TEST_ENDPOINTS.length];

  group(`Security Test: ${endpoint.name}`, function () {
    const REQUEST_COUNT = 30;
    let rateLimitedCount = 0;
    let successCount = 0;

    console.log(`[SECURITY] Starting rate limit test for ${endpoint.path} - ${REQUEST_COUNT} rapid requests`);

    for (let i = 0; i < REQUEST_COUNT; i++) {
      let res;

      if (endpoint.method === 'GET') {
        res = http.get(`${BASE_URL}${endpoint.path}`, {
          tags: { name: endpoint.name },
        });
      } else {
        res = http.post(
          `${BASE_URL}${endpoint.path}`,
          JSON.stringify(endpoint.body || {}),
          {
            headers: { 'Content-Type': 'application/json' },
            tags: { name: endpoint.name },
          }
        );
      }

      if (res.status === 429) {
        rateLimitedCount++;
        if (rateLimitedCount === 1) {
          console.log(`[SECURITY] Rate limit triggered after ${i + 1} requests for ${endpoint.path}`);
        }
      } else if (res.status < 400) {
        successCount++;
      }

      sleep(0.05);
    }

    console.log(`[SECURITY] Results for ${endpoint.path}: ${successCount} success, ${rateLimitedCount} rate limited (429)`);

    check(null, {
      'rate limiting is active': () => rateLimitedCount > 0,
      'not all requests succeeded': () => successCount < REQUEST_COUNT,
    });

    if (rateLimitedCount === 0) {
      console.warn(`[SECURITY WARNING] No rate limiting detected for ${endpoint.path}! This endpoint may be vulnerable to abuse.`);
    }
  });

  sleep(1);
}
