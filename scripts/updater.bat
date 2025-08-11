@echo off
setlocal EnableDelayedExpansion

REM Updater for Game Librarian
REM - Checks local Version.Json
REM - Fetches remote Version.Json from GitHub main branch
REM - Prints JSON status in "check" mode
REM - Optionally runs WinInstaller.bat to update into root folder "Game Librarian"

set "REPO_URL=https://github.com/Maxibon13/Game-Librarian"
set "RAW_VERSION_URL=https://raw.githubusercontent.com/Maxibon13/Game-Librarian/main/Version.Json"

REM Resolve important paths
set "SCRIPT_DIR=%~dp0"
set "ROOT_DIR=%SCRIPT_DIR%.."
for %%I in ("%ROOT_DIR%.") do set "ROOT_DIR_NORM=%%~fI"
set "LOCAL_VERSION_JSON=%ROOT_DIR_NORM%\Version.Json"

REM Determine desired install root name: "Game Librarian" beside existing root by default
for %%I in ("%ROOT_DIR_NORM%") do set "CURRENT_ROOT_NAME=%%~nI"
for %%I in ("%ROOT_DIR_NORM%\..") do set "ROOT_PARENT=%%~fI"
set "DESIRED_ROOT=%ROOT_PARENT%\Game Librarian"

REM Helper: read JSON version as integer using PowerShell (fallback to 0)
for /f "usebackq delims=" %%V in (`powershell -NoProfile -Command "try { $v = (Get-Content -Raw \"%LOCAL_VERSION_JSON%\" | ConvertFrom-Json).version; [int]$v } catch { 0 }"`) do set "LOCAL_VERSION=%%V"
if not defined LOCAL_VERSION set "LOCAL_VERSION=0"

REM Fetch remote version as integer
for /f "usebackq delims=" %%V in (`powershell -NoProfile -Command "$ProgressPreference='SilentlyContinue'; try { [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $raw=(Invoke-WebRequest -UseBasicParsing '%RAW_VERSION_URL%').Content; $j = $raw | ConvertFrom-Json; [int]$j.version } catch { 0 }"`) do set "REMOTE_VERSION=%%V"
if not defined REMOTE_VERSION set "REMOTE_VERSION=0"

REM Compare numerically using PowerShell; returns 1 if remote>local else 0
for /f "usebackq delims=" %%U in (`powershell -NoProfile -Command "try { if([int]'%REMOTE_VERSION%' -gt [int]'%LOCAL_VERSION%'){ '1' } else { '0' } } catch { '0' }"`) do set "UPDATE_AVAILABLE=%%U"

REM If called with "check" print JSON and exit
if /i "%~1"=="check" (
  echo {"ok":true,"updateAvailable":%UPDATE_AVAILABLE%,"localVersion":%LOCAL_VERSION%,"remoteVersion":%REMOTE_VERSION%,"repository":"%REPO_URL%"}
  exit /b 0
)

REM Otherwise, perform update if available
if "%UPDATE_AVAILABLE%"=="1" (
  echo [INFO] Update available: %LOCAL_VERSION% ^< %REMOTE_VERSION%
  set "INSTALL_DIR=%DESIRED_ROOT%"
  if not exist "%INSTALL_DIR%" (
    mkdir "%INSTALL_DIR%" >nul 2>nul
  )
  echo [INFO] Installing/updating into "%INSTALL_DIR%" using scripts/WinInstaller.bat ...
  set "_OLD_CD=%CD%"
  pushd "%SCRIPT_DIR%" >nul
  REM Pass INSTALL_DIR to InstallerLite so it installs into desired root
  set "INSTALL_DIR=%INSTALL_DIR%"
  call cmd /c "%SCRIPT_DIR%WinInstaller.bat"
  set "ERR=%ERRORLEVEL%"
  popd >nul
  if not "%ERR%"=="0" (
    echo [ERROR] Installer failed with code %ERR%.
    exit /b %ERR%
  )
  echo [INFO] Update complete.
  exit /b 0
) else (
  echo [INFO] Already up to date (%LOCAL_VERSION%).
  exit /b 0
)


