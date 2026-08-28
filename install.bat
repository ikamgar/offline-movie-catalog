@echo off
setlocal

cd /d "%~dp0"

echo.
echo  ╔════════════════════════════════════════╗
echo  ║    MovieCatalog v5.4.0 - Setup         ║
echo  ╚════════════════════════════════════════╝
echo.

REM ── Step 1: Verify Node.js is installed ────────────────────────────────────

echo  [1/2] Checking Node.js installation...

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  ╔════════════════════════════════════════╗
    echo  ║  ERROR: Node.js is not installed!      ║
    echo  ╚════════════════════════════════════════╝
    echo.
    echo  Node.js is required to run this application.
    echo.
    echo  Please download and install Node.js from:
    echo    https://nodejs.org
    echo.
    echo  After installing Node.js, run this script again.
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo        Node.js found: %NODE_VERSION%

REM ── Step 2: Install npm dependencies ───────────────────────────────────────

echo.
echo  [2/2] Installing npm dependencies...
echo        This may take a few minutes on first run.
echo.

call npm install
if %errorlevel% neq 0 (
    echo.
    echo  ╔════════════════════════════════════════╗
    echo  ║  ERROR: npm install failed!            ║
    echo  ╚════════════════════════════════════════╝
    echo.
    echo  Please check your internet connection and try again.
    echo.
    pause
    exit /b 1
)

REM ── Success ────────────────────────────────────────────────────────────────

echo.
echo  ╔════════════════════════════════════════╗
echo  ║  Setup completed successfully!         ║
echo  ╚════════════════════════════════════════╝
echo.
echo  All dependencies have been installed.
echo.
echo  To start the application, run:
echo    Start.bat
echo.
echo  Or manually:
echo    npm start
echo.
pause
