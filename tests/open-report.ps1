# Open Latest Test Report
# Usage: .\tests\open-report.ps1

$reportDir = "tests\reports"
$htmlFiles = Get-ChildItem -Path $reportDir -Filter "*.html" -File | Sort-Object LastWriteTime -Descending

if ($htmlFiles.Count -eq 0) {
    Write-Host "No HTML reports found. Run tests first." -ForegroundColor Red
    exit 1
}

$latestReport = $htmlFiles[0]
Write-Host "Opening latest report: $($latestReport.Name)" -ForegroundColor Green

Start-Process $latestReport.FullName
