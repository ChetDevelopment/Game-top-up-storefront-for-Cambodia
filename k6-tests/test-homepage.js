// k6-tests/test-homepage.js
// Load test for homepage and public endpoints

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { BASE_URL, THRESHOLDS } from './config.js';

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m', target: 50 },
    { duration: '2m', target: 100 },
    { duration: '2m', target: 100 },
    { duration: '1m', target: 50 },
    { duration: '30s', target: 0 },
  ],
  thresholds: THRESHOLDS,
  ext: {
    loadimpact: {
      projectID: undefined,
      name: 'Homepage Load Test',
    },
  },
};

const PUBLIC_ENDPOINTS = [
  { path: '/', name: 'Homepage' },
  { path: '/api/games', name: 'Games List' },
  { path: '/api/banners', name: 'Banners' },
  { path: '/api/faqs', name: 'FAQs' },
  { path: '/api/bundles', name: 'Bundles' },
  { path: '/api/orders/recent', name: 'Recent Orders' },
];

export default function () {
  const vuId = __VU;
  const iterId = __ITER;

  group('Homepage and Public APIs', function () {
    PUBLIC_ENDPOINTS.forEach(({ path, name }) => {
      const res = http.get(`${BASE_URL}${path}`, {
        tags: { name: path },
      });

      const success = check(res, {
        [`${name} status 200`]: (r) => r.status === 200,
        [`${name} response time < 1000ms`]: (r) => r.timings.duration < 1000,
        [`${name} has content`]: (r) => r.body && r.body.length > 0,
      });

      if (!success) {
        console.error(`[FAIL] ${name}: ${res.status} - ${res.timings.duration}ms`);
      } else if (res.timings.duration > 1000) {
        console.warn(`[SLOW] ${name}: ${res.timings.duration}ms`);
      }
    });
  });

  sleep(Math.random() * 3 + 2);
}
