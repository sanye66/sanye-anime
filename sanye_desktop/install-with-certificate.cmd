@echo off
setlocal
if /i "%~1"=="--check" goto check
if not "%~1"=="" exit /b 2
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-package.ps1"
set "RESULT=%ERRORLEVEL%"
if not "%RESULT%"=="0" pause
exit /b %RESULT%
:check
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0install-package.ps1" -CheckOnly
exit /b %ERRORLEVEL%
