# Builds a self-contained Windows release of Game Librarian.
#
#   npm run release                 (or)  powershell -ExecutionPolicy Bypass -File installer/build_release.ps1
#
# Output (release/):
#   win-unpacked/                 packaged Electron app + embedded Python runtime (resources/python)
#   GameLibrarian-win.zip         payload used by the installer / in-app updater (upload as a GitHub release asset)
#   GameLibrarian-Setup.exe       installer with the payload bundled inside -> works on a fresh Windows install
#
# Also refreshes installer/Installer.exe and installer/Uninstaller.exe (lean, no payload); these ship inside
# the app under resources/installer and are what the in-app updater launches (it downloads the release zip).
#
# Requires on the BUILD machine only: Node 18+, Python 3.10+ (with tkinter), internet for the Python embed download.
param(
  [switch]$SkipNpm,          # reuse existing dist/ (vite output) and node_modules
  [switch]$SkipPip,          # don't pip install pyinstaller/pillow
  [switch]$NoSetup,          # skip GameLibrarian-Setup.exe (payload-bundled installer)
  [string]$PythonEmbedVersion = '3.12.10'
)

$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $root
$src = Join-Path $root 'installer\src'
$installerOut = Join-Path $root 'installer'
$releaseDir = Join-Path $root 'release'
$buildRes = Join-Path $root 'build'
$runtimeDir = Join-Path $root 'runtime\python'
$icons = Join-Path $root 'assets\icons'
$work = Join-Path $env:TEMP 'gl-release-build'
$payloadName = 'GameLibrarian-win.zip'

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Green }
function Run($file, [string[]]$argv) {
  & $file @argv
  if ($LASTEXITCODE -ne 0) { throw "$file $($argv -join ' ') failed ($LASTEXITCODE)" }
}

foreach ($p in @('installer_gui.pyw', 'uninstaller_gui.pyw', 'gl_ui.py')) {
  if (-not (Test-Path (Join-Path $src $p))) { throw "Missing installer source: installer\src\$p" }
}

# Build-machine Python (for PyInstaller + icon generation). Avoids PowerShell mangling "-3" for the py launcher.
$py = if (Get-Command py -ErrorAction SilentlyContinue) { cmd /c "py -3 -c ""import sys;print(sys.executable)""" } else { (Get-Command python).Source }
Write-Host "Build Python: $py"
if (-not $SkipPip) {
  Step 'Installing PyInstaller + Pillow'
  Run $py @('-m', 'pip', 'install', '--quiet', '--upgrade', 'pyinstaller', 'pillow')
}

