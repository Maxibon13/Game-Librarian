@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM ==========================================
REM Game-Librarian Installer / Updater (Git)
REM ==========================================

REM --- CONFIG ---
set "REPO_URL=https://github.com/Maxibon13/Game-Librarian.git"
set "BRANCH=main"

REM --- TARGET DIR ---
set "SCRIPT_DIR=%~dp0"
if defined INSTALL_DIR (
  set "TARGET_DIR=%INSTALL_DIR%"
) else (
  set "TARGET_DIR=%SCRIPT_DIR%.."
)

if not exist "%TARGET_DIR%" mkdir "%TARGET_DIR%" >nul 2>nul
pushd "%TARGET_DIR%" >nul || (
  echo [ERROR] Failed to access target directory: "%TARGET_DIR%"
  exit /b 1
)
set "TARGET_DIR=%CD%"

echo [INFO] Target directory: "%TARGET_DIR%"

REM --- REQUIREMENTS ---
where git >nul 2>nul || (
  echo [ERROR] Git is required but was not found in PATH.
  echo         Please install Git: https://git-scm.com/download/win
  popd >nul & exit /b 1
)

REM Avoid interactive prompts from Git (credentials, etc.)
set "GIT_TERMINAL_PROMPT=0"

REM Silence safe.directory warnings when run elevated
git config --global --add safe.directory "%CD%" >nul 2>nul

REM --- CLONE TO TEMP DIRECTORY ---
set "TMP_BASE=%TEMP%\GameLibrarian_update"
set "TMP_DIR=%TMP_BASE%_%RANDOM%_%RANDOM%"

echo [INFO] Creating temporary directory: "%TMP_DIR%"
mkdir "%TMP_DIR%" >nul 2>nul || (
  echo [ERROR] Failed to create temporary directory.
  goto :fail
)

echo [INFO] Cloning "%REPO_URL%" (branch: %BRANCH%) into temp ...
git clone --depth 1 -b "%BRANCH%" --recurse-submodules --shallow-submodules "%REPO_URL%" "%TMP_DIR%" || goto :fail

REM --- COPY CHANGED EXISTING FILES ONLY (exclude new files) ---
echo [INFO] Updating existing files from temp clone (excluding new files) ...
robocopy "%TMP_DIR%" "%TARGET_DIR%" /E /XL /R:1 /W:1 /XD .git node_modules /XF InstallerLite.bat 1>nul
set "RC=%ERRORLEVEL%"
if %RC% GEQ 8 (
  echo [ERROR] File update failed with robocopy exit code %RC%.
  goto :fail
)

REM --- SUCCESS ---
:success
call :cleanup_tmp
echo [INFO] Repository synchronized to branch: %BRANCH%
REM Launch run.bat to restart the app, then close this installer window
if exist "%TARGET_DIR%\run.bat" (
  echo [INFO] Launching run.bat ...
  start "" /D "%TARGET_DIR%" run.bat
) else (
  echo [WARN] run.bat not found at "%TARGET_DIR%\run.bat". Skipping launch.
)
popd >nul
endlocal
exit

:fail
echo [ERROR] Installer failed. The repository could not be synchronized.
call :cleanup_tmp
popd >nul 2>nul
endlocal
exit /b 1

:cleanup_tmp
echo [INFO] Removing temporary directory ...
rmdir /s /q "%TMP_DIR%" >nul 2>nul
exit /b 0
