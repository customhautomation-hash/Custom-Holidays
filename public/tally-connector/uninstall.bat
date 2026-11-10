@echo off
schtasks /Delete /F /TN "Custom Holidays Tally Connector" >nul 2>&1
echo The Tally Connector is switched off. It will no longer send figures to the dashboard.
echo (Its files are in %LOCALAPPDATA%\CustomHolidays\TallyConnector and can be deleted.)
pause