# ---------------------------------------------------------------------------
Step 'Generating multi-size .ico files'
New-Item -ItemType Directory -Force $buildRes | Out-Null
$icoScript = @"
import sys
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGBA')
side = max(im.size)
sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
sq.paste(im, ((side - im.width) // 2, (side - im.height) // 2))
sq.save(dst, format='ICO', sizes=[(s, s) for s in (16, 24, 32, 48, 64, 128, 256)])
print('wrote', dst)
"@
$icoPy = Join-Path $env:TEMP 'gl_make_ico.py'
Set-Content -Path $icoPy -Value $icoScript -Encoding UTF8
Run $py @($icoPy, (Join-Path $icons 'Icon.png'), (Join-Path $buildRes 'icon.ico'))
Run $py @($icoPy, (Join-Path $icons 'Installericon.png'), (Join-Path $buildRes 'installer.ico'))

# ---------------------------------------------------------------------------
if (-not $SkipNpm) {
  Step 'Building renderer (vite)'
  if (-not (Test-Path (Join-Path $root 'node_modules'))) { Run 'npm.cmd' @('ci') }
  Run 'npm.cmd' @('run', 'build')
}
if (-not (Test-Path (Join-Path $root 'dist\index.html'))) { throw 'dist/index.html missing - run without -SkipNpm' }

# ---------------------------------------------------------------------------
Step "Preparing embedded Python runtime ($PythonEmbedVersion)"
$stamp = Join-Path $runtimeDir '.version'
if (-not (Test-Path (Join-Path $runtimeDir 'python.exe')) -or -not (Test-Path $stamp) -or ((Get-Content $stamp -Raw).Trim() -ne $PythonEmbedVersion)) {
  if (Test-Path $runtimeDir) { Remove-Item $runtimeDir -Recurse -Force }
  New-Item -ItemType Directory -Force $runtimeDir | Out-Null
  $zip = Join-Path $env:TEMP "python-$PythonEmbedVersion-embed-amd64.zip"
  $url = "https://www.python.org/ftp/python/$PythonEmbedVersion/python-$PythonEmbedVersion-embed-amd64.zip"
  Write-Host "Downloading $url"
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $zip
  Expand-Archive -Path $zip -DestinationPath $runtimeDir -Force
  Remove-Item $zip -Force
  Set-Content -Path $stamp -Value $PythonEmbedVersion -Encoding ASCII
}
# Smoke test: the tools are stdlib-only; make sure the embed can import what they use.
Run (Join-Path $runtimeDir 'python.exe') @('-c', 'import json, subprocess, winreg, urllib.request, ssl, re, pathlib, argparse, html, sys; print(sys.version)')

# ---------------------------------------------------------------------------
function BuildPy($name, $script, $icon, $dist, [string[]]$extra) {
  Step "Building $name.exe"
  $argv = @('-m', 'PyInstaller', '--noconfirm', '--onefile', '--noconsole', '--name', $name,
            '--icon', $icon, '--paths', $src,
            '--exclude-module', 'numpy', '--exclude-module', 'setuptools',
            '--add-data', ((Join-Path $icons 'Icon.png') + ';assets\icons'),
            '--distpath', $dist, '--workpath', (Join-Path $work $name), '--specpath', (Join-Path $work $name))
  if ($extra) { $argv += $extra }
  $argv += (Join-Path $src $script)
  $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'   # PyInstaller logs to stderr
  & $py @argv
  $ErrorActionPreference = $prev
  if ($LASTEXITCODE -ne 0) { throw "$name build failed" }
  $exe = Join-Path $dist "$name.exe"
  if (-not (Test-Path $exe)) { throw "$exe missing after build (antivirus may have quarantined it; exclude '$dist')" }
}

$instIcon = Join-Path $buildRes 'installer.ico'
BuildPy 'Uninstaller' 'uninstaller_gui.pyw' $instIcon $installerOut
BuildPy 'Installer'   'installer_gui.pyw'   $instIcon $installerOut

# ---------------------------------------------------------------------------
Step 'Packaging Electron app (electron-builder --dir)'
for ($i = 0; (Test-Path $releaseDir) -and $i -lt 10; $i++) {
  # Freshly written exes are often held open by antivirus scanners for a few seconds.
  Remove-Item $releaseDir -Recurse -Force -ErrorAction SilentlyContinue
  if (Test-Path $releaseDir) { Start-Sleep -Seconds 3 }
}
if (Test-Path $releaseDir) { throw "Could not clear $releaseDir (a file is locked)" }
Run 'npx.cmd' @('electron-builder', '--win', '--dir')
$unpacked = Join-Path $releaseDir 'win-unpacked'
if (-not (Test-Path (Join-Path $unpacked 'Game Librarian.exe'))) { throw 'electron-builder did not produce release\win-unpacked\Game Librarian.exe' }
Copy-Item (Join-Path $root 'Version.Json') (Join-Path $unpacked 'Version.Json') -Force
foreach ($must in @('resources\python\python.exe', 'resources\tools\proc.py', 'resources\installer\Installer.exe', 'resources\installer\Uninstaller.exe', 'resources\Version.Json')) {
  if (-not (Test-Path (Join-Path $unpacked $must))) { throw "Packaged app is missing $must" }
}

# ---------------------------------------------------------------------------
Step "Creating payload $payloadName"
$payload = Join-Path $releaseDir $payloadName
$zipScript = @"
import os, sys, zipfile
src, dst = sys.argv[1], sys.argv[2]
n = 0
with zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
    for root, dirs, files in os.walk(src):
        for f in files:
            p = os.path.join(root, f)
            zf.write(p, os.path.relpath(p, src))
            n += 1
print('files:', n, 'bytes:', os.path.getsize(dst))
"@
$zipPy = Join-Path $env:TEMP 'gl_make_zip.py'
Set-Content -Path $zipPy -Value $zipScript -Encoding UTF8
Run $py @($zipPy, $unpacked, $payload)

# ---------------------------------------------------------------------------
if (-not $NoSetup) {
  BuildPy 'GameLibrarian-Setup' 'installer_gui.pyw' $instIcon $releaseDir @('--add-data', "$payload;payload")
}

Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item $icoPy, $zipPy -Force -ErrorAction SilentlyContinue

Step 'Done'
foreach ($p in @((Join-Path $installerOut 'Installer.exe'), (Join-Path $installerOut 'Uninstaller.exe'), $payload, (Join-Path $releaseDir 'GameLibrarian-Setup.exe'))) {
  if (Test-Path $p) { $f = Get-Item $p; Write-Host ("{0,-26} {1,12:N0} bytes" -f $f.Name, $f.Length) }
}
Write-Host "`nUpload release\$payloadName (in-app updater) and release\GameLibrarian-Setup.exe (fresh installs) to the GitHub release."
