# Custom Holidays - Tally Connector
# Sends Tally's figures to the Custom Holidays dashboard (Finance page).
# It only READS from Tally. It never changes anything in Tally.
# install.bat sets it to run every 15 minutes. Run it by hand with:  powershell -ExecutionPolicy Bypass -File tally-connector.ps1 -Show
param([switch]$Show)

$ErrorActionPreference = 'Stop'
$version = '1.0'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$here    = Split-Path -Parent $MyInvocation.MyCommand.Path
$cfg     = Get-Content -Raw -Path (Join-Path $here 'config.json') | ConvertFrom-Json
$logFile = Join-Path $here 'connector.log'

function Write-Log([string]$msg) {
  $line = (Get-Date -Format 'yyyy-MM-dd HH:mm') + '  ' + $msg
  if ($Show) { Write-Host $line }
  try {
    if ((Test-Path $logFile) -and ((Get-Item $logFile).Length -gt 200KB)) { Clear-Content -Path $logFile }
    Add-Content -Path $logFile -Value $line -Encoding UTF8
  } catch {}
}

function Ask-Tally([string]$xml) {
  $bytes = [Text.Encoding]::UTF8.GetBytes($xml)
  $req = [Net.WebRequest]::Create('http://localhost:' + $cfg.tallyPort)
  $req.Method = 'POST'; $req.ContentType = 'text/xml;charset=utf-8'; $req.Timeout = 180000
  $s = $req.GetRequestStream(); $s.Write($bytes, 0, $bytes.Length); $s.Close()
  $resp = $req.GetResponse()
  $ms = New-Object IO.MemoryStream
  $resp.GetResponseStream().CopyTo($ms); $resp.Close()
  $b = $ms.ToArray()
  if ($b.Length -ge 2 -and $b[0] -eq 0xFF -and $b[1] -eq 0xFE) { return [Text.Encoding]::Unicode.GetString($b, 2, $b.Length - 2) }
  if ($b.Length -ge 3 -and $b[0] -eq 0xEF -and $b[1] -eq 0xBB -and $b[2] -eq 0xBF) { return [Text.Encoding]::UTF8.GetString($b, 3, $b.Length - 3) }
  if ($b.Length -ge 2 -and $b[1] -eq 0) { return [Text.Encoding]::Unicode.GetString($b) }   # UTF-16 without a marker
  return [Text.Encoding]::UTF8.GetString($b)
}

function Get-Collection([string]$type, [string]$fetch, [datetime]$from, [datetime]$to) {
  $company = ''
  if ($cfg.company) { $company = '<SVCURRENTCOMPANY>' + [Security.SecurityElement]::Escape([string]$cfg.company) + '</SVCURRENTCOMPANY>' }
  $id = 'CH' + $type
  $xml = '<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>' + $id + '</ID></HEADER>' +
         '<BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>' +
         '<SVFROMDATE>' + $from.ToString('yyyyMMdd') + '</SVFROMDATE><SVTODATE>' + $to.ToString('yyyyMMdd') + '</SVTODATE>' + $company +
         '</STATICVARIABLES><TDL><TDLMESSAGE><COLLECTION NAME="' + $id + '" ISMODIFY="No"><TYPE>' + $type + '</TYPE>' +
         '<FETCH>' + $fetch + '</FETCH></COLLECTION></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>'
  $answer = Ask-Tally $xml
  if ($answer -match '<LINEERROR>([^<]*)</LINEERROR>') { throw ('Tally said: ' + $Matches[1]) }
  return $answer
}

function Send-ToDashboard([hashtable]$body) {
  $json  = $body | ConvertTo-Json -Depth 6 -Compress
  $bytes = [Text.Encoding]::UTF8.GetBytes($json)
  Invoke-RestMethod -Uri ($cfg.apiUrl + '/finance/tally/push') -Method Post -Body $bytes `
    -ContentType 'application/json; charset=utf-8' -Headers @{ 'X-Connector-Key' = [string]$cfg.key } -TimeoutSec 180 | Out-Null
}

# --- 1. Read from Tally ---
$today   = (Get-Date).Date
$fyYear  = if ($today.Month -ge 4) { $today.Year } else { $today.Year - 1 }
$fyStart = (New-Object DateTime $fyYear, 4, 1)
$dates = @()
$d = $fyStart.AddMonths(1).AddDays(-1)
while ($d -lt $today) { $dates += $d; $d = $d.AddDays(1).AddMonths(1).AddDays(-1) }
$dates += $today

try {
  $companyName = [string]$cfg.company
  if (-not $companyName) {
    $c = Get-Collection 'Company' 'Name' $fyStart $today
    if ($c -match '<COMPANY NAME="([^"]+)"') { $companyName = $Matches[1] }
  }
  $groups = @()
  foreach ($dt in $dates) {
    $groups += @{ to = $dt.ToString('yyyyMMdd'); xml = (Get-Collection 'Group' 'Name, Parent, ClosingBalance' $fyStart $dt) }
  }
  $ledgersNow  = Get-Collection 'Ledger' 'Name, Parent, ClosingBalance' $fyStart $today
  $ledgersPrev = ''
  $prevEnd = (New-Object DateTime $today.Year, $today.Month, 1).AddDays(-1)
  if ($prevEnd -ge $fyStart) { $ledgersPrev = Get-Collection 'Ledger' 'Name, Parent, ClosingBalance' $fyStart $prevEnd }
} catch {
  $why = $_.Exception.Message
  Write-Log ('Could not read Tally: ' + $why)
  try {
    Send-ToDashboard @{ status = 'tally_closed'; version = $version; company = [string]$cfg.company
      message = 'Tally is not open on the finance computer, or its connection setting is off. ' + $why }
  } catch { Write-Log ('Could not reach the dashboard either: ' + $_.Exception.Message) }
  exit 1
}

# --- 2. Send to the dashboard ---
try {
  Send-ToDashboard @{ status = 'ok'; version = $version; company = $companyName; fy_start = $fyStart.ToString('yyyyMMdd')
    groups = $groups; ledgers_now = $ledgersNow; ledgers_prev_month = $ledgersPrev }
  Write-Log ('Sent figures for ' + $companyName + ' up to ' + $today.ToString('d MMM yyyy'))
} catch {
  Write-Log ('Could not send to the dashboard: ' + $_.Exception.Message)
  exit 1
}
