@echo off
setlocal
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
  echo Python was not found. Install Python 3, then run this file again.
  pause
  exit /b 1
)

start "" powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 1; Start-Process 'http://127.0.0.1:4173/'"
echo Local portfolio is running at http://127.0.0.1:4173/
echo Close this window to stop the local server.
python -m http.server 4173 --bind 127.0.0.1
