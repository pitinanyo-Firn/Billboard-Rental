# Billboard Rental Hub — ตัวติดตั้ง Windows (ติดตั้งสำหรับผู้ใช้ปัจจุบัน ไม่ต้องใช้สิทธิ์ admin)
#   ดับเบิลคลิก Install.cmd  หรือ  powershell -ExecutionPolicy Bypass -File Install-BillboardRentalHub.ps1 [-Quiet] [-Browser edge|chrome]
#
# สิ่งที่ทำ:
#   1. คัดลอกไอคอน + ตัวถอนการติดตั้ง ไปที่ %LOCALAPPDATA%\Programs\BillboardRentalHub
#   2. สร้างไอคอน "Billboard Rental Hub" บน Desktop และ Start Menu — เปิดเป็นหน้าต่างแอปแยก (Edge / Chrome --app)
#   3. ลงทะเบียนใน Settings → Apps (ถอนการติดตั้งได้) — HKCU เท่านั้น
param(
  [switch]$Quiet,
  [ValidateSet('auto', 'edge', 'chrome')][string]$Browser = 'auto'
)
$ErrorActionPreference = 'Stop'

$AppName  = 'Billboard Rental Hub'
$AppId    = 'BillboardRentalHub'
$Version  = '1.1.0'
$Url      = 'https://billboard-rental.vercel.app/'
$Here     = Split-Path -Parent $MyInvocation.MyCommand.Path
$Dir      = Join-Path $env:LOCALAPPDATA "Programs\$AppId"

function Find-Browser([string]$want) {
  $edge = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
            "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
            "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe") | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
  $chrome = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
              "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
              "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe") | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
  switch ($want) {
    'edge'   { if ($edge) { return $edge } }
    'chrome' { if ($chrome) { return $chrome } }
  }
  if ($edge) { return $edge }
  return $chrome
}

# 1) ไฟล์โปรแกรม
New-Item -ItemType Directory -Force $Dir | Out-Null
foreach ($f in 'app.ico', 'Uninstall-BillboardRentalHub.ps1', 'Uninstall.cmd', 'README.txt') {
  $src = Join-Path $Here $f
  if (Test-Path $src) { Copy-Item $src (Join-Path $Dir $f) -Force }
}
$Icon = Join-Path $Dir 'app.ico'

# 2) ไอคอน Desktop + Start Menu
$exe = Find-Browser $Browser
$shell = New-Object -ComObject WScript.Shell
$targets = @(
  (Join-Path ([Environment]::GetFolderPath('Desktop')) "$AppName.lnk"),
  (Join-Path ([Environment]::GetFolderPath('Programs')) "$AppName.lnk")
)
foreach ($lnk in $targets) {
  $s = $shell.CreateShortcut($lnk)
  if ($exe) {
    $s.TargetPath = $exe
    $s.Arguments = "--app=${Url}?source=win-app"            # ให้หน้าเว็บรู้ว่าติดตั้งแล้ว → ซ่อนปุ่มติดตั้ง
    $s.WorkingDirectory = Split-Path -Parent $exe
  } else {
    $s.TargetPath = $Url                                   # ไม่มี Edge/Chrome → เปิดด้วยเบราว์เซอร์หลัก
  }
  $s.IconLocation = "$Icon,0"
  $s.Description = 'ระบบติดตามค่าเช่าป้ายโฆษณา การเบิกจ่าย และ Accrued — Plan B Media'
  $s.Save()
}

# 3) Settings → Apps → Uninstall
$key = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\$AppId"
New-Item -Path $key -Force | Out-Null
$uninst = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "' + (Join-Path $Dir 'Uninstall-BillboardRentalHub.ps1') + '"'
$size = [int]((Get-ChildItem $Dir -File | Measure-Object Length -Sum).Sum / 1KB)
$vals = @{
  DisplayName = $AppName; DisplayVersion = $Version; Publisher = 'Plan B Media'; DisplayIcon = $Icon
  InstallLocation = $Dir; UninstallString = $uninst; QuietUninstallString = "$uninst -Quiet"
  URLInfoAbout = $Url; HelpLink = "${Url}manual.html"; InstallDate = (Get-Date -Format 'yyyyMMdd')
}
foreach ($k in $vals.Keys) { New-ItemProperty -Path $key -Name $k -Value $vals[$k] -PropertyType String -Force | Out-Null }
foreach ($k in 'NoModify', 'NoRepair') { New-ItemProperty -Path $key -Name $k -Value 1 -PropertyType DWord -Force | Out-Null }
New-ItemProperty -Path $key -Name 'EstimatedSize' -Value $size -PropertyType DWord -Force | Out-Null

$via = if ($exe) { Split-Path -Leaf $exe } else { 'เบราว์เซอร์หลัก' }
$msg = "ติดตั้ง $AppName เรียบร้อย`n`n• ไอคอนบน Desktop และ Start Menu`n• เปิดเป็นหน้าต่างแอปผ่าน $via`n• ถอนการติดตั้ง: Settings → Apps → $AppName"
Write-Host $msg
if (-not $Quiet) {
  Add-Type -AssemblyName PresentationFramework
  $r = [System.Windows.MessageBox]::Show("$msg`n`nเปิดโปรแกรมเลยไหม?", $AppName, 'YesNo', 'Information')
  if ($r -eq 'Yes') { Start-Process -FilePath $targets[0] }
}
