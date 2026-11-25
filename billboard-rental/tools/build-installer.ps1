# สร้างตัวติดตั้ง Windows: frontend\download\Billboard-Rental-Hub-Setup.zip + .iso
#   powershell -ExecutionPolicy Bypass -File tools\build-installer.ps1
# ใช้ของที่มีใน Windows เท่านั้น (System.IO.Compression + IMAPI2 สร้าง ISO) — ไม่ต้องติดตั้งโปรแกรมเพิ่ม

$ErrorActionPreference = 'Stop'
$root  = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$src   = Join-Path $root 'installer\windows'
$out   = Join-Path $root 'frontend\download'
$stage = Join-Path ([IO.Path]::GetTempPath()) ('brh-setup-' + [Guid]::NewGuid().ToString('N').Substring(0, 8))
$name  = 'Billboard-Rental-Hub-Setup'

New-Item -ItemType Directory -Force $stage, $out | Out-Null
$bom = New-Object Text.UTF8Encoding($true)
$ascii = New-Object Text.ASCIIEncoding

# ไฟล์ตัวติดตั้ง — .ps1 / .txt เป็น UTF-8 มี BOM (Windows PowerShell 5.1 + Notepad อ่านภาษาไทยถูก) · .cmd เป็น ASCII + CRLF
Get-ChildItem $src -File | ForEach-Object {
  $text = [IO.File]::ReadAllText($_.FullName, [Text.Encoding]::UTF8).Replace("`r`n", "`n").Replace("`n", "`r`n")
  $enc = if ($_.Extension -eq '.cmd') { $ascii } else { $bom }
  [IO.File]::WriteAllText((Join-Path $stage $_.Name), $text, $enc)
}
Copy-Item (Join-Path $root 'frontend\icons\app.ico') (Join-Path $stage 'app.ico') -Force
[IO.File]::WriteAllText((Join-Path $stage 'autorun.inf'), "[autorun]`r`nicon=app.ico`r`nlabel=Billboard Rental Hub`r`n", $ascii)

# ZIP
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
$zip = Join-Path $out "$name.zip"
if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }
$z = [IO.Compression.ZipFile]::Open($zip, 'Create')
Get-ChildItem $stage -File | Where-Object { $_.Name -ne 'autorun.inf' } | ForEach-Object {
  [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($z, $_.FullName, "$name/" + $_.Name, 'Optimal')
}
$z.Dispose()

# ISO (ISO9660 + Joliet) ผ่าน IMAPI2
if (-not ('IsoWriter' -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
public static class IsoWriter {
  public static void Save(object stream, string path, int blockSize, int totalBlocks) {
    IStream s = (IStream)stream;
    byte[] buf = new byte[blockSize];
    IntPtr read = Marshal.AllocHGlobal(4);
    try {
      using (FileStream fs = File.Create(path)) {
        while (totalBlocks-- > 0) {
          s.Read(buf, blockSize, read);
          fs.Write(buf, 0, Marshal.ReadInt32(read));
        }
      }
    } finally { Marshal.FreeHGlobal(read); }
  }
}
'@
}
$iso = Join-Path $out "$name.iso"
$fsi = New-Object -ComObject IMAPI2FS.MsftFileSystemImage
$fsi.FileSystemsToCreate = 3                      # ISO9660 + Joliet (ชื่อไฟล์ยาวได้)
$fsi.VolumeName = 'BILLBOARD_HUB'
$fsi.ChooseImageDefaultsForMediaType(13)          # DISK (ขนาดเล็ก)
$fsi.Root.AddTree($stage, $false)
$img = $fsi.CreateResultImage()
[IsoWriter]::Save($img.ImageStream, $iso, $img.BlockSize, $img.TotalBlocks)
[Runtime.InteropServices.Marshal]::ReleaseComObject($fsi) | Out-Null

Remove-Item $stage -Recurse -Force
Get-ChildItem $out | Select-Object Name, @{ n = 'KB'; e = { [math]::Round($_.Length / 1KB, 1) } } | Format-Table -AutoSize
