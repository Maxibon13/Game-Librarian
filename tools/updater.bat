@echo off
setlocal EnableDelayedExpansion

set "REPO_URL=https://github.com/Maxibon13/Game-Librarian"
set "RAW_VERSION_URL=https://raw.githubusercontent.com/Maxibon13/Game-Librarian/main/Version.Json"

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..") do set "ROOT_DIR_NORM=%%~fI"
set "LOCAL_VERSION_JSON=%ROOT_DIR_NORM%\Version.Json"
set "VERSION_PS1=%SCRIPT_DIR%version.ps1"

REM Packaged layout: <install root>\resources\tools\updater.bat -> install root is two levels up.
REM Dev layout: <repo>\tools\updater.bat -> repo root. INSTALL_DIR (set by the app) wins when present.
for %%I in ("%ROOT_DIR_NORM%\..") do set "ROOT_PARENT=%%~fI"
if exist "%ROOT_DIR_NORM%\package.json" (
  set "DESIRED_ROOT=%ROOT_DIR_NORM%"
) else (
  set "DESIRED_ROOT=%ROOT_PARENT%"
)
if defined INSTALL_DIR set "DESIRED_ROOT=%INSTALL_DIR%"

if /i "%~1"=="check" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%VERSION_PS1%" -LocalJson "%LOCAL_VERSION_JSON%" -RemoteUrl "%RAW_VERSION_URL%" -RepoUrl "%REPO_URL%"
  exit /b 0
)

for /f "usebackq delims=" %%U in (`powershell -NoProfile -ExecutionPolicy Bypass -File "%VERSION_PS1%" -LocalJson "%LOCAL_VERSION_JSON%" -RemoteUrl "%RAW_VERSION_URL%" -RepoUrl "%REPO_URL%" -FlagOnly`) do set "UPDATE_AVAILABLE=%%U"
if not defined UPDATE_AVAILABLE set "UPDATE_AVAILABLE=0"

set "INSTALLER_DIR=%ROOT_DIR_NORM%\installer"
set "TEMP_UPDATER=%TEMP%\GameLibrarian_update"

if "%UPDATE_AVAILABLE%"=="1" (
  echo [INFO] Update available
  set "INSTALL_DIR=%DESIRED_ROOT%"
  echo [INFO] Launching installer to update "!INSTALL_DIR!" ...
  for /f "usebackq delims=" %%V in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "try { ((Invoke-WebRequest -UseBasicParsing '%RAW_VERSION_URL%').Content | ConvertFrom-Json).version } catch { }"`) do set "GL_REMOTE_VERSION=%%V"
  if defined GL_REMOTE_VERSION echo [INFO] Remote version: !GL_REMOTE_VERSION!
  if exist "%INSTALLER_DIR%\Installer.exe" (
    if not exist "%TEMP_UPDATER%" mkdir "%TEMP_UPDATER%"
    copy /Y "%INSTALLER_DIR%\Installer.exe" "%TEMP_UPDATER%\Installer.exe" >nul
    set "GL_UPDATER_TEMP=1"
    echo [INFO] Launching Installer.exe from temp
    start "Installer" /b "%TEMP_UPDATER%\Installer.exe" --update
    set "ERR=!ERRORLEVEL!"
  ) else if exist "%INSTALLER_DIR%\src\installer_gui.pyw" (
    echo [INFO] Launching Python installer GUI (installer_gui.pyw)
    start "Installer" cmd /c "py -3 \"%INSTALLER_DIR%\src\installer_gui.pyw\" --update"
    set "ERR=!ERRORLEVEL!"
  ) else (
    echo [ERROR] No installer found in "%INSTALLER_DIR%"
    set "ERR=1"
  )
  if not "!ERR!"=="0" (
    echo [ERROR] Installer failed with code !ERR!.
    exit /b !ERR!
  )
  echo [INFO] Installer started. It downloads the latest release and updates the app.
  exit /b 0
) else (
  echo [INFO] Already up to date.
  exit /b 0
)
