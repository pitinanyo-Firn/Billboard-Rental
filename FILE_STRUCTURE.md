# FILE_STRUCTURE.md

โครงสร้างไฟล์ Plan B — Contract Rental Hub (v2) — แยก **Front-End** / **Back-End** ชัดเจน

---

## แผนผัง

```
planb-contract-hub/
│
├── frontend/                       # ★ FRONT-END — เสิร์ฟบน GitHub Pages / Netlify (ไม่มีข้อมูล/คีย์)
│   ├── index.html                  # SPA: login + 5 แท็บ
│   ├── _headers                    # Netlify security headers
│   ├── css/
│   │   ├── style.css               # design tokens, base, login, shell, member form
│   │   ├── dashboard.css           # KPI, charts, filters, table, drawer, print
│   │   └── ai.css                  # แชท AI + ตารางสรุปบน Dashboard
│   └── js/
│       ├── config.js               # ★ API_URL — ไฟล์เดียวที่ต้องแก้หลัง deploy
│       ├── api.js                  # API client + helper (format, escape, Store, loader, toast)
│       ├── auth.js                 # login / logout / restore session
│       ├── dashboard.js            # KPI + ตารางสเปก (12 เดือน / หนังสือแจ้งเตือน) + Chart.js 5 ชุด
│       ├── contracts.js            # ทะเบียนสัญญา + รายการต้องดำเนินการ + detail drawer
│       ├── members.js              # เพิ่มสมาชิก (admin)
│       ├── editor.js               # ฟอร์มแก้ไขข้อมูลสัญญา (ใน drawer) → updateContract
│       ├── notice.js               # แท็บหนังสือแจ้งเตือน + แก้สถานะ (เขียนลงชีต) + สถานะ/ทดสอบอีเมล
│       ├── sync.js                 # ซิงค์ชีต → หน้าเว็บ: ตรวจ getVersion ทุก 30 วินาที
│       ├── ai.js                   # แท็บผู้ช่วย AI
│       └── app.js                  # bootstrap, สลับแท็บ, โหลดข้อมูล, export CSV
│
├── backend/                        # ★ BACK-END — Google Apps Script (ทุกไฟล์ใช้ global scope ร่วมกัน)
│   ├── Config.gs                   # CFG, SPREADSHEET_ID, MEDIA_TYPES, COLUMNS (แผนผังหัวคอลัมน์)
│   ├── Main.gs                     # doGet / doPost / route_()
│   ├── Auth.gs                     # ss_(), login, session, log
│   ├── Data.gs                     # หาแท็บ + header, readContracts_() + derive fields + cache
│   ├── Api.gs                      # dashboard, noticeSchedule_, contract, action list, CSV
│   ├── AI.gs                       # askAI → Claude API, testAI()
│   ├── Notice.gs                   # อีเมลเตือนหนังสือต่อสัญญา + แก้สถานะ + dropdown ในชีต
│   ├── Edit.gs                     # updateContract: แก้ไขข้อมูลสัญญาทุกช่องจากหน้าเว็บ → ชีต
│   ├── Members.gs                  # addMember, addUser
│   ├── Setup.gs                    # setupSystem(), เมนูในชีต
│   ├── standalone/
│   │   └── EmailReminder.gs        # อีเมลแจ้งเตือนล่วงหน้า 30/3 วัน — ไฟล์เดี่ยว ใช้ได้โดยไม่ต้องมีไฟล์อื่น
│   ├── appsscript.json             # manifest (scopes, webapp)
│   ├── build.ps1                   # รวม *.gs → dist/Code.gs สำหรับ copy-paste
│   └── dist/                       # (gitignored) ★ ไฟล์ที่ต้องวางใน Apps Script — Code.gs, appsscript.json, EmailReminder.gs + วิธีวาง
│
├── .github/workflows/
│   └── deploy-pages.yml            # push → deploy frontend/ ขึ้น GitHub Pages
├── tools/
│   └── prepare-upload.ps1          # คัดไฟล์ไป _upload\ สำหรับอัปโหลดผ่านหน้าเว็บ GitHub
├── index.html                      # GitHub Pages แบบ branch/root → พาไป frontend/
├── .nojekyll                       # ให้ GitHub Pages เสิร์ฟไฟล์ตรง ๆ (ไม่ผ่าน Jekyll)
├── vercel.json                     # Vercel: "/" → /frontend/ + security headers + no-cache
├── netlify.toml                    # publish = frontend (ใช้เมื่อเชื่อม Netlify กับ GitHub)
├── _upload/                        # (gitignored) ผลลัพธ์จาก prepare-upload.ps1
├── .gitignore
├── README.md
├── FILE_STRUCTURE.md               # ไฟล์นี้
└── SETUP_GUIDE_FULL.md
```

