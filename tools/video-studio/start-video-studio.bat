@echo off
title Custom Holidays - Video studio
rem =====================================================================
rem  Starts ComfyUI, the dashboard gate and the permanent public address.
rem  Change COMFY_DIR if ComfyUI is in a different folder on this PC.
rem =====================================================================
set "COMFY_DIR=C:\Users\ADMIN\Desktop\AI\ComfyUI"
rem  Using ngrok instead of Tailscale? Put your free ngrok address here, e.g. set "NGROK_URL=your-name.ngrok-free.app"
set "NGROK_URL="

rem --- Find ComfyUI and its Python (normal install or the portable version) ---
set "PY="
set "MAIN_DIR="
if exist "%COMFY_DIR%\venv\Scripts\python.exe" if exist "%COMFY_DIR%\main.py" ( set "PY=%COMFY_DIR%\venv\Scripts\python.exe" & set "MAIN_DIR=%COMFY_DIR%" )
if not defined PY if exist "%COMFY_DIR%\python_embeded\python.exe" if exist "%COMFY_DIR%\ComfyUI\main.py" ( set "PY=%COMFY_DIR%\python_embeded\python.exe" & set "MAIN_DIR=%COMFY_DIR%\ComfyUI" )
if not defined PY if exist "%COMFY_DIR%\main.py" ( set "PY=python" & set "MAIN_DIR=%COMFY_DIR%" )
if not defined PY (
  echo  ComfyUI was not found in %COMFY_DIR%
  echo  Open this file in Notepad and change COMFY_DIR to the folder that has ComfyUI's main.py.
  pause
  exit /b 1
)

echo  Starting ComfyUI...
start "ComfyUI" /min cmd /k "cd /d "%MAIN_DIR%" && "%PY%" main.py --listen 127.0.0.1 --port 8188"

echo  Starting the dashboard gate...
start "Video studio gate" /min cmd /k ""%PY%" "%~dp0comfy-gate.py""

if defined NGROK_URL (
  echo  Opening the ngrok address %NGROK_URL% ...
  start "ngrok" /min cmd /k "ngrok http 8189 --url=%NGROK_URL%"
) else (
  where tailscale >nul 2>&1
  if errorlevel 1 (
    echo  Tailscale is not installed yet, so the dashboard can't reach this PC. See README.txt.
  ) else (
    tailscale funnel --bg 8189 >nul 2>&1
    echo  Public address is on. To see it, run:  tailscale funnel status
  )
)
echo.
echo  Video studio is running. Keep the minimised windows open while the team makes videos.
timeout /t 8 >nul
