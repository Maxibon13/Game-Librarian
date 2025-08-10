@echo off
setlocal EnableDelayedExpansion

REM === CONFIG ===
set "REPO_URL=https://github.com/Maxibon13/Game-Librarian.git"
set "BRANCH=main"

REM Install/update in the PARENT directory of this script
set "SCRIPT_DIR=%~dp0"
set "TARGET_DIR=%SCRIPT_DIR%.."

REM Normalize TARGET_DIR by pushing then popping
pushd "%TARGET_DIR%" >nul
set "TARGET_DIR=%CD%"
popd >nul

echo [INFO] Target directory (parent of script): "%TARGET_DIR%"

pushd "%TARGET_DIR%" >nul

if not exist ".git\" (
    echo [INFO] Initializing repository in-place...
    git init
    if errorlevel 1 (
        echo [ERROR] git init failed.
        popd >nul
        exit /b 1
    )
    git remote add origin "%REPO_URL%" 2>nul
    git fetch --depth 1 origin %BRANCH%
    if errorlevel 1 (
        echo [ERROR] git fetch failed.
        popd >nul
        exit /b 1
    )
    git checkout -f -B %BRANCH% origin/%BRANCH%
    if errorlevel 1 (
        echo [ERROR] git checkout failed.
        popd >nul
        exit /b 1
    )
    git branch --set-upstream-to=origin/%BRANCH% %BRANCH% >nul 2>nul
    echo [INFO] Repository initialized and checked out to %BRANCH%.
) else (
    echo [INFO] Updating existing repository...
    git fetch --all --prune
    if errorlevel 1 (
        echo [ERROR] git fetch failed.
        popd >nul
        exit /b 1
    )
    git checkout %BRANCH%
    if errorlevel 1 (
        echo [ERROR] git checkout %BRANCH% failed.
        popd >nul
        exit /b 1
    )
    git pull --ff-only
    if errorlevel 1 (
        echo [WARN] git pull fast-forward failed; attempting hard reset to origin/%BRANCH% ...
        git reset --hard origin/%BRANCH%
        if errorlevel 1 (
            echo [ERROR] Could not synchronize repository to origin/%BRANCH%.
            popd >nul
            exit /b 1
        )
    )
    echo [INFO] Repository is synchronized with origin/%BRANCH%.
)

popd >nul

echo [INFO] Done.
exit /b 0


