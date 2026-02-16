# Test pagination for duplicate anime across pages 1-5
$baseUrl = "http://localhost:3001/api/anime/browse"
$results = @()

Write-Host "Fetching pages 1-5..." -ForegroundColor Cyan

for ($i = 1; $i -le 5; $i++) {
    Write-Host "`nPage $i..." -ForegroundColor Yellow
    try {
        $response = Invoke-WebRequest -Uri "$baseUrl?page=$i&limit=25&mode=adult" -UseBasicParsing
        $json = $response.Content | ConvertFrom-Json
        
        Write-Host "  Total Results: $($json.totalResults)" -ForegroundColor Gray
        Write-Host "  Results on this page: $($json.results.Count)" -ForegroundColor Gray
        
        foreach ($anime in $json.results) {
            $results += [PSCustomObject]@{
                Page = $i
                ID = $anime.id
                Title = $anime.title
                Source = $anime.source
            }
            Write-Host "    - $($anime.title) [$($anime.id)]" -ForegroundColor White
        }
    } catch {
        Write-Host "  Error fetching page $i : $_" -ForegroundColor Red
    }
}

Write-Host "`n`n=== DUPLICATE ANALYSIS ===" -ForegroundColor Cyan

# Check for duplicate IDs
$duplicateIDs = $results | Group-Object -Property ID | Where-Object { $_.Count -gt 1 }
if ($duplicateIDs) {
    Write-Host "`nDUPLICATE IDs FOUND:" -ForegroundColor Red
    foreach ($dup in $duplicateIDs) {
        Write-Host "  ID: $($dup.Name)" -ForegroundColor Red
        foreach ($item in $dup.Group) {
            Write-Host "    - Page $($item.Page): $($item.Title)" -ForegroundColor Yellow
        }
    }
} else {
    Write-Host "`nNo duplicate IDs found!" -ForegroundColor Green
}

# Check for duplicate titles (case-insensitive)
$duplicateTitles = $results | Group-Object -Property { $_.Title.ToLower() } | Where-Object { $_.Count -gt 1 }
if ($duplicateTitles) {
    Write-Host "`nDUPLICATE TITLES FOUND:" -ForegroundColor Red
    foreach ($dup in $duplicateTitles) {
        Write-Host "  Title: $($dup.Name)" -ForegroundColor Red
        foreach ($item in $dup.Group) {
            Write-Host "    - Page $($item.Page): $($item.ID) [$($item.Source)]" -ForegroundColor Yellow
        }
    }
} else {
    Write-Host "`nNo duplicate titles found!" -ForegroundColor Green
}

# Summary
Write-Host "`n=== SUMMARY ===" -ForegroundColor Cyan
Write-Host "Total anime fetched: $($results.Count)" -ForegroundColor White
Write-Host "Unique IDs: $(($results | Select-Object -Unique -Property ID).Count)" -ForegroundColor White
Write-Host "Unique titles: $(($results | Select-Object -Property @{Name='LowerTitle';Expression={$_.Title.ToLower()}} -Unique).Count)" -ForegroundColor White

# Save to file
$outputFile = "c:\Users\Owner\anistream-hub\pagination-test-results.txt"
$results | Format-Table -AutoSize | Out-File -FilePath $outputFile
Write-Host "`nResults saved to: $outputFile" -ForegroundColor Cyan
