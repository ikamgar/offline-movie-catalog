@echo off
title Movie Catalog Server

cd /d "%~dp0"

echo ===============================================
echo        Movie Catalog v5.4.0
echo ===============================================
echo.

call npm start

pause