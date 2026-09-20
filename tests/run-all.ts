/**
 * Master Test Runner
 * Runs all test suites and generates combined report
 */

import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

const TEST_DIR = path.join(__dirname);
const REPORTS_DIR = path.join(TEST_DIR, 'reports');

interface TestSuite {
  name: string;
  file: string;
  enabled: boolean;
}

const TEST_SUITES: TestSuite[] = [
  // API Tests
  { name: 'API - Orders', file: 'api/orders.test.ts', enabled: true },
  { name: 'API - Payment', file: 'api/payment.test.ts', enabled: true },
  { name: 'API - Admin', file: 'api/admin.test.ts', enabled: true },
  
  // E2E Tests
  { name: 'E2E - User Flow', file: 'e2e/user-flow.test.ts', enabled: true },
  { name: 'E2E - Payment Flow', file: 'e2e/payment-flow.test.ts', enabled: true },
  
  // Integration Tests
  { name: 'Integration - Order/Payment/Delivery', file: 'integration/order-payment-delivery.test.ts', enabled: true },
  { name: 'Integration - DB Integrity', file: 'integration/db-integrity.test.ts', enabled: true },
];

function runTest(suite: TestSuite): Promise<{ name: string; success: boolean; duration: number }> {
  return new Promise((resolve) => {
    console.log(`\n🧪 Running: ${suite.name}`);
    console.log('─'.repeat(60));
    
    const startTime = Date.now();
    const filePath = path.join(TEST_DIR, suite.file);
    
    const proc = spawn('tsx', [filePath], {
      stdio: 'inherit',
      env: { ...process.env },
    });
    
    proc.on('close', (code) => {
      const duration = Date.now() - startTime;
      const success = code === 0;
      
      if (success) {
        console.log(`✅ ${suite.name} passed (${(duration / 1000).toFixed(2)}s)`);
      } else {
        console.log(`❌ ${suite.name} failed (${(duration / 1000).toFixed(2)}s)`);
      }
      
      resolve({ name: suite.name, success, duration });
    });
    
    proc.on('error', (error) => {
      console.error(`Error running ${suite.name}:`, error.message);
      resolve({ name: suite.name, success: false, duration: Date.now() - startTime });
    });
  });
}

async function runAllTests(filter?: string): Promise<void> {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║     Ty Khai TopUp - Automated Testing Framework          ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`\n📅 Started: ${new Date().toLocaleString()}`);
  console.log(`🌐 Base URL: ${process.env.TEST_BASE_URL || 'http://localhost:3000'}`);
  console.log(`🔧 Filter: ${filter || 'All tests'}`);
  
  // Ensure reports directory exists
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }
  
  const suitesToRun = TEST_SUITES.filter(s => s.enabled && (!filter || s.name.toLowerCase().includes(filter.toLowerCase())));
  
  if (suitesToRun.length === 0) {
    console.log('\n⚠️  No tests matched the filter');
    process.exit(1);
  }
  
  console.log(`\n📋 Running ${suitesToRun.length} test suite(s):\n`);
  suitesToRun.forEach(s => console.log(`   • ${s.name}`));
  console.log();
  
  const results: Array<{ name: string; success: boolean; duration: number }> = [];
  
  for (const suite of suitesToRun) {
    const result = await runTest(suite);
    results.push(result);
  }
  
  // Summary
  const totalTests = results.length;
  const passed = results.filter(r => r.success).length;
  const failed = totalTests - passed;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
  
  console.log('\n' + '═'.repeat(60));
  console.log('📊 FINAL SUMMARY');
  console.log('═'.repeat(60));
  console.log(`Total Suites:  ${totalTests}`);
  console.log(`Passed:        ${passed} (${((passed / totalTests) * 100).toFixed(1)}%)`);
  console.log(`Failed:        ${failed}`);
  console.log(`Total Time:    ${(totalDuration / 1000).toFixed(2)}s`);
  console.log('═'.repeat(60));
  
  if (failed > 0) {
    console.log('\n❌ FAILED SUITES:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`   • ${r.name}`);
    });
  }
  
  console.log('\n📁 Reports saved to: tests/reports/');
  console.log('═'.repeat(60) + '\n');
  
  // Generate combined report summary
  const summaryPath = path.join(REPORTS_DIR, 'test-summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    totalSuites: totalTests,
    passed,
    failed,
    totalDuration,
    results,
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      baseUrl: process.env.TEST_BASE_URL || 'http://localhost:3000',
    },
  }, null, 2));
  
  process.exit(failed > 0 ? 1 : 0);
}

// Parse command line arguments
const args = process.argv.slice(2);
const filter = args.find(a => !a.startsWith('-')) || undefined;
const help = args.includes('-h') || args.includes('--help');

if (help) {
  console.log(`
Ty Khai TopUp Test Runner

Usage: tsx tests/run-all.ts [filter] [options]

Options:
  -h, --help     Show this help message
  filter         Run only tests matching this string

Examples:
  tsx tests/run-all.ts              # Run all tests
  tsx tests/run-all.ts API          # Run only API tests
  tsx tests/run-all.ts Payment      # Run tests with "Payment" in name
`);
  process.exit(0);
}

runAllTests(filter).catch(error => {
  console.error('Test runner failed:', error);
  process.exit(1);
});
