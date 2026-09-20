/**
 * Enhanced Test Reporter with Detailed Error Logging
 * Captures bugs, errors, stack traces, and timestamps
 */

import * as fs from 'fs';
import * as path from 'path';

export interface TestError {
  message: string;
  stack?: string;
  type: string;
  code?: string;
  response?: {
    status?: number;
    data?: unknown;
    headers?: Record<string, string>;
  };
  request?: {
    url?: string;
    method?: string;
    body?: unknown;
  };
}

export interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  duration: number;
  error?: TestError;
  timestamp: string;
  assertions?: {
    total: number;
    passed: number;
    failed: number;
  };
}

export interface TestSuiteResult {
  name: string;
  results: TestResult[];
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  timestamp: string;
}

export interface TestRunResult {
  suites: TestSuiteResult[];
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  timestamp: string;
  environment: {
    nodeVersion: string;
    platform: string;
    baseUrl: string;
  };
  errors: {
    total: number;
    byType: Record<string, number>;
    critical: TestError[];
  };
}

export class TestReporter {
  private results: TestRunResult = {
    suites: [],
    totalTests: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    duration: 0,
    timestamp: new Date().toISOString(),
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      baseUrl: process.env.TEST_BASE_URL || 'http://localhost:3000',
    },
    errors: {
      total: 0,
      byType: {},
      critical: [],
    },
  };

  private errorLog: Array<{
    timestamp: string;
    suite: string;
    test: string;
    error: TestError;
  }> = [];

  addSuite(suiteResult: TestSuiteResult): void {
    this.results.suites.push(suiteResult);
    this.results.totalTests += suiteResult.totalTests;
    this.results.passed += suiteResult.passed;
    this.results.failed += suiteResult.failed;
    this.results.skipped += suiteResult.skipped;
    this.results.duration += suiteResult.duration;

    // Collect errors
    suiteResult.results.forEach(result => {
      if (result.status === 'FAIL' && result.error) {
        this.results.errors.total++;
        
        const errorType = result.error.type || 'Unknown';
        this.results.errors.byType[errorType] = (this.results.errors.byType[errorType] || 0) + 1;

        // Mark critical errors
        if (this.isCriticalError(result.error)) {
          this.results.errors.critical.push(result.error);
        }

        // Log error with context
        this.errorLog.push({
          timestamp: result.timestamp,
          suite: suiteResult.name,
          test: result.name,
          error: result.error,
        });
      }
    });
  }

  private isCriticalError(error: TestError): boolean {
    if (!error.type && !error.message) return false;
    
    const errorType = (error.type || '').toUpperCase();
    const errorMessage = (error.message || '').toUpperCase();
    
    const criticalPatterns = [
      'DATABASE',
      'CONNECTION',
      'TIMEOUT',
      'CRITICAL',
      'FATAL',
      'UNHANDLED',
    ];
    return criticalPatterns.some(pattern => 
      errorMessage.includes(pattern) ||
      errorType.includes(pattern)
    );
  }

  getResults(): TestRunResult {
    return this.results;
  }

  generateJsonReport(outputPath: string): void {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(outputPath, JSON.stringify(this.results, null, 2));
  }

  generateErrorLog(outputPath: string): void {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const errorLogContent = this.errorLog.map(entry => {
      return `[${entry.timestamp}] ${entry.suite} - ${entry.test}\n` +
        `  Type: ${entry.error.type}\n` +
        `  Message: ${entry.error.message}\n` +
        `  Stack: ${entry.error.stack || 'N/A'}\n` +
        `  ${entry.error.response ? `Response: ${JSON.stringify(entry.error.response)}` : ''}\n` +
        `  ${entry.error.request ? `Request: ${JSON.stringify(entry.error.request)}` : ''}\n`;
    }).join('\n');

    fs.writeFileSync(outputPath, errorLogContent);
  }

  generateHtmlReport(outputPath: string): void {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const html = this.generateHtmlContent();
    fs.writeFileSync(outputPath, html);
  }

  private generateHtmlContent(): string {
    const { suites, totalTests, passed, failed, skipped, duration, timestamp, errors } = this.results;
    const passRate = totalTests > 0 ? ((passed / totalTests) * 100).toFixed(2) : '0';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ty Khai TopUp - Test Report</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; padding: 20px; }
    .container { max-width: 1400px; margin: 0 auto; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px; margin-bottom: 20px; }
    .header h1 { font-size: 28px; margin-bottom: 10px; }
    .header p { opacity: 0.9; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 15px; margin-bottom: 20px; }
    .summary-card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); text-align: center; }
    .summary-card h3 { font-size: 14px; color: #666; margin-bottom: 10px; }
    .summary-card .value { font-size: 32px; font-weight: bold; }
    .summary-card.passed .value { color: #22c55e; }
    .summary-card.failed .value { color: #ef4444; }
    .summary-card.skipped .value { color: #f59e0b; }
    .summary-card.total .value { color: #667eea; }
    .error-summary { background: #fee2e2; border: 2px solid #ef4444; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
    .error-summary h3 { color: #991b1b; margin-bottom: 10px; }
    .error-summary .error-count { font-size: 24px; font-weight: bold; color: #ef4444; }
    .error-types { margin-top: 10px; }
    .error-type { display: inline-block; background: #fecaca; color: #991b1b; padding: 4px 12px; border-radius: 4px; margin: 4px; font-size: 13px; }
    .suite { background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 15px; overflow: hidden; }
    .suite-header { padding: 15px 20px; background: #f8f9fa; border-bottom: 1px solid #e9ecef; display: flex; justify-content: space-between; align-items: center; cursor: pointer; }
    .suite-header h2 { font-size: 18px; color: #333; }
    .suite-stats { display: flex; gap: 15px; font-size: 14px; }
    .suite-stats span { padding: 3px 8px; border-radius: 4px; }
    .suite-stats .pass { background: #dcfce7; color: #166534; }
    .suite-stats .fail { background: #fee2e2; color: #991b1b; }
    .suite-stats .skip { background: #fef3c7; color: #92400e; }
    .suite-body { padding: 10px 20px; }
    .test-result { display: flex; align-items: flex-start; padding: 12px; border-bottom: 1px solid #f0f0f0; }
    .test-result:last-child { border-bottom: none; }
    .test-result .status { width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 12px; font-size: 14px; font-weight: bold; flex-shrink: 0; }
    .test-result .status.pass { background: #22c55e; color: white; }
    .test-result .status.fail { background: #ef4444; color: white; }
    .test-result .status.skip { background: #f59e0b; color: white; }
    .test-result .content { flex: 1; }
    .test-result .name { font-size: 14px; color: #333; font-weight: 500; margin-bottom: 4px; }
    .test-result .duration { font-size: 12px; color: #666; }
    .test-result .error-box { background: #fee2e2; border-left: 3px solid #ef4444; padding: 10px; margin-top: 8px; border-radius: 4px; }
    .test-result .error-message { font-size: 13px; color: #991b1b; font-weight: 500; margin-bottom: 5px; }
    .test-result .error-details { font-size: 12px; color: #7f1d1d; font-family: 'Courier New', monospace; white-space: pre-wrap; word-break: break-word; }
    .test-result .error-stack { font-size: 11px; color: #991b1b; font-family: 'Courier New', monospace; white-space: pre-wrap; word-break: break-word; margin-top: 5px; padding-top: 5px; border-top: 1px solid #fecaca; }
    .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
    .progress-bar { height: 6px; background: #e9ecef; border-radius: 3px; margin-top: 10px; overflow: hidden; }
    .progress-bar .fill { height: 100%; background: linear-gradient(90deg, #22c55e, #22c55e); transition: width 0.3s; }
    details { margin-bottom: 10px; }
    summary { cursor: pointer; padding: 10px; background: #f8f9fa; border-radius: 4px; font-weight: 500; }
    .critical-alert { background: #dc2626; color: white; padding: 15px; border-radius: 8px; margin-bottom: 20px; animation: pulse 2s infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.8; } }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🧪 Ty Khai TopUp - Test Report</h1>
      <p>Generated: ${new Date(timestamp).toLocaleString()}</p>
      <p>Environment: ${this.results.environment.platform} | Node: ${this.results.environment.nodeVersion}</p>
      <div class="progress-bar">
        <div class="fill" style="width: ${passRate}%"></div>
      </div>
    </div>

    ${errors.total > 0 ? `
      <div class="critical-alert">
        ⚠️ <strong>ALERT:</strong> ${errors.total} error(s) detected! ${errors.critical.length > 0 ? `${errors.critical.length} critical error(s) require immediate attention.` : ''}
      </div>
    ` : ''}

    <div class="summary">
      <div class="summary-card total">
        <h3>Total Tests</h3>
        <div class="value">${totalTests}</div>
      </div>
      <div class="summary-card passed">
        <h3>Passed</h3>
        <div class="value">${passed}</div>
      </div>
      <div class="summary-card failed">
        <h3>Failed</h3>
        <div class="value">${failed}</div>
      </div>
      <div class="summary-card skipped">
        <h3>Skipped</h3>
        <div class="value">${skipped}</div>
      </div>
    </div>

    ${errors.total > 0 ? `
      <div class="error-summary">
        <h3>🚨 Error Summary</h3>
        <div class="error-count">${errors.total} total error(s)</div>
        <div class="error-types">
          ${Object.entries(errors.byType).map(([type, count]) => 
            `<span class="error-type">${type}: ${count}</span>`
          ).join('')}
        </div>
        ${errors.critical.length > 0 ? `
          <div style="margin-top: 15px;">
            <strong style="color: #991b1b;">⚠️ Critical Errors:</strong>
            <ul style="margin-top: 5px; margin-left: 20px;">
              ${errors.critical.map(e => `<li>${e.message}</li>`).join('')}
            </ul>
          </div>
        ` : ''}
      </div>
    ` : ''}

    <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
      <h3 style="margin-bottom: 10px;">Summary</h3>
      <p><strong>Pass Rate:</strong> ${passRate}%</p>
      <p><strong>Total Duration:</strong> ${(duration / 1000).toFixed(2)}s</p>
      <p><strong>Base URL:</strong> ${this.results.environment.baseUrl}</p>
      ${errors.total > 0 ? `<p><strong>Error Log:</strong> tests/reports/error-log.txt</p>` : ''}
    </div>

    ${suites.map(suite => `
      <div class="suite">
        <div class="suite-header">
          <h2>${suite.name}</h2>
          <div class="suite-stats">
            <span class="pass">✓ ${suite.passed}</span>
            <span class="fail">✗ ${suite.failed}</span>
            <span class="skip">○ ${suite.skipped}</span>
          </div>
        </div>
        <div class="suite-body">
          ${suite.results.map(test => `
            <div class="test-result">
              <div class="status ${test.status === 'PASS' ? 'pass' : test.status === 'FAIL' ? 'fail' : 'skip'}">
                ${test.status === 'PASS' ? '✓' : test.status === 'FAIL' ? '✗' : '○'}
              </div>
              <div class="content">
                <div class="name">${test.name}</div>
                <div class="duration">${(test.duration / 1000).toFixed(3)}s</div>
                ${test.error ? `
                  <div class="error-box">
                    <div class="error-message">⚠️ ${test.error.type || 'Error'}: ${test.error.message}</div>
                    ${test.error.stack ? `
                      <details>
                        <summary>View Stack Trace</summary>
                        <div class="error-stack">${test.error.stack}</div>
                      </details>
                    ` : ''}
                    ${test.error.response ? `
                      <details>
                        <summary>Response Details</summary>
                        <div class="error-details">${JSON.stringify(test.error.response, null, 2)}</div>
                      </details>
                    ` : ''}
                    ${test.error.request ? `
                      <details>
                        <summary>Request Details</summary>
                        <div class="error-details">${JSON.stringify(test.error.request, null, 2)}</div>
                      </details>
                    ` : ''}
                  </div>
                ` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('')}

    <div class="footer">
      <p>Ty Khai TopUp Automated Testing Framework</p>
      <p style="margin-top: 5px;">Error log saved to: tests/reports/error-log.txt</p>
    </div>
  </div>
</body>
</html>`;
  }

  printSummary(): void {
    const { totalTests, passed, failed, skipped, duration, errors } = this.results;
    const passRate = totalTests > 0 ? ((passed / totalTests) * 100).toFixed(2) : '0';

    console.log('\n' + '='.repeat(70));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(70));
    console.log(`Total Tests:  ${totalTests}`);
    console.log(`Passed:       ${passed} (${passRate}%)`);
    console.log(`Failed:       ${failed}`);
    console.log(`Skipped:      ${skipped}`);
    console.log(`Duration:     ${(duration / 1000).toFixed(2)}s`);
    
    if (errors.total > 0) {
      console.log('\n' + '-'.repeat(70));
      console.log('🚨 ERRORS DETECTED');
      console.log('-'.repeat(70));
      console.log(`Total Errors:     ${errors.total}`);
      console.log(`Critical Errors:  ${errors.critical.length}`);
      console.log('\nError Types:');
      Object.entries(errors.byType).forEach(([type, count]) => {
        console.log(`  • ${type}: ${count}`);
      });
      
      if (errors.critical.length > 0) {
        console.log('\n⚠️  CRITICAL ERRORS (Immediate Action Required):');
        errors.critical.forEach((err, i) => {
          console.log(`  ${i + 1}. ${err.message}`);
        });
      }
    }

    if (failed > 0) {
      console.log('\n' + '-'.repeat(70));
      console.log('❌ FAILED TESTS:');
      console.log('-'.repeat(70));
      this.results.suites.forEach(suite => {
        suite.results.filter(r => r.status === 'FAIL').forEach(test => {
          console.log(`  • ${suite.name}`);
          console.log(`    Test: ${test.name}`);
          if (test.error) {
            console.log(`    Error: ${test.error.message}`);
            console.log(`    Type: ${test.error.type || 'Unknown'}`);
          }
          console.log();
        });
      });
    }

    console.log('='.repeat(70));
    console.log('\n📁 Reports saved to:');
    console.log('   • tests/reports/*.html  (Visual reports)');
    console.log('   • tests/reports/*.json  (Machine-readable)');
    console.log('   • tests/reports/error-log.txt  (Error details)');
    console.log('='.repeat(70) + '\n');
  }
}

export const testReporter = new TestReporter();
