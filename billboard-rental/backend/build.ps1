# สร้างโฟลเดอร์ backend\dist\ = ไฟล์ทั้งหมดที่ต้องวางใน Apps Script (ล้างของเก่าทิ้งทุกครั้ง)
#   Code.gs          รวม backend/*.gs ทั้งระบบเป็นไฟล์เดียว
#   appsscript.json  manifest (สิทธิ์ + ตั้งค่า Web App)
#   วิธีวางใน AppsScript.txt
#
#   powershell -ExecutionPolicy Bypass -File backend\build.ps1

$ErrorActionPreference = 'Stop'
$here  = Split-Path -Parent $MyInvocation.MyCommand.Path
$dist  = Join-Path $here 'dist'
$order = 'Config.gs', 'Main.gs', 'Auth.gs', 'Data.gs', 'Api.gs', 'Payments.gs', 'Edit.gs', 'Alert.gs', 'AI.gs', 'Members.gs', 'Setup.gs'
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

# 2) appsscript.json
Copy-Item (Join-Path $here 'appsscript.json') (Join-Path $dist 'appsscript.json') -Force

# 3) วิธีวาง
$version = ([regex]::Match($code, "VERSION:\s*'([^']+)'")).Groups[1].Value
$cfg    = [IO.File]::ReadAllText((Join-Path (Split-Path -Parent $here) 'frontend\js\config.js'), $utf8)
$apiUrl = ([regex]::Match($cfg, "API_URL:\s*'([^']+)'")).Groups[1].Value
$howto = @"
ไฟล์สำหรับวางใน Google Apps Script — Billboard Rental Hub v$version
สร้างเมื่อ $(Get-Date -Format 'dd/MM/yyyy HH:mm')

โปรเจกต์ Apps Script: Billboard Rental
  https://script.google.com/home/projects/1-6nGq5g24XJjqjqgTfWYgiQyLfzQyvVxeLUZuaBXVlqh1vG6XymqgZVS/edit

ใน Apps Script ต้องเหลือไฟล์แค่นี้:
  Code.gs          <- วางเนื้อหาจาก Code.gs ในโฟลเดอร์นี้ (แทนโค้ด Billboard ERP เดิมทั้งหมด)
  appsscript.json  <- วางเนื้อหาจาก appsscript.json (Project Settings > ติ๊ก Show appsscript.json)
  ลบ Index.html เดิมได้ (หน้าเว็บย้ายไปอยู่บน Vercel แล้ว) — หรือเก็บไว้ก็ไม่มีผล

ขั้นตอน
  1. Code.gs: Ctrl+A > วาง > Ctrl+S
  2. appsscript.json: Ctrl+A > วาง > Ctrl+S
  3. เรียกใช้ setupSystem > อนุญาตสิทธิ์  (สร้าง admin + ชีต Users / Log)
  4. Project Settings > Script properties > ANTHROPIC_API_KEY (ถ้าจะใช้ผู้ช่วย AI)
  5. อีเมลแจ้งเตือน: เรียกใช้ installAlertTrigger (ลบ trigger sendPaymentAlertEmails ของโค้ดเดิมให้เอง)
  6. การทำให้ใช้งานได้ > การทำให้ใช้งานได้รายการใหม่ > เว็บแอป
       ดำเนินการในฐานะ: ฉัน · ผู้ที่มีสิทธิ์เข้าถึง: ทุกคน
     (ครั้งถัดไป: จัดการการทำให้ใช้งานได้ > ดินสอ > เวอร์ชัน: เวอร์ชันใหม่ — URL เดิมใช้ต่อได้)
  7. คัดลอก Web app URL (ลงท้าย /exec) ไปใส่ frontend/js/config.js > API_URL แล้ว push ขึ้น GitHub

ตรวจว่าสำเร็จ: เปิด
  $apiUrl`?action=ping
  ต้องเห็น "version":"$version"
"@
[IO.File]::WriteAllText((Join-Path $dist 'วิธีวางใน AppsScript.txt'), $howto, (New-Object System.Text.UTF8Encoding($true)))

Write-Host "Built v${version}: $dist"
Get-ChildItem $dist -File | ForEach-Object { Write-Host ("  " + $_.Name + "  (" + $_.Length + " bytes)") }
