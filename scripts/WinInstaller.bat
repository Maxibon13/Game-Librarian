@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM ==========================================
REM Game-Librarian Win Installer / Updater (Git)
REM ==========================================

REM --- CONFIG ---
set "REPO_URL=https://github.com/Maxibon13/Game-Librarian.git"
set "BRANCH=main"

REM --- TARGET DIR ---
set "SCRIPT_DIR=%~dp0"
if defined INSTALL_DIR (
  set "TARGET_DIR=%INSTALL_DIR%"
) else (
  REM Default to project root (parent of scripts)
  for %%I in ("%SCRIPT_DIR%..") do set "TARGET_DIR=%%~fI"
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

REM --- STEP 1/2: VALIDATE REPO AND CLONE TO TEMP DIRECTORY ---
set "TMP_BASE=%TEMP%\GameLibrarian_update"
set "TMP_DIR=%TMP_BASE%_%RANDOM%_%RANDOM%"

echo [INFO] Checking repository availability ...
git ls-remote --exit-code "%REPO_URL%" >nul 2>nul || (
  echo [ERROR] Could not reach repository: %REPO_URL%
  goto :fail
)

echo [INFO] Creating temporary directory: "%TMP_DIR%"
mkdir "%TMP_DIR%" >nul 2>nul || (
  echo [ERROR] Failed to create temporary directory.
  goto :fail
)

echo [INFO] Cloning "%REPO_URL%" (branch: %BRANCH%) into temp ...
git clone --depth 1 -b "%BRANCH%" --recurse-submodules --shallow-submodules "%REPO_URL%" "%TMP_DIR%" || goto :fail

REM --- STEP 3: COMPILE IN TEMP (after npm check) ---
echo [INFO] Ensuring Node.js is available ...
where node >nul 2>nul || (
  echo [ERROR] Node.js is required but was not found in PATH.
  echo         Please install Node.js: https://nodejs.org/
  goto :fail
)

pushd "%TMP_DIR%" >nul || goto :fail
echo [INFO] Installing dependencies in temp clone ...
call npm ci || call npm install || goto :fail

echo [INFO] Building UI with Vite in temp clone ...
call npm run build || goto :fail
popd >nul

REM --- STEP 4: COPY BUILT OUTPUT AND RELEVANT FILES TO ROOT (changed files only) ---
if exist "%TARGET_DIR%" (
  echo [INFO] Updating existing root with built files (changed files only) ...
  rem Copy dist
  if exist "%TMP_DIR%\dist" (
    robocopy "%TMP_DIR%\dist" "%TARGET_DIR%\dist" /E /R:1 /W:1 1>nul
  )
  rem Copy electron main process code
  if exist "%TMP_DIR%\electron" (
    robocopy "%TMP_DIR%\electron" "%TARGET_DIR%\electron" /E /R:1 /W:1 1>nul
  )
  rem Copy backend services code
  if exist "%TMP_DIR%\src\main" (
    robocopy "%TMP_DIR%\src\main" "%TARGET_DIR%\src\main" /E /R:1 /W:1 1>nul
  )
  rem Copy scripts
  if exist "%TMP_DIR%\scripts" (
    robocopy "%TMP_DIR%\scripts" "%TARGET_DIR%\scripts" /E /R:1 /W:1 1>nul
  )
  rem Copy version file
  if exist "%TMP_DIR%\Version.Json" (
    copy /Y "%TMP_DIR%\Version.Json" "%TARGET_DIR%\Version.Json" >nul 2>nul
  )
) else (
  echo [INFO] Target root does not exist, creating fresh copy ...
  robocopy "%TMP_DIR%" "%TARGET_DIR%" /E /R:1 /W:1 /XD .git node_modules 1>nul
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


