# k6 Load Testing Suite - Ty Khai TopUp

## Prerequisites
1. Install k6: https://k6.io/docs/getting-started/installation/
   - Windows: `choco install k6` (Chocolatey) or download from https://github.com/grafana/k6/releases
2. Set your deployment URL:
   ```powershell
   $env:BASE_URL="https://your-vercel-app.vercel.app"
   ```

## Test Scripts

| Script | Purpose | Run Command |
|--------|---------|-------------|
| `test-homepage.js` | Public endpoints performance | `k6 run test-homepage.js` |
| `test-payment.js` | Payment flow simulation | `k6 run test-payment.js` |
| `test-order-flow.js` | Full user journey | `k6 run test-order-flow.js` |
| `test-api-stress.js` | API breaking point test | `k6 run test-api-stress.js` |
| `test-security.js` | Rate limiting & abuse checks | `k6 run test-security.js` |

## Load Profiles
All scripts use gradual ramp-up to avoid DDoS-like spikes:
- **Homepage**: 10 → 50 → 100 users
- **Payment/Order**: 5 → 20 → 50 users (lower due to stateful operations)
- **Stress Test**: 50 → 400 users (finds breaking point)

## Key Features
- Response validation (status codes, body checks)
- Error logging for failed requests
- Slow endpoint detection (>1000ms warnings)
- Rate limit testing (429 status checks)
- Realistic user delays (sleep timers)

---

## Bonus: Optimization Suggestions

### Rate Limiting Strategy
Implement per-IP and per-endpoint limits:
- Public APIs (games, banners): 60 requests/min
- Order creation: 10 requests/min/IP
- Payment endpoints: 5 requests/min/IP
- Use Vercel KV (Redis) for distributed rate limit counters

### Backend Optimizations
1. **Database**:
   - Add indexes: `orderNumber`, `gameId`, `playerId` in Prisma schema
   - Use selective field queries (`select: { id, status }`) to reduce payload
2. **Caching**:
   - Cache `/api/games`, `/api/banners` with Next.js ISR (5000s revalidation)
   - Use Vercel Edge Cache for public GET endpoints
3. **Serverless**:
   - Minimize API route bundle size (remove unused imports)
   - Use async queues (Vercel Queue) for Bakong webhook processing
4. **Monitoring**:
   - Add Vercel Metrics or Grafana Cloud for k6 result visualization
   - Set up alerts for >1% error rate or p95 latency >1s

### Test-Driven Improvements
- If `test-security.js` shows no 429s: **Implement rate limiting immediately**
- If `test-api-stress.js` shows >5% error rate at 200 users: **Scale database connections or add caching**
- If payment flow fails at 50 users: **Check Bakong API timeout settings and add retry logic**

---

## Notes
- Replace `your-vercel-app.vercel.app` with your actual deployment URL
- Use staging environment for load tests, not production
- Adjust test data (game IDs, product IDs) to match your staging dataset
