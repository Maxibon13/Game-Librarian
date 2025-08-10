@echo off
setlocal EnableDelayedExpansion

REM === CONFIG ===
set "REPO_URL=https://github.com/Maxibon13/Game-Librarian.git"
set "BRANCH=main"

REM Install/update into INSTALL_DIR if provided; otherwise PARENT directory of this script
set "SCRIPT_DIR=%~dp0"
if defined INSTALL_DIR (
    set "TARGET_DIR=%INSTALL_DIR%"
 ) else (
    set "TARGET_DIR=%SCRIPT_DIR%.."
 )

REM Normalize TARGET_DIR by pushing then popping
if not exist "%TARGET_DIR%" (
    mkdir "%TARGET_DIR%" >nul 2>nul
)
pushd "%TARGET_DIR%" >nul
set "TARGET_DIR=%CD%"
popd >nul

echo [INFO] Target directory: "%TARGET_DIR%"

pushd "%TARGET_DIR%" >nul

REM Prefer git if available, otherwise fallback to ZIP download
where git >nul 2>nul
if errorlevel 1 goto :zip_fallback

if not exist ".git\" (
    echo [INFO] [git] Initializing repository in-place...
    git init
    if errorlevel 1 (
        echo [ERROR] [git] git init failed.
        popd >nul
        exit /b 1
    )
    git remote add origin "%REPO_URL%" 2>nul
    echo [INFO] [git] Fetching %BRANCH% ...
    git fetch --depth 1 origin %BRANCH%
    if errorlevel 1 (
        echo [ERROR] [git] git fetch failed.
        popd >nul
        exit /b 1
    )
    echo [INFO] [git] Checking out %BRANCH% ...
    git checkout -f -B %BRANCH% origin/%BRANCH%
    if errorlevel 1 (
        echo [ERROR] [git] git checkout failed.
        popd >nul
        exit /b 1
    )
    git branch --set-upstream-to=origin/%BRANCH% %BRANCH% >nul 2>nul
    echo [INFO] [git] Repository initialized and checked out to %BRANCH%.
) else (
    echo [INFO] [git] Updating existing repository...
    git fetch --all --prune
    if errorlevel 1 (
        echo [ERROR] [git] git fetch failed.
        popd >nul
        exit /b 1
    )
    git checkout %BRANCH%
    if errorlevel 1 (
        echo [ERROR] [git] git checkout %BRANCH% failed.
        popd >nul
        exit /b 1
    )
    git pull --ff-only
    if errorlevel 1 (
        echo [WARN] [git] git pull fast-forward failed; attempting hard reset to origin/%BRANCH% ...
        git reset --hard origin/%BRANCH%
        if errorlevel 1 (
            echo [ERROR] [git] Could not synchronize repository to origin/%BRANCH%.
            popd >nul
            exit /b 1
        )
    )
    echo [INFO] [git] Repository is synchronized with origin/%BRANCH%.
)
goto :done

:zip_fallback
echo [INFO] [zip] git not available; falling back to ZIP download.
set "ZIP_URL=https://codeload.github.com/Maxibon13/Game-Librarian/zip/refs/heads/%BRANCH%"
set "TMP_ZIP=%TEMP%\gamelibrarian_repo.zip"
del /q "%TMP_ZIP%" >nul 2>nul
echo [INFO] [zip] Downloading archive ...
powershell -NoProfile -Command "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -UseBasicParsing '%ZIP_URL%' -OutFile '%TMP_ZIP%'" || (
    echo [ERROR] [zip] Download failed.
    popd >nul & exit /b 1
)
echo [INFO] [zip] Clearing target directory ...
for /f %%I in ('dir /b') do (
  if /I not "%%I"=="." if /I not "%%I"==".." rmdir /s /q "%%I" 2>nul & del /f /q "%%I" 2>nul
)
echo [INFO] [zip] Extracting archive ...
powershell -NoProfile -Command "Expand-Archive -Force '%TMP_ZIP%' '%TARGET_DIR%'" || (
    echo [ERROR] [zip] Extract failed.
    popd >nul & exit /b 1
)
for /d %%D in ("%TARGET_DIR%\Game-Librarian-%BRANCH%") do (
  echo [INFO] [zip] Moving files into place ...
  xcopy /e /h /y "%%~fD\*" "%TARGET_DIR%\" >nul
  rmdir /s /q "%%~fD" >nul 2>nul
)
del /q "%TMP_ZIP%" >nul 2>nul
echo [INFO] [zip] Repository synchronized via ZIP.

:done

popd >nul

echo [INFO] Done.
exit /b 0


