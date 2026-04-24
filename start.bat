@echo off
title Tally Team Manager

echo ========================================
echo   Tally Team Manager - Starting...
echo ========================================

:: Kill any existing processes on our ports
echo [0/3] Cleaning up old processes...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5172 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5174 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5175 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1

:: Set node path
set NODE_DIR=C:\Users\Xince\.workbuddy\binaries\node\versions\22.12.0.installing.11096.__extract_temp__\node-v22.12.0-win-x64
set NODE=%NODE_DIR%\node.exe

:: Start backend on port 5172
echo [1/3] Starting FastAPI backend on port 5172...
start "Tally Backend" cmd /k "cd /d %~dp0backend && python -m uvicorn app.main:app --host 0.0.0.0 --port 5172 --reload"

:: Wait for backend to initialize
timeout /t 3 /nobreak >nul

:: Start frontend on port 5175
echo [2/3] Starting React frontend on port 5175...
start "Tally Frontend" cmd /k "cd /d %~dp0frontend && ""%NODE%"" node_modules\vite\bin\vite.js --host 0.0.0.0 --port 5175"

timeout /t 5 /nobreak >nul

:: Get local IP for LAN access
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4"') do (
    set "IP=%%a"
    goto :got_ip
)
:got_ip
set "IP=%IP:~1%"

echo ========================================
echo   Tally Team Manager is running!
echo ========================================
echo.
echo  Local:   http://localhost:5175
echo  LAN:      http://%IP%:5175
echo  API:      http://localhost:5172/docs
echo.
echo  Press any key to close this window...
pause >nul
