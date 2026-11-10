@echo off
title Custom Holidays - Tally Connector
echo.
echo  Custom Holidays - Tally Connector
echo  ----------------------------------
echo  This sends Tally's figures to the dashboard every 15 minutes while Tally is open.
echo  It only reads from Tally and never changes anything in it.
echo.
if not exist "%~dp0config.json" (
  echo  Please unzip the folder first, then run install.bat from the unzipped folder.
  pause
  exit /b 1
)
set "DEST=%LOCALAPPDATA%\CustomHolidays\TallyConnector"
if not exist "%DEST%" mkdir "%DEST%"
copy /Y "%~dp0tally-connector.ps1" "%DEST%\" >nul
copy /Y "%~dp0run-hidden.vbs"      "%DEST%\" >nul
copy /Y "%~dp0config.json"         "%DEST%\" >nul
copy /Y "%~dp0uninstall.bat"       "%DEST%\" >nul
schtasks /Create /F /SC MINUTE /MO 15 /TN "Custom Holidays Tally Connector" /TR "wscript.exe \"%DEST%\run-hidden.vbs\"" >nul
if errorlevel 1 (
  echo  Could not set up the 15-minute schedule. Right-click install.bat and choose "Run as administrator".
  pause
  exit /b 1
)
echo  Installed. Sending the first figures now...
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%DEST%\tally-connector.ps1" -Show
echo.
echo  If it says "Sent figures", you're done: open the Finance page on the dashboard.
echo  If it says "Could not read Tally", open Tally, load the company, and check
echo  Exchange ^> Data Synchronization: "TallyPrime act as" = Server or Both, Port = 9000.
echo  Then run install.bat again.
echo.
pause
