@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

if not exist logs mkdir logs
echo stop> logs\stop.request

echo.
echo  Stop requested. The server will shut down in a few seconds.
echo  درخواست توقف ثبت شد؛ سرور تا چند ثانیه دیگر می‌بندد.
echo.
pause
