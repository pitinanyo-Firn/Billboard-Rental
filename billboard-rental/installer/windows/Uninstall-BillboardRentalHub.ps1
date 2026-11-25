# Billboard Rental Hub — ถอนการติดตั้ง (ลบไอคอน + รายการใน Settings → Apps + โฟลเดอร์โปรแกรม)
param([switch]$Quiet)
$AppName = 'Billboard Rental Hub'
$AppId   = 'BillboardRentalHub'
$Dir     = Join-Path $env:LOCALAPPDATA "Programs\$AppId"

if (-not $Quiet) {
  Add-Type -AssemblyName PresentationFramework
  if ([System.Windows.MessageBox]::Show("ถอนการติดตั้ง $AppName ?`n(ข้อมูลในระบบและ Google Sheet ไม่ถูกลบ)", $AppName, 'YesNo', 'Question') -ne 'Yes') { return }
}
foreach ($lnk in (Join-Path ([Environment]::GetFolderPath('Desktop')) "$AppName.lnk"),
                 (Join-Path ([Environment]::GetFolderPath('Programs')) "$AppName.lnk")) {
  if (Test-Path $lnk) { Remove-Item $lnk -Force }
}
Remove-Item "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\$AppId" -Recurse -Force -ErrorAction SilentlyContinue
# ลบโฟลเดอร์โปรแกรมหลังสคริปต์นี้ปิด (สคริปต์อยู่ในโฟลเดอร์นั้นเอง)
Start-Process -FilePath cmd.exe -ArgumentList "/c timeout /t 2 /nobreak >nul & rmdir /s /q `"$Dir`"" -WindowStyle Hidden
Write-Host "ถอนการติดตั้ง $AppName แล้ว"
if (-not $Quiet) { [System.Windows.MessageBox]::Show("ถอนการติดตั้ง $AppName แล้ว", $AppName) | Out-Null }
