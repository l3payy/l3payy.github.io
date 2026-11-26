@echo off
setlocal EnableExtensions
title Preview NewPortfolio
cd /d "%~dp0"
if errorlevel 1 (
  echo [ERROR] Project folder not found.
  pause
  exit /b 1
)

echo === build frames ===
node build-frames.js
if errorlevel 1 (
  echo.
  echo [ERROR] build-frames.js failed. Server was not started.
  pause
  exit /b 1
)

netstat -ano | findstr /R /C:":4173 .*LISTENING" >nul
if not errorlevel 1 (
  echo.
  echo [OK] Server is already running: http://127.0.0.1:4173/
  start "" "http://127.0.0.1:4173/?t=%RANDOM%%RANDOM%"
  exit /b 0
)

echo.
echo === local preview: http://127.0.0.1:4173/ ===
echo Press Ctrl+C to stop the server.
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Milliseconds 1200; Start-Process 'http://127.0.0.1:4173/?t=%RANDOM%%RANDOM%'"
python -m http.server 4173 --bind 127.0.0.1
echo.
echo Server stopped.
pause
