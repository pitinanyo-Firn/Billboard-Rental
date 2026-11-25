@echo off
rem Billboard Rental Hub - Windows installer (current user, no admin needed)
title Billboard Rental Hub - Setup
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-BillboardRentalHub.ps1" %*
if errorlevel 1 (
  echo.
  echo Setup failed. Please send a screenshot of this window to the system administrator.
  pause
)
