@echo off
setlocal EnableDelayedExpansion

REM Updater for Game Librarian
REM - Checks local Version.Json
REM - Fetches remote Version.Json from GitHub main branch
REM - Prints JSON status in "check" mode
REM - Optionally runs InstallerLite.bat to update into root folder "Game Librarian"

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

REM Helper: read JSON version field using PowerShell
set "PS_GET_VER=(Get-Content -Raw \"%LOCAL_VERSION_JSON%\" | ConvertFrom-Json).version"
for /f "usebackq delims=" %%V in (`powershell -NoProfile -Command "%PS_GET_VER%"`) do set "LOCAL_VERSION=%%V"
if not defined LOCAL_VERSION set "LOCAL_VERSION=0.0.0"

REM Fetch remote version (robust PowerShell path). Avoid noisy output in check mode.
for /f "usebackq delims=" %%V in (`powershell -NoProfile -Command "$ProgressPreference='SilentlyContinue'; try { [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; ($v = (Invoke-WebRequest -UseBasicParsing '%RAW_VERSION_URL%').Content | ConvertFrom-Json).version; if([string]::IsNullOrWhiteSpace($v)){''} else {$v} } catch { '' }"`) do set "REMOTE_VERSION=%%V"
if not defined REMOTE_VERSION set "REMOTE_VERSION=0.0.0"

REM Compare variable-length semver via PowerShell; -1 if local<remote, 1 if local>remote
for /f "usebackq delims=" %%C in (`powershell -NoProfile -Command "function C([string]$l,[string]$r){$ls=$l.Trim().Split('.');$rs=$r.Trim().Split('.');$m=[Math]::Max($ls.Length,$rs.Length);for($i=0;$i -lt $m;$i++){ $li=0; $ri=0; [void][int]::TryParse(($ls[$i]),[ref]$li); [void][int]::TryParse(($rs[$i]),[ref]$ri); if($li -ne $ri){ return [Math]::Sign($li-$ri) } } return 0 }; C '%LOCAL_VERSION%' '%REMOTE_VERSION%'"`) do set "CMP=%%C"
if not defined CMP set "CMP=0"

set "UPDATE_AVAILABLE=0"
REM If remote > local then update is available; note our C returns -1 if local<remote
if "%CMP%"=="-1" set "UPDATE_AVAILABLE=1"

REM If called with "check" print JSON and exit
if /i "%~1"=="check" (
  echo {"ok":true,"updateAvailable":%UPDATE_AVAILABLE%,"localVersion":"%LOCAL_VERSION%","remoteVersion":"%REMOTE_VERSION%","repository":"%REPO_URL%","source":"batch"}
  exit /b 0
)

REM Otherwise, perform update if available
if "%UPDATE_AVAILABLE%"=="1" (
  echo [INFO] Update available: %LOCAL_VERSION% ^> %REMOTE_VERSION%
  set "INSTALL_DIR=%DESIRED_ROOT%"
  if not exist "%INSTALL_DIR%" (
    mkdir "%INSTALL_DIR%" >nul 2>nul
  )
  echo [INFO] Installing/updating into "%INSTALL_DIR%" using root InstallerLite.bat ...
  set "_OLD_CD=%CD%"
  pushd "%ROOT_DIR_NORM%" >nul
  REM Pass INSTALL_DIR to InstallerLite so it installs into desired root
  set "INSTALL_DIR=%INSTALL_DIR%"
  call cmd /c "%ROOT_DIR_NORM%\InstallerLite.bat"
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


