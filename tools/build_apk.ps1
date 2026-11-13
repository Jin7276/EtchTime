# Build APK for TimeLog (ASCII only, PowerShell 5.1 compatible)
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$sdk = "$env:LOCALAPPDATA\Android\Sdk"
$bt = Join-Path $sdk "build-tools\36.1.0"
$androidJar = Join-Path $sdk "platforms\android-36\android.jar"
$jdk = "D:\jdk-23.0.2\bin"
$java = Join-Path $jdk "java.exe"
$javac = Join-Path $jdk "javac.exe"
$keytool = Join-Path $jdk "keytool.exe"
$jar = Join-Path $jdk "jar.exe"
$python = "C:\Users\Apricity\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe"

$android = Join-Path $root "android"
$build = Join-Path $root "build"
$apkOut = Join-Path $root "TimeLog.apk"

Write-Host "== clean"
Remove-Item $build -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force "$build\gen", "$build\classes", "$build\dex", "$build\assets" | Out-Null

Write-Host "== copy web assets"
$www = Join-Path $build "assets\www"
New-Item -ItemType Directory -Force $www | Out-Null
Copy-Item (Join-Path $root "web\*") $www -Recurse -Force

Write-Host "== aapt2 compile"
& (Join-Path $bt "aapt2.exe") compile --dir (Join-Path $android "res") -o "$build\res.zip"
if ($LASTEXITCODE -ne 0) { throw "aapt2 compile failed" }

Write-Host "== aapt2 link"
& (Join-Path $bt "aapt2.exe") link -o "$build\base.apk" `
    -I $androidJar `
    --manifest (Join-Path $android "AndroidManifest.xml") `
    --java "$build\gen" `
    --min-sdk-version 29 --target-sdk-version 34 `
    "$build\res.zip"
if ($LASTEXITCODE -ne 0) { throw "aapt2 link failed" }

Write-Host "== javac"
$srcs = @()
$srcs += Get-ChildItem (Join-Path $android "src") -Recurse -Filter *.java | ForEach-Object { $_.FullName }
$srcs += Get-ChildItem "$build\gen" -Recurse -Filter *.java | ForEach-Object { $_.FullName }
& $javac -source 11 -target 11 -encoding UTF-8 -nowarn -Xlint:-options -cp $androidJar -d "$build\classes" @srcs
if ($LASTEXITCODE -ne 0) { throw "javac failed" }

Write-Host "== d8"
$classes = @(Get-ChildItem "$build\classes" -Recurse -Filter *.class | ForEach-Object { $_.FullName })
& $java -cp (Join-Path $bt "lib\d8.jar") com.android.tools.r8.D8 --release --min-api 29 --lib $androidJar --output "$build\dex" @classes
if ($LASTEXITCODE -ne 0) { throw "d8 failed" }

Write-Host "== add assets + classes.dex"
& $python (Join-Path $root "tools\add_to_apk.py") "$build\base.apk" "assets=$build\assets" "classes.dex=$build\dex\classes.dex"
if ($LASTEXITCODE -ne 0) { throw "add_to_apk failed" }

Write-Host "== zipalign"
& (Join-Path $bt "zipalign.exe") -f -p 4 "$build\base.apk" "$build\aligned.apk"
if ($LASTEXITCODE -ne 0) { throw "zipalign failed" }

Write-Host "== sign"
$ks = Join-Path $root "keystore\timelog.jks"
if (-not (Test-Path $ks)) {
    New-Item -ItemType Directory -Force (Split-Path $ks) | Out-Null
    & $keytool -genkeypair -keystore $ks -alias timelog -keyalg RSA -keysize 2048 -validity 12000 -storepass timelog2026 -keypass timelog2026 -dname "CN=TimeLog, O=Apricity, C=CN"
    if ($LASTEXITCODE -ne 0) { throw "keytool failed" }
}
if (Test-Path $apkOut) { Remove-Item $apkOut -Force }
& $java -jar (Join-Path $bt "lib\apksigner.jar") sign --ks $ks --ks-pass pass:timelog2026 --key-pass pass:timelog2026 --out $apkOut "$build\aligned.apk"
if ($LASTEXITCODE -ne 0) { throw "sign failed" }

Write-Host "== verify"
& $java -jar (Join-Path $bt "lib\apksigner.jar") verify --print-certs $apkOut | Select-Object -First 5
& (Join-Path $bt "aapt2.exe") dump badging $apkOut | Select-Object -First 3

$size = [math]::Round((Get-Item $apkOut).Length / 1MB, 2)
Write-Host ""
Write-Host "DONE: $apkOut ($size MB)"
