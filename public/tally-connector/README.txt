CUSTOM HOLIDAYS - TALLY CONNECTOR
=================================

What it does
  Every 15 minutes, while Tally is open, it reads the totals from Tally (sales, costs,
  profit, what clients owe, what we owe suppliers, bank and cash balances) and sends
  them to the Finance page of the dashboard. It only reads. It never changes Tally.

Set up (once, on the computer that has Tally)
  1. In Tally, load the company. Then go to Exchange > Data Synchronization and set:
       TallyPrime act as : Server   (or Both)
       Port              : 9000
     Press Ctrl+A to save. (In Tally ERP 9: F12 > Advanced Configuration.)
  2. Right-click this zip > Extract All. Open the extracted folder.
  3. Double-click install.bat. A window shows the first send. It should say "Sent figures".

Good to know
  - Tally has to be open for figures to update. When it is closed, the dashboard shows
    when it last heard from Tally.
  - To stop it: run uninstall.bat (copied to %LOCALAPPDATA%\CustomHolidays\TallyConnector).
  - Its log is connector.log in that same folder.
  - The connector has a private key in config.json. If you download a new connector from
    the dashboard, the old one stops working, so install the new one.
