@echo off
title QUANT PRO Trading Dashboard
cd /d "%~dp0"

echo ============================================================
echo               QUANT PRO - TRADING DASHBOARD                 
echo ============================================================
echo  [Mode] 24/7 Trading Engine ^& Real-Time Quant Dashboard
echo  [URL]  http://localhost:3000
echo ============================================================
echo.

REM 1. Check Node.js
where node >nul 2>&1
if errorlevel 1 goto NO_NODE

REM 2. Check npm
where npm >nul 2>&1
if errorlevel 1 goto NO_NPM

REM 3. Check if server is already running on port 3000
netstat -ano | findstr /R /C:":3000 .*LISTENING" >nul 2>&1
if not errorlevel 1 goto ALREADY_RUNNING

REM 4. Check dependencies
if not exist "node_modules\" (
    echo [INFO] First-time setup: Installing dependencies...
    call npm install
    if errorlevel 1 goto INSTALL_FAILED
)

REM 5. Launch Trading Engine and Dashboard
echo [INFO] Starting Trading Engine and Dashboard...
echo [INFO] Browser will automatically open at http://localhost:3000 once ready...
echo.

call npm run dev
if errorlevel 1 goto RUN_ERROR
goto END

:ALREADY_RUNNING
echo [INFO] Dashboard is ALREADY running on port 3000!
echo [INFO] Landing to site: http://localhost:3000 ...
echo.
start http://localhost:3000
timeout /t 3 >nul 2>&1
exit /b 0

:NO_NODE
echo.
echo [ERROR] Node.js was not found in your system PATH!
echo Please download and install Node.js (v20+ recommended) from https://nodejs.org/
echo.
pause
exit /b 1

:NO_NPM
echo.
echo [ERROR] npm was not found in your system PATH!
echo.
pause
exit /b 1

:INSTALL_FAILED
echo.
echo [ERROR] Failed to install dependencies. Please verify network and try again.
echo.
pause
exit /b 1

:RUN_ERROR
echo.
echo [NOTICE] Dashboard server terminated with error code %errorlevel%.
echo.
pause
exit /b %errorlevel%

:END
exit /b 0
