# FILE_STRUCTURE.md

โครงสร้างไฟล์ Plan B — Billboard Rental Hub — แยก **Front-End** / **Back-End** (เหมือน Contract Rental Hub)

```
Billboard-Rental/
│
├── frontend/                       # ★ FRONT-END — เสิร์ฟบน Vercel / GitHub Pages (ไม่มีข้อมูล/คีย์)
│   ├── index.html                  # SPA: login + 7 แท็บ
│   ├── _headers                    # Netlify security headers (ถ้าใช้ Netlify)
│   ├── css/
│   │   ├── style.css               # design tokens, base, login, shell, form
│   │   ├── dashboard.css           # KPI, charts, filters, table, drawer, print
│   │   ├── ai.css                  # แชท AI + ตารางสรุป + ฟอร์มแก้ไข + sync pill
│   │   └── rental.css              # ระดับการจ่าย, ตรวจสอบข้อมูล, ฟอร์มบันทึกจ่าย
│   └── js/
│       ├── config.js               # ★ API_URL — ไฟล์เดียวที่ต้องแก้หลัง deploy
│       ├── api.js                  # API client + helper (format, escape, Store, loader, toast)
│       ├── auth.js                 # login / logout / restore session
│       ├── dashboard.js            # KPI + ตารางสรุป + Chart.js 5 ชุด
│       ├── rentals.js              # ทะเบียนค่าเช่า + ตัวกรอง + detail drawer
│       ├── editor.js               # ฟอร์มแก้ไขข้อมูล (ใน drawer) → updateRental
│       ├── due.js                  # แท็บครบกำหนดจ่าย + สถานะ/ส่งอีเมลเตือน
│       ├── payments.js             # บันทึกจ่าย + ติดตามใบเสร็จ + ประวัติการจ่าย
│       ├── quality.js              # แท็บตรวจสอบข้อมูล + แก้อัตโนมัติ
│       ├── members.js              # เพิ่มสมาชิก (admin)
│       ├── sync.js                 # ซิงค์ชีต → หน้าเว็บ: ตรวจ getVersion ทุก 30 วินาที
│       ├── ai.js                   # แท็บผู้ช่วย AI
│       └── app.js                  # bootstrap, สลับแท็บ, โหลดข้อมูล, export CSV
│
├── backend/                        # ★ BACK-END — Google Apps Script (ทุกไฟล์ใช้ global scope ร่วมกัน)
│   ├── Config.gs                   # CFG, SPREADSHEET_ID, COLUMNS (แผนผังหัวคอลัมน์), สถานะ, VALUE_FIX
│   ├── Main.gs                     # doGet / doPost / route_()
│   ├── Auth.gs                     # ss_(), login, session, สิทธิ์ admin, log
│   ├── Data.gs                     # หาแท็บ + header, readRentals_() + derive fields + ตรวจคุณภาพข้อมูล + cache
│   ├── Api.gs                      # dashboard, forecast, รายละเอียด, CSV
│   ├── Payments.gs                 # Payment_History + Receipt_Tracking
│   ├── Edit.gs                     # updateRental + แก้ข้อมูลอัตโนมัติ (applyDataFixes)
│   ├── Alert.gs                    # อีเมลเตือนดิวจ่าย + trigger
│   ├── AI.gs                       # askAI → Claude API, testAI()
│   ├── Members.gs                  # addMember, addUser
│   ├── Setup.gs                    # setupSystem(), dropdown, เมนูในชีต
│   ├── appsscript.json             # manifest (scopes, webapp)
│   ├── build.ps1                   # รวม *.gs → dist/Code.gs สำหรับ copy-paste
│   └── dist/                       # (gitignored) ★ ไฟล์ที่ต้องวางใน Apps Script
│
├── tools/prepare-upload.ps1        # คัดไฟล์ไป _upload\ สำหรับอัปโหลดผ่านหน้าเว็บ GitHub
├── index.html                      # GitHub Pages แบบ branch/root → พาไป frontend/
├── vercel.json                     # Vercel: "/" → /frontend/ + security headers + no-cache
├── .gitignore · .nojekyll
├── README.md · FILE_STRUCTURE.md · SETUP_GUIDE.md
```

ลำดับ script ใน `index.html` (**ห้ามสลับ**):

```
chart.js → config.js → api.js → auth.js → dashboard.js → rentals.js → editor.js → due.js → payments.js → quality.js → members.js → sync.js → ai.js → app.js
```

## Back-End: เพิ่ม action ใหม่

1. เขียน `apiXxx_(token, p)` ในไฟล์ที่เหมาะสม (เรียก `auth_(token)` หรือ `authAdmin_(token)` บรรทัดแรก)
2. เพิ่ม `case 'xxx':` ใน `route_()` (`Main.gs`)
3. frontend เรียก `apiGuarded('xxx', {...})`

## ฐานข้อมูล Google Sheets

| แท็บ | ใช้ทำอะไร |
|---|---|
| `Contract_Master` | ทะเบียนค่าเช่า 1 แถวต่อ ผู้รับเงิน × รูปแบบการจ่าย (อ่านตามหัวคอลัมน์ใน `COLUMNS`) |
| `Payment_History` | `Timestamp · Vendor Name · Media Site · รอบดิว · ยอดที่ต้องจ่าย · ยอดที่จ่ายจริง · หมายเหตุ` |
| `Receipt_Tracking` | `Timestamp · Vendor Name · Media Site · ยอดเงิน · สถานะใบเสร็จ` |
| `New_Location` | (สร้างให้ไว้ — ยังไม่ใช้บนเว็บ) |
| `Users` / `Log` | สร้างอัตโนมัติ — ผู้ใช้ / ประวัติการใช้งานและการแก้ไข |

วันที่เขียนกลับเป็นข้อความ `d/m/yyyy` ตามสไตล์เดิม: `Start/End Contract` = พ.ศ. · คอลัมน์อื่น = ค.ศ.
