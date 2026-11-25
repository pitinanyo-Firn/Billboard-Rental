# สร้างไอคอนแอป (PWA / iOS / Windows) จากโลโก้ "PB" สีแบรนด์ Plan B
#   powershell -ExecutionPolicy Bypass -File tools\make-icons.ps1
# ผลลัพธ์: frontend\icons\  (icon-192.png, icon-512.png, maskable-512.png, apple-touch-icon.png, favicon-32.png, app.ico)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$out  = Join-Path $root 'frontend\icons'
New-Item -ItemType Directory -Force $out | Out-Null

$brand = [System.Drawing.Color]::FromArgb(228, 0, 43)      # #E4002B
$white = [System.Drawing.Color]::White

function New-Icon([int]$size, [bool]$rounded, [double]$textScale) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'; $g.TextRenderingHint = 'AntiAliasGridFit'; $g.InterpolationMode = 'HighQualityBicubic'
  $g.Clear([System.Drawing.Color]::Transparent)
  $brush = New-Object System.Drawing.SolidBrush $brand
  if ($rounded) {
    $r = [int]($size * 0.22); $d = $r * 2
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc(0, 0, $d, $d, 180, 90); $path.AddArc($size - $d, 0, $d, $d, 270, 90)
    $path.AddArc($size - $d, $size - $d, $d, $d, 0, 90); $path.AddArc(0, $size - $d, $d, $d, 90, 90)
    $path.CloseFigure(); $g.FillPath($brush, $path)
  } else {
    $g.FillRectangle($brush, 0, 0, $size, $size)              # maskable / iOS: เต็มกรอบ ระบบตัดมุมเอง
  }
  $font = New-Object System.Drawing.Font 'Segoe UI', ([single]($size * $textScale)), ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
  $fmt = New-Object System.Drawing.StringFormat
  $fmt.Alignment = 'Center'; $fmt.LineAlignment = 'Center'
  $rect = New-Object System.Drawing.RectangleF 0, ([single]($size * 0.02)), $size, $size
  $g.DrawString('PB', $font, (New-Object System.Drawing.SolidBrush $white), $rect, $fmt)
  $g.Dispose()
  return $bmp
}

function Save-Png($bmp, $name) {
  $p = Join-Path $out $name
  $bmp.Save($p, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  return $p
}

Save-Png (New-Icon 192 $true 0.42)  'icon-192.png'      | Out-Null
Save-Png (New-Icon 512 $true 0.42)  'icon-512.png'      | Out-Null
Save-Png (New-Icon 512 $false 0.30) 'maskable-512.png'  | Out-Null   # ตัวอักษรอยู่ใน safe zone 80%
Save-Png (New-Icon 180 $false 0.40) 'apple-touch-icon.png' | Out-Null
Save-Png (New-Icon 32 $true 0.50)   'favicon-32.png'    | Out-Null

# app.ico (Windows shortcut) — ICO ที่ฝัง PNG หลายขนาด
$sizes = 16, 24, 32, 48, 64, 128, 256
$pngs = foreach ($s in $sizes) {
  $ms = New-Object System.IO.MemoryStream
  $b = New-Icon $s $true $(if ($s -le 24) { 0.55 } else { 0.45 })
  $b.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png); $b.Dispose()
  , $ms.ToArray()
}
$ico = New-Object System.IO.MemoryStream
$w = New-Object System.IO.BinaryWriter $ico
$w.Write([UInt16]0); $w.Write([UInt16]1); $w.Write([UInt16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
for ($i = 0; $i -lt $sizes.Count; $i++) {
  $s = $sizes[$i]; $len = $pngs[$i].Length
  $w.Write([byte]($(if ($s -ge 256) { 0 } else { $s }))); $w.Write([byte]($(if ($s -ge 256) { 0 } else { $s })))
  $w.Write([byte]0); $w.Write([byte]0); $w.Write([UInt16]1); $w.Write([UInt16]32)
  $w.Write([UInt32]$len); $w.Write([UInt32]$offset)
  $offset += $len
}
foreach ($p in $pngs) { $w.Write($p) }
$w.Flush()
[IO.File]::WriteAllBytes((Join-Path $out 'app.ico'), $ico.ToArray())
$w.Dispose()

Get-ChildItem $out | Select-Object Name, Length | Format-Table -AutoSize
