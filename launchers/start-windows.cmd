@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-windows.ps1" %*
set "theatre_exit=%ERRORLEVEL%"
if not "%theatre_exit%"=="0" (
  echo Launch failed. Review the error above and launchers\README.md.
  pause
)
exit /b %theatre_exit%
