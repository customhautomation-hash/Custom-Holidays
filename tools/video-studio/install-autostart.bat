@echo off
rem Starts the video studio automatically every time someone signs in to this PC.
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
(
  echo @echo off
  echo call "%~dp0start-video-studio.bat"
) > "%STARTUP%\Custom Holidays video studio.bat"
echo The video studio will now start on its own when this PC is switched on and signed in.
echo To stop that, delete "Custom Holidays video studio.bat" from:
echo %STARTUP%
pause
