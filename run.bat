@echo off
setlocal EnableExtensions

REM Prefer launching packaged app if available; fallback to dev run
set "BASE=%~dp0"
set "UNPACKED=%BASE%dist\win-unpacked"
set "EXE=%UNPACKED%\Game Librarian.exe"

if exist "%EXE%" (
  echo [INFO] Starting packaged app ...
  start "Game Librarian" "%EXE%"
) else (
  echo [INFO] Packaged app not found. Starting development server ...
  call powershell -NoProfile -ExecutionPolicy Bypass -Command npm run dev
)

endlocal
