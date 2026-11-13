# 用假数据重新渲染文档截图（ASCII only）
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
$prof = Join-Path $root ".edgeprofDoc"
$seed = Join-Path $root "tools\seed.html"
$web = Join-Path $root "web\index.html"
$wrap = Join-Path $root "tools\wrap.html"
$seedUri = "file:///" + ($seed -replace '\\','/')
$webUri = "file:///" + ($web -replace '\\','/')
$wrapUri = "file:///" + ($wrap -replace '\\','/')
$lap = Join-Path $root "mock\lap3.html"
$lapUri = "file:///" + ($lap -replace '\\','/')

function Shot([string]$out, [string]$url, [int]$w = 1280, [int]$h = 800) {
  if (Test-Path $out) { Remove-Item $out -Force }
  $p = Start-Process -FilePath $edge -PassThru -WindowStyle Hidden -ArgumentList @(
    "--headless=new","--no-sandbox","--disable-gpu","--hide-scrollbars","--allow-file-access-from-files","--no-first-run",
    "--force-device-scale-factor=2","--run-all-compositor-stages-before-draw","--virtual-time-budget=6000",
    "--user-data-dir=$prof","--window-size=$w,$h","--screenshot=$out",$url)
  if (-not $p.WaitForExit(45000)) { $p.Kill(); Write-Host "TIMEOUT $out" }
}

function Seed([string]$q) {
  $p = Start-Process -FilePath $edge -PassThru -WindowStyle Hidden -ArgumentList @(
    "--headless=new","--no-sandbox","--disable-gpu","--allow-file-access-from-files","--no-first-run",
    "--user-data-dir=$prof","--virtual-time-budget=2000","--dump-dom",($seedUri + $q)) -RedirectStandardOutput "$env:TEMP\seed.txt"
  $p.WaitForExit(30000) | Out-Null
}

Get-Process msedge -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Remove-Item $prof -Recurse -Force -ErrorAction SilentlyContinue

Seed "?plain=1"
Shot (Join-Path $root "docs\screenshots\01-todos.png") ($webUri + "#screen=todos")
Shot (Join-Path $root "docs\screenshots\02-data.png") ($webUri + "#screen=data")
Shot (Join-Path $root "docs\screenshots\03-calendar.png") ($webUri + "#screen=calendar")
Shot (Join-Path $root "docs\screenshots\06-menu.png") ($wrapUri + "?click=.todo-name")
Shot (Join-Path $root "docs\screenshots\05-history.png") ($wrapUri + "?click=.todo-name,%23actHistory")

Seed "?cur=1"
Shot (Join-Path $root "docs\screenshots\04-timer.png") ($webUri + "#screen=timer")

Shot (Join-Path $root "docs\screenshots\07-laps.png") $lapUri

Get-Process msedge -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Remove-Item $prof -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "docs screenshots done"
