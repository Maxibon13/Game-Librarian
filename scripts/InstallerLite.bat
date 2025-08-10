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

REM --- IF NOT A REPO: bootstrap; OTHERWISE: update ---
git rev-parse --git-dir >nul 2>nul
if errorlevel 1 goto :bootstrap
goto :update

:bootstrap
echo [INFO] Initializing a new git repository in "%CD%" ...
git init || goto :fail
REM Ensure origin is set to the desired URL (set or add)
git remote set-url origin "%REPO_URL%" 2>nul || git remote add origin "%REPO_URL%" || goto :fail

echo [INFO] Fetching branch "%BRANCH%" (shallow) ...
git fetch --force --tags --prune --depth=1 origin "%BRANCH%" || goto :fail

echo [INFO] Checking out branch "%BRANCH%" from origin ...
git checkout -B "%BRANCH%" "origin/%BRANCH%" || goto :fail

echo [INFO] Resetting working tree to origin/%BRANCH% ...
git reset --hard "origin/%BRANCH%" || goto :fail
git clean -fdx || goto :fail
goto :submodules

:update
echo [INFO] Updating existing repository ...
REM Keep remote origin URL correct
git remote set-url origin "%REPO_URL%" 2>nul || git remote add origin "%REPO_URL%" || goto :fail

echo [INFO] Fetching latest changes (with prune and tags) ...
git fetch --force --tags --prune origin || goto :fail

echo [INFO] Ensuring branch "%BRANCH%" tracks origin/%BRANCH% ...
git checkout -B "%BRANCH%" "origin/%BRANCH%" || goto :fail

echo [INFO] Resetting working tree to origin/%BRANCH% ...
git reset --hard "origin/%BRANCH%" || goto :fail
git clean -fdx || goto :fail

:submodules
REM Update submodules if any (no-op if none)
git submodule update --init --recursive --depth 1 >nul 2>nul

REM --- DEPENDENCIES ---
echo [INFO] Preparing Node.js dependencies ...
where npm >nul 2>nul || (
  echo [ERROR] npm is required but was not found in PATH.
  echo         Please install Node.js (which includes npm): https://nodejs.org/
  goto :fail
)

if exist "node_modules" (
  echo [INFO] Removing existing node_modules ...
  rmdir /s /q "node_modules"
)

if exist "package-lock.json" (
  echo [INFO] Installing dependencies with: npm ci --no-audit --no-fund
  npm ci --no-audit --no-fund || goto :npm_install_fallback
) else (
  goto :npm_install
)
goto :deps_done

:npm_install_fallback
echo [WARN] npm ci failed; falling back to: npm install --no-audit --no-fund

:npm_install
npm install --no-audit --no-fund || goto :fail

:deps_done
echo [INFO] Repository synchronized to branch: %BRANCH%
echo [INFO] Dependencies installed successfully.
popd >nul
endlocal
exit /b 0

:fail
echo [ERROR] Installer failed. The repository could not be synchronized or dependencies failed to install.
popd >nul 2>nul
endlocal
exit /b 1