ลำดับ script ใน `index.html` (**ห้ามสลับ**):

```
chart.js → config.js → api.js → auth.js → dashboard.js → contracts.js → members.js → editor.js → notice.js → sync.js → ai.js → app.js
```

---

## Back-End: เพิ่ม action ใหม่

1. เขียน `apiXxx_(token, p)` ในไฟล์ที่เหมาะสม (เรียก `auth_(token)` บรรทัดแรก)
2. เพิ่ม `case 'xxx':` ใน `route_()` (`Main.gs`)
3. frontend เรียก `apiGuarded('xxx', {...})`

---

## ฐานข้อมูล Google Sheets

### แท็บข้อมูลสัญญา

ค้นหาอัตโนมัติจากหัวคอลัมน์ `Contract No.` (สแกน 5 แถวแรก) · อ่านตาม **ชื่อหัวคอลัมน์** ผ่าน `COLUMNS` ใน `Config.gs`

| field | หัวคอลัมน์ | field | หัวคอลัมน์ |
|---|---|---|---|
| no | No | opex / capex | Opex / Capex |
| company | Company | electricity | ค่าไฟฟ้า |
| mediaType | Media Type | tax1–3 | ค่าภาษีประเภท 1–3 |
| code | Code | maintenance | ค่าซ่อมบำรุง |
| siteCode | (คอลัมน์ถัดจาก Code) | insurance | ค่าประกันภัย |
| mediaSite | Media Site | paymentTerm | เงื่อนไขการชำระค่าเช่า |
| province | Province | paymentDue | กำหนดชำระ |
| contractNo | Contract No. | revShareCompany | %Rev Share (บริษัท) |
| businessModel | Type of Business Model | revShareOwner | %Rev Share (เจ้าของสื่อ) |
| counterparty | คู่สัญญา | renewCondition | เงื่อนไขการต่อสัญญา |
| status | Contract Status | noticeDate | วันที่ต้องทำหนังสือแจ้งเตือน |
| costType | Cost Type | endCondition | เงื่อนไขสิ้นสุดสัญญา |
| startDate / endDate | เริ่มต้นสัญญา / สิ้นสุดสัญญา | removalPeriod | ระยะเวลารื้อถอน |
| duration | ระยะสัญญา | accessCondition | เงื่อนไขการเข้าพื้นที่ |
| collateralType | ประเภทหลักประกันสัญญา | renewStatus | สถานะการต่อสัญญา |
| collateralValue | มูลค่าหลักประกัน | docStatus | สถานะเอกสาร |
| ownerAsset | Owner Asset | | |

วันที่รองรับ Date object และข้อความ `d/m/yyyy` (ปี > 2400 ถือเป็น พ.ศ. ลบ 543 ให้)

### ชีต `Users` / `Log` (สร้างอัตโนมัติ)

`Email | Salt | PasswordHash | Name | Role | Active | Position | Phone | Department | PhotoUrl`
`Timestamp | Email | Action | Detail` — Action: `LOGIN`, `ADD_MEMBER`, `ASK_AI`

---

## Data Flow

```
เปิดเว็บ / กดรีเฟรช
  └─► api('getDashboard') → readContracts_() อ่านชีต + derive fields (cache 5 นาที)
        └─► Dashboard.render()  → KPI + ตาราง 12 เดือน + ตารางหนังสือแจ้งเตือน + กราฟ
        └─► Contracts.render()  → ฟิลเตอร์ + ตาราง + รายการต้องดำเนินการ

ถาม AI
  └─► api('askAI', {question, history})
        └─► apiAskAI_() → contractsForAI_() (ข้อมูลกระชับ + prompt cache) → Claude API → คำตอบ
```
