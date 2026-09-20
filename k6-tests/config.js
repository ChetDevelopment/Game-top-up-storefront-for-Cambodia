// k6-tests/config.js
// Shared configuration for all k6 tests

export const BASE_URL = __ENV.BASE_URL || 'https://your-vercel-app.vercel.app';

export const THRESHOLDS = {
  'http_req_duration': ['p(95)<1000'],
  'http_req_failed': ['rate<0.01'],
};

export const RATE_LIMIT_THRESHOLDS = {
  'http_req_duration': ['p(95)<2000'],
  'http_req_failed': ['rate<0.05'],
};

export function checkResponse(res, expectedStatus = 200, checkBody = null) {
  const checks = {
    [`status is ${expectedStatus}`]: (r) => r.status === expectedStatus,
    'response time < 1000ms': (r) => r.timings.duration < 1000,
  };

  if (checkBody) {
    checks['body valid'] = (r) => {
      try {
        const body = JSON.parse(r.body);
        return checkBody(body);
      } catch {
        return false;
      }
    };
  }

  return checks;
}

export function logError(res, label) {
  if (res.status >= 400) {
    console.error(`[ERROR] ${label}: ${res.status} - ${res.body}`);
  } else if (res.timings.duration > 1000) {
    console.warn(`[SLOW] ${label}: ${res.timings.duration}ms`);
  }
}

export function getHeaders(token = null) {
  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'k6-load-test',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}
