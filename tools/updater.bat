@echo off
setlocal EnableDelayedExpansion

REM Updater for Game Librarian
REM - Reads local Version.Json (string labels like "(1.0) 160926 - Pre")
REM - Fetches the same file from GitHub main
REM - Prints JSON status in "check" mode
REM - Optionally launches installer\Installer.exe

set "REPO_URL=https://github.com/Maxibon13/Game-Librarian"
set "RAW_VERSION_URL=https://raw.githubusercontent.com/Maxibon13/Game-Librarian/main/Version.Json"

set "SCRIPT_DIR=%~dp0"
set "ROOT_DIR=%SCRIPT_DIR%.."
for %%I in ("%ROOT_DIR%.") do set "ROOT_DIR_NORM=%%~fI"
set "LOCAL_VERSION_JSON=%ROOT_DIR_NORM%\Version.Json"
set "VERSION_PS1=%SCRIPT_DIR%version.ps1"

for %%I in ("%ROOT_DIR_NORM%") do set "CURRENT_ROOT_NAME=%%~nI"
for %%I in ("%ROOT_DIR_NORM%\..") do set "ROOT_PARENT=%%~fI"
set "DESIRED_ROOT=%ROOT_PARENT%\Game Librarian"

if /i "%~1"=="check" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%VERSION_PS1%" -LocalJson "%LOCAL_VERSION_JSON%" -RemoteUrl "%RAW_VERSION_URL%" -RepoUrl "%REPO_URL%"
  exit /b 0
)

for /f "usebackq delims=" %%U in (`powershell -NoProfile -ExecutionPolicy Bypass -File "%VERSION_PS1%" -LocalJson "%LOCAL_VERSION_JSON%" -RemoteUrl "%RAW_VERSION_URL%" -RepoUrl "%REPO_URL%" -FlagOnly`) do set "UPDATE_AVAILABLE=%%U"
if not defined UPDATE_AVAILABLE set "UPDATE_AVAILABLE=0"

if "%UPDATE_AVAILABLE%"=="1" (
  echo [INFO] Update available
  set "INSTALL_DIR=%DESIRED_ROOT%"
  if not exist "%INSTALL_DIR%" (
    mkdir "%INSTALL_DIR%" >nul 2>nul
  )
  echo [INFO] Installing/updating into "%INSTALL_DIR%" using installer executable/GUI when available ...
  set "INSTALLER_DIR=%ROOT_DIR_NORM%\installer"
  pushd "%INSTALLER_DIR%" >nul
  set "INSTALL_DIR=%INSTALL_DIR%"
  if exist "%INSTALLER_DIR%\Installer.exe" (
    echo [INFO] Launching Installer.exe
    start "Installer" /b "%INSTALLER_DIR%\Installer.exe"
    set "ERR=%ERRORLEVEL%"
  ) else if exist "%INSTALLER_DIR%\src\installer_gui.pyw" (
    echo [INFO] Launching Python installer GUI (installer_gui.pyw)
    start "Installer" cmd /c "py -3 \"%INSTALLER_DIR%\src\installer_gui.pyw\""
    set "ERR=%ERRORLEVEL%"
  ) else (
    echo [ERROR] No installer found in "%INSTALLER_DIR%"
    set "ERR=1"
  )
  popd >nul
  if not "%ERR%"=="0" (
    echo [ERROR] Installer failed with code %ERR%.
    exit /b %ERR%
  )
  echo [INFO] Update complete.
  exit /b 0
) else (
  echo [INFO] Already up to date.
  exit /b 0
)
