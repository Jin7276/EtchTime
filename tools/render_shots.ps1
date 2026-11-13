# Render screenshots from the real app (ASCII only)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
$prof = Join-Path $root ".edgeprof3"
$seed = Join-Path $root "tools\seed.html"
$web  = Join-Path $root "web\index.html"
$seedUri = "file:///" + ($seed -replace '\\','/')
$webUri  = "file:///" + ($web -replace '\\','/')

function Run-Seed([string]$q) {
  $u = $seedUri + $q
  $p = Start-Process -FilePath $edge -PassThru -WindowStyle Hidden -ArgumentList @(
    "--headless=new","--no-sandbox","--disable-gpu","--allow-file-access-from-files","--no-first-run",
    "--user-data-dir=$prof","--virtual-time-budget=2000","--dump-dom",$u) -RedirectStandardOutput "$env:TEMP\seed.txt"
  $p.WaitForExit(30000) | Out-Null
}

function Shot([string]$name) {
  $out = Join-Path $root "shots\$name.png"
  if (Test-Path $out) { Remove-Item $out -Force }
  $url = $webUri + "#screen=" + $name
  $p = Start-Process -FilePath $edge -PassThru -WindowStyle Hidden -ArgumentList @(
    "--headless=new","--no-sandbox","--disable-gpu","--hide-scrollbars","--allow-file-access-from-files","--no-first-run",
    "--force-device-scale-factor=2","--virtual-time-budget=3000",
    "--user-data-dir=$prof","--window-size=1280,800","--screenshot=$out",$url)
  if (-not $p.WaitForExit(40000)) { $p.Kill(); Write-Host "TIMEOUT $name" }
}

Get-Process msedge -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

Run-Seed "?plain=1"
Shot "data"; Shot "me"; Shot "detail"; Shot "todos"

Run-Seed "?cur=1"
Shot "timer"

Run-Seed "?cur=1&pause=1"
Shot "pause"

Get-Process msedge -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Write-Host "render done"
