@echo off
title Movie Catalog Server

cd /d "%~dp0"

echo ===============================================
echo        Movie Catalog v5.3.0
echo ===============================================
echo.

call npm start

pause