# k6-tests/run-tests.ps1
# PowerShell script to run k6 tests
# Run this script after installing k6

$ErrorActionPreference = "Stop"

# Set your app URL
$env:BASE_URL = "https://tykhai.vercel.app"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Ty Khai TopUp - k6 Load Testing" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if k6 is installed
try {
    k6 version | Out-Null
    Write-Host "k6 is installed" -ForegroundColor Green
} catch {
    Write-Host "ERROR: k6 is not installed!" -ForegroundColor Red
    Write-Host "Please install k6 first:" -ForegroundColor Yellow
    Write-Host "  Option 1 (winget): winget install k6" -ForegroundColor Yellow
    Write-Host "  Option 2 (choco):  choco install k6" -ForegroundColor Yellow
    Write-Host "  Option 3: Download from https://github.com/grafana/k6/releases" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "Base URL: $env:BASE_URL" -ForegroundColor Green
Write-Host ""

# Function to run a test
function Run-Test {
    param($TestName, $Description)
    
    Write-Host "----------------------------------------" -ForegroundColor DarkCyan
    Write-Host "Running: $TestName" -ForegroundColor Cyan
    Write-Host "Description: $Description" -ForegroundColor Gray
    Write-Host "----------------------------------------" -ForegroundColor DarkCyan
    
    k6 run ".\$TestName"
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "PASS: $TestName completed" -ForegroundColor Green
    } else {
        Write-Host "FAIL: $TestName failed with exit code $LASTEXITCODE" -ForegroundColor Red
    }
    
    Write-Host ""
    Read-Host "Press Enter to continue to next test..."
}

# Menu
Write-Host "Select test to run:" -ForegroundColor White
Write-Host "  1. Homepage Test (public endpoints)" -ForegroundColor White
Write-Host "  2. Payment Flow Test" -ForegroundColor White
Write-Host "  3. Order Flow Test (full user journey)" -ForegroundColor White
Write-Host "  4. API Stress Test (find breaking point)" -ForegroundColor White
Write-Host "  5. Security Test (rate limiting)" -ForegroundColor White
Write-Host "  6. Run All Tests" -ForegroundColor Yellow
Write-Host "  7. Exit" -ForegroundColor Gray
Write-Host ""

$choice = Read-Host "Enter your choice (1-7)"

switch ($choice) {
    "1" { Run-Test "test-homepage.js" "Tests homepage and public API performance" }
    "2" { Run-Test "test-payment.js" "Simulates payment flow with Bakong" }
    "3" { Run-Test "test-order-flow.js" "Full user journey: browse -> order -> status" }
    "4" { Run-Test "test-api-stress.js" "Stress test up to 400 users" }
    "5" { Run-Test "test-security.js" "Tests rate limiting and abuse detection" }
    "6" {
        Run-Test "test-homepage.js" "Homepage Test"
        Run-Test "test-payment.js" "Payment Test"
        Run-Test "test-order-flow.js" "Order Flow Test"
        Run-Test "test-api-stress.js" "API Stress Test"
        Run-Test "test-security.js" "Security Test"
    }
    "7" { exit 0 }
    default { Write-Host "Invalid choice" -ForegroundColor Red }
}

Write-Host ""
Write-Host "All tests completed!" -ForegroundColor Green
