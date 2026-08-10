param()
$port = 3001
$connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($connections) {
    $pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($procId in $pids) {
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    }
    $pidList = $pids -join ', '
    Write-Host "Killed process(es) on port ${port}: ${pidList}"
} else {
    Write-Host "Port ${port} is free"
}
