# เตรียมไฟล์สำหรับอัปโหลดขึ้น GitHub ผ่านหน้าเว็บ (Add file → Upload files)
# หน้าเว็บ GitHub ไม่อ่าน .gitignore — สคริปต์นี้คัดเฉพาะไฟล์ที่ควรอยู่ใน repo ไปไว้ที่ _upload\
#   powershell -ExecutionPolicy Bypass -File tools\prepare-upload.ps1
# จากนั้นเปิด _upload\ → Ctrl+A → ลากทั้งหมดไปวางในหน้า Upload files ของ repo

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$out  = Join-Path $root '_upload'

# สร้าง backend\dist\Code.gs ใหม่ด้วย (ไว้ copy-paste ลง Apps Script — ไม่ขึ้น GitHub)
& powershell -ExecutionPolicy Bypass -File (Join-Path $root 'backend\build.ps1') | Out-Null

# ล้างเฉพาะไฟล์ (โฟลเดอร์ที่เปิดค้างใน Explorer ลบไม่ได้ แต่ไฟล์ข้างในลบได้)
New-Item -ItemType Directory -Force $out | Out-Null
Get-ChildItem $out -Recurse -File -Force | Remove-Item -Force

$items = 'frontend', 'backend', 'tools', 'index.html', '.nojekyll', 'vercel.json', '.gitignore',
         'README.md', 'FILE_STRUCTURE.md', 'SETUP_GUIDE.md'
$skip = '\\backend\\dist\\|\.xlsx$|\.csv$|\.clasp\.json$|\.clasprc\.json$|\.env$'   # ไฟล์ build / ข้อมูลจริง / คีย์
foreach ($i in $items) {
  $src = Join-Path $root $i
  if (-not (Test-Path $src)) { continue }
  $files = if ((Get-Item $src -Force).PSIsContainer) { Get-ChildItem $src -Recurse -File -Force } else { Get-Item $src -Force }
  foreach ($f in $files) {
    $rel = $f.FullName.Substring($root.Length + 1)
    if ($f.FullName -match $skip) { continue }
    $dest = Join-Path $out $rel
    New-Item -ItemType Directory -Force (Split-Path -Parent $dest) | Out-Null
    Copy-Item $f.FullName -Destination $dest -Force
  }
}

$n = (Get-ChildItem $out -Recurse -File -Force).Count
Write-Host "Ready: $out ($n files)"
