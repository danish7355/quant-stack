@echo off
setlocal enabledelayedexpansion
title QUANT PRO Trading Dashboard
cd /d "%~dp0"

echo ============================================================
echo               QUANT PRO - TRADING DASHBOARD                 
echo ============================================================
echo  [Mode] 24/7 Trading Engine ^& Real-Time Quant Dashboard
echo  [URL]  http://localhost:3000
echo ============================================================
echo.

:: 1. Verify Node.js installation
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js was not found in your system PATH!
    echo Please download and install Node.js from https://nodejs.org/ (v20+ recommended).
    echo.
    pause
    exit /b 1
)

:: 2. Verify npm installation
where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] npm was not found in your system PATH!
    echo.
    pause
    exit /b 1
)

:: 3. Check for dependencies
if not exist "node_modules\" (
    echo [INFO] First run detected: Installing dependencies (npm install)...
    echo Please wait, this may take a couple of minutes...
    echo.
    call npm install
    if %errorlevel% neq 0 (
        echo.
        echo [ERROR] Dependency installation failed. Please check your network and retry.
        echo.
        pause
        exit /b 1
    )
    echo [OK] Dependencies installed successfully!
    echo.
)

:: 4. Auto-launch the Dashboard in the default browser once server initializes
echo [INFO] Launching Trading Engine and Dashboard server...
echo [INFO] Automatically opening http://localhost:3000 in your browser...
echo.
start /b cmd /c "ping -n 4 127.0.0.1 >nul & start http://localhost:3000"

:: 5. Start development server
call npm run dev

if %errorlevel% neq 0 (
    echo.
    echo [NOTICE] Dashboard server terminated with exit code %errorlevel%.
    echo.
    pause
)
