@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"

set "APP_VER=unknown"
for /f "delims=" %%v in ('node -p "require('./package.json').version" 2^>nul') do set "APP_VER=%%v"
title Movie Catalog v%APP_VER%

echo ===============================================
echo        Movie Catalog v%APP_VER%
echo ===============================================
echo.

REM -- Node.js >= 18 (friendly bilingual message if missing/too old) ------
where node >nul 2>&1
if %errorlevel% neq 0 goto :node-missing

for /f "tokens=1 delims=." %%v in ('node --version') do set "NODE_RAW=%%v"
set "NODE_MAJOR=%NODE_RAW:~1%"
if %NODE_MAJOR% lss 18 goto :node-old

REM -- First run: install runtime dependencies automatically --------------
if exist node_modules goto :deps-done
echo  Installing dependencies for the first time (please wait)...
echo  در حال نصب برنامه‌های مورد نیاز برای بار اول؛ لطفاً صبر کنید...
echo.
call npm ci --omit=dev
if %errorlevel% neq 0 goto :npm-fail
echo.
:deps-done

REM -- LAN URLs for phones, then open the browser on this PC -------------
set "APP_PORT=3000"
for /f "usebackq delims=" %%p in (`node scripts\print-urls.js --port-only`) do set "APP_PORT=%%p"
node scripts\print-urls.js

start "" http://localhost:%APP_PORT%/

echo  Server is starting below. To stop, run Stop.bat or press Ctrl+C.
echo  سرور در حال اجراست. برای توقف، Stop.bat را اجرا کنید یا Ctrl+C بزنید.
echo.
node scripts\supervisor.js
set "SUP_RC=%errorlevel%"
if "%SUP_RC%"=="0" goto :clean-stop

echo.
echo  The server stopped because of a problem. Read the message above,
echo  fix the cause, then run Start.bat again. This window stays open
echo  so the message can be read.
echo  سرور به دلیل مشکلی متوقف شد. پیام بالا را بخوانید، مشکل را برطرف
echo  کنید و دوباره Start.bat را اجرا کنید. این پنجره برای خواندن پیام باز می‌ماند.
echo.
pause
exit /b %SUP_RC%

:clean-stop
exit /b 0

:node-missing
echo.
echo  Node.js is NOT installed.
echo  Node.js نصب نیست.
echo.
echo  Please install Node.js 18 or newer from https://nodejs.org
echo  then run Start.bat again.
echo  لطفاً Node.js نسخه ۱۸ یا جدیدتر را از https://nodejs.org نصب کنید
echo  و دوباره Start.bat را اجرا کنید.
echo.
pause
exit /b 1

:node-old
echo.
echo  Your Node.js version is %NODE_RAW% - version 18 or newer is required.
echo  نسخهٔ Node.js شما %NODE_RAW% است؛ نسخه ۱۸ یا جدیدتر لازم است.
echo.
echo  Please install a newer Node.js from https://nodejs.org
echo  لطفاً نسخه جدیدتر را از https://nodejs.org نصب کنید.
echo.
pause
exit /b 1

:npm-fail
echo.
echo  Installing dependencies failed.
echo  نصب برنامه‌های مورد نیاز ناموفق بود.
echo.
echo  Check the internet connection, run install.bat, then Start.bat again.
echo  اتصال اینترنت را بررسی کنید، install.bat و سپس Start.bat را اجرا کنید.
echo.
pause
exit /b 1
