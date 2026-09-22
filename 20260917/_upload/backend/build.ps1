# สร้างโฟลเดอร์ backend\dist\ = ไฟล์ทั้งหมดที่ต้องวางใน Apps Script (ล้างของเก่าทิ้งทุกครั้ง)
#   Code.gs          รวม backend/*.gs ทั้งระบบเป็นไฟล์เดียว
#   appsscript.json  manifest (สิทธิ์ + ตั้งค่า Web App)
#   EmailReminder.gs ไฟล์เดี่ยวอีเมลแจ้งเตือนล่วงหน้า (ทางเลือก)
#   วิธีวางใน AppsScript.txt
#
#   powershell -ExecutionPolicy Bypass -File backend\build.ps1

$ErrorActionPreference = 'Stop'
$here  = Split-Path -Parent $MyInvocation.MyCommand.Path
$dist  = Join-Path $here 'dist'
$order = 'Config.gs', 'Main.gs', 'Auth.gs', 'Data.gs', 'Api.gs', 'AI.gs', 'Notice.gs', 'Edit.gs', 'Members.gs', 'Setup.gs'
$utf8  = New-Object System.Text.UTF8Encoding($false)

# ล้างไฟล์เวอร์ชันเก่าใน dist (ลบเฉพาะไฟล์ — โฟลเดอร์ที่เปิดค้างใน Explorer ลบไม่ได้)
New-Item -ItemType Directory -Force $dist | Out-Null
Get-ChildItem $dist -File -Force | Remove-Item -Force

# 1) Code.gs
$parts = foreach ($f in $order) {
  "// ==================== $f ====================`n" + [IO.File]::ReadAllText((Join-Path $here $f), $utf8)
}
$code = $parts -join "`n"
[IO.File]::WriteAllText((Join-Path $dist 'Code.gs'), $code, $utf8)

# 2) appsscript.json  3) EmailReminder.gs
Copy-Item (Join-Path $here 'appsscript.json') (Join-Path $dist 'appsscript.json') -Force
Copy-Item (Join-Path $here 'standalone\EmailReminder.gs') (Join-Path $dist 'EmailReminder.gs') -Force

# 4) วิธีวาง
$version = ([regex]::Match($code, "VERSION:\s*'([^']+)'")).Groups[1].Value
# URL ที่หน้าเว็บใช้อยู่ (อ่านจาก frontend/js/config.js)
$cfg    = [IO.File]::ReadAllText((Join-Path (Split-Path -Parent $here) 'frontend\js\config.js'), $utf8)
$apiUrl = ([regex]::Match($cfg, "API_URL:\s*'([^']+)'")).Groups[1].Value
$depId  = ([regex]::Match($apiUrl, '/macros/s/([^/]{10})')).Groups[1].Value
$howto = @"
ไฟล์สำหรับวางใน Google Apps Script — Contract Rental Hub v$version
สร้างเมื่อ $(Get-Date -Format 'dd/MM/yyyy HH:mm')

ใน Apps Script ต้องเหลือไฟล์แค่นี้ (ลบไฟล์ .gs อื่นทิ้งให้หมด ไม่งั้นจะ error ชื่อซ้ำ):
  Code.gs          <- วางเนื้อหาจาก Code.gs ในโฟลเดอร์นี้
  appsscript.json  <- วางเนื้อหาจาก appsscript.json (Project Settings > ติ๊ก Show appsscript.json)
  EmailReminder.gs <- (ทางเลือก) ถ้าอยากใช้อีเมลแจ้งเตือนแบบไฟล์เดี่ยว

ขั้นตอน
  1. เปิดโปรเจกต์ที่ Deployment ID ขึ้นต้นด้วย $depId
     (การทำให้ใช้งานได้ > จัดการการทำให้ใช้งานได้ เพื่อดู ID)
  2. ลบไฟล์ .gs เก่าที่ไม่ใช่ 3 ไฟล์ข้างบน (คลิก ... ข้างชื่อไฟล์ > ลบ)
  3. Code.gs: Ctrl+A > วาง > Ctrl+S
  4. appsscript.json: Ctrl+A > วาง > Ctrl+S
  5. เรียกใช้ setupSystem > อนุญาตสิทธิ์
  6. อีเมลแจ้งเตือน: เรียกใช้ installNoticeTrigger (หรือ reminderInstall ถ้าใช้ EmailReminder.gs)
  7. การทำให้ใช้งานได้ > จัดการการทำให้ใช้งานได้ > ดินสอ > เวอร์ชัน: เวอร์ชันใหม่ > ทำให้ใช้งานได้
     ห้ามกด "เก็บถาวร" deployment $depId — URL ของหน้าเว็บจะใช้ไม่ได้

ตรวจว่าสำเร็จ: เปิด
  $apiUrl`?action=ping
  ต้องเห็น "version":"$version"
"@
[IO.File]::WriteAllText((Join-Path $dist 'วิธีวางใน AppsScript.txt'), $howto, (New-Object System.Text.UTF8Encoding($true)))

Write-Host "Built v${version}: $dist"
Get-ChildItem $dist -File | ForEach-Object { Write-Host ("  " + $_.Name + "  (" + $_.Length + " bytes)") }
