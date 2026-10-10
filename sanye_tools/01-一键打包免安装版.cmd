@echo off
setlocal
set "sanye_ps=pwsh.exe"
where %sanye_ps% >nul 2>nul
if errorlevel 1 set "sanye_ps=powershell.exe"
where %sanye_ps% >nul 2>nul
if errorlevel 1 (
  echo PowerShell is required. Install PowerShell 7 or enable Windows PowerShell.
  pause
  exit /b 1
)
%sanye_ps% -NoProfile -ExecutionPolicy Bypass -File "%~dp0run.ps1" -Action portable %*
set "sanye_result=%errorlevel%"
if not "%sanye_result%"=="0" echo Failed. See the error above.
pause
exit /b %sanye_result%
