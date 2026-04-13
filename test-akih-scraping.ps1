# Test Aki-H scraping to verify URL pattern and max pages
Write-Host "Testing Aki-H source scraping..." -ForegroundColor Cyan

# Test direct API call to Aki-H source
Write-Host "`nTesting pages 1, 2, and 3..." -ForegroundColor Yellow

$testPages = @(1, 2, 3)
foreach ($pageNum in $testPages) {
    Write-Host "`n=== Testing Page $pageNum ===" -ForegroundColor Cyan
    
    try {
        # Call the source's getLatest method via the API
        $response = Invoke-WebRequest -Uri "http://localhost:3001/api/anime/browse?page=$pageNum&limit=25&mode=adult&source=AkiH" -UseBasicParsing
        $json = $response.Content | ConvertFrom-Json
        
        Write-Host "  Status: SUCCESS" -ForegroundColor Green
        Write-Host "  Results returned: $($json.results.Count)" -ForegroundColor White
        Write-Host "  Total results: $($json.totalResults)" -ForegroundColor White
        Write-Host "  Total pages: $($json.totalPages)" -ForegroundColor White
        
        if ($json.results.Count -gt 0) {
            Write-Host "  First 3 titles:" -ForegroundColor Gray
            $json.results | Select-Object -First 3 | ForEach-Object {
                Write-Host "    - $($_.title)" -ForegroundColor White
            }
        }
    } catch {
        Write-Host "  Status: FAILED" -ForegroundColor Red
        Write-Host "  Error: $_" -ForegroundColor Red
    }
}

# Test search functionality
Write-Host "`n`n=== Testing Search ===" -ForegroundColor Cyan
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3001/api/anime/search?q=yuri&mode=adult&source=AkiH" -UseBasicParsing
    $json = $response.Content | ConvertFrom-Json
    
    Write-Host "  Status: SUCCESS" -ForegroundColor Green
    Write-Host "  Results returned: $($json.results.Count)" -ForegroundColor White
    
    if ($json.results.Count -gt 0) {
        Write-Host "  First 3 search results:" -ForegroundColor Gray
        $json.results | Select-Object -First 3 | ForEach-Object {
            Write-Host "    - $($_.title)" -ForegroundColor White
        }
    }
} catch {
    Write-Host "  Status: FAILED" -ForegroundColor Red
    Write-Host "  Error: $_" -ForegroundColor Red
}

# Test genre functionality
Write-Host "`n`n=== Testing Genre (yuri) ===" -ForegroundColor Cyan
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3001/api/anime/genre/yuri?page=1&mode=adult&source=AkiH" -UseBasicParsing
    $json = $response.Content | ConvertFrom-Json
    
    Write-Host "  Status: SUCCESS" -ForegroundColor Green
    Write-Host "  Results returned: $($json.results.Count)" -ForegroundColor White
    Write-Host "  Total pages: $($json.totalPages)" -ForegroundColor White
    
    if ($json.results.Count -gt 0) {
        Write-Host "  First 3 genre results:" -ForegroundColor Gray
        $json.results | Select-Object -First 3 | ForEach-Object {
            Write-Host "    - $($_.title)" -ForegroundColor White
        }
    }
} catch {
    Write-Host "  Status: FAILED" -ForegroundColor Red
    Write-Host "  Error: $_" -ForegroundColor Red
}

# Test multiple pages to find actual max
Write-Host "`n`n=== Finding Maximum Available Pages ===" -ForegroundColor Cyan
$maxTestPage = 10
$lastSuccessfulPage = 0

for ($i = 1; $i -le $maxTestPage; $i++) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3001/api/anime/browse?page=$i&limit=25&mode=adult&source=AkiH" -UseBasicParsing -ErrorAction Stop
        $json = $response.Content | ConvertFrom-Json
        
        if ($json.results.Count -gt 0) {
            $lastSuccessfulPage = $i
            Write-Host "  Page $i : $($json.results.Count) results" -ForegroundColor Green
        } else {
            Write-Host "  Page $i : 0 results (end reached)" -ForegroundColor Yellow
            break
        }
    } catch {
        Write-Host "  Page $i : Error - $_" -ForegroundColor Red
        break
    }
}

Write-Host "`n=== SUMMARY ===" -ForegroundColor Cyan
Write-Host "Last successful page: $lastSuccessfulPage" -ForegroundColor White
Write-Host "Estimated total anime available: $(($lastSuccessfulPage * 25))" -ForegroundColor White
