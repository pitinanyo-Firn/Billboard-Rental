# SETUP_GUIDE_FULL.md

คู่มือติดตั้ง Plan B — Contract Rental Hub (v2 · Back-End / Front-End แยกโฟลเดอร์ + ผู้ช่วย AI)
เวลาที่ใช้ทั้งหมดประมาณ **20–30 นาที**

---

## สารบัญ

1. [สิ่งที่ต้องเตรียม](#1-สิ่งที่ต้องเตรียม)
2. [ฐานข้อมูล Google Sheet](#2-ฐานข้อมูล-google-sheet)
3. [ติดตั้ง Backend (Apps Script)](#3-ติดตั้ง-backend-apps-script)
4. [ตั้งค่าผู้ช่วย AI](#4-ตั้งค่าผู้ช่วย-ai)
5. [Deploy Web App](#5-deploy-web-app)
6. [Frontend: GitHub Pages หรือ Netlify](#6-frontend-github-pages-หรือ-netlify)
7. [ทดสอบระบบ](#7-ทดสอบระบบ)
8. [การจัดการผู้ใช้](#8-การจัดการผู้ใช้)
9. [อัปเดตโค้ดครั้งถัดไป](#9-อัปเดตโค้ดครั้งถัดไป)
10. [Troubleshooting](#10-troubleshooting)
11. [Security Checklist](#11-security-checklist)

---

## 1. สิ่งที่ต้องเตรียม

- [ ] บัญชี Google ที่มีสิทธิ์แก้ไขชีตฐานข้อมูล
- [ ] บัญชี Netlify (ฟรี) — สำหรับหน้าเว็บ
- [ ] (ทางเลือก) บัญชี GitHub — เก็บโค้ด / deploy อัตโนมัติ
- [ ] Claude API key จาก [console.anthropic.com](https://console.anthropic.com) (สำหรับผู้ช่วย AI)
- [ ] (ทางเลือก) Git / Node.js 18+ สำหรับ `clasp` — ไม่มีก็ใช้วิธี copy-paste และอัปโหลดผ่านเว็บ GitHub ได้

---

## 2. ฐานข้อมูล Google Sheet

ฐานข้อมูลปัจจุบัน:
`https://docs.google.com/spreadsheets/d/11VOe1_OWevonHJc73rKVeDIYJKzzieWxuaXrjvwPDUU`

ID นี้ตั้งไว้แล้วใน `backend/Config.gs` → `CFG.SPREADSHEET_ID`
ถ้าจะเปลี่ยนฐานข้อมูลในอนาคต ไม่ต้องแก้โค้ด — ตั้ง Script Property `SPREADSHEET_ID` เป็น ID ใหม่ได้เลย (ดูข้อ 4.1)

### 2.1 ระบบอ่านชีตอย่างไร

- **หาแท็บข้อมูลอัตโนมัติ** — แท็บที่มีหัวคอลัมน์ `Contract No.` (ถ้าอยากล็อกชื่อแท็บ ตั้ง Script Property `SHEET_DATA`)
- **อ่านตามชื่อหัวคอลัมน์** ไม่ใช่ตำแหน่ง — แทรก/สลับคอลัมน์ได้ ขอแค่ชื่อหัวคอลัมน์ตรงกับรายการใน `COLUMNS` (`backend/Config.gs`)
- คอลัมน์ E (Asset Code) หัวคอลัมน์ในไฟล์ต้นทางเป็นค่า data → ระบบใช้คอลัมน์ถัดจาก `Code` ให้อัตโนมัติ
- `เงื่อนไขการต่อสัญญา` ใส่ได้ทั้ง `90` หรือ `แจ้งล่วงหน้า 90 วัน`
- `วันที่ต้องทำหนังสือแจ้งเตือน` — ใช้ค่าจากชีตก่อน ถ้าว่างระบบคำนวณ = วันสิ้นสุดสัญญา − จำนวนวันแจ้งล่วงหน้า
- `กรุุงเทพมหานคร` (สระอุซ้ำ) ระบบแก้ให้ตอนอ่าน

### 2.2 ทำความสะอาดข้อมูล (แนะนำ)

| ตรวจ | วิธีแก้ |
|---|---|
| คอลัมน์วันที่ปนรูปแบบ | Format → Number → Date หรือ Plain text `d/m/yyyy` (ค.ศ.) |
| Unipole Billboard แถวท้าย ๆ ยังไม่มีหลักประกัน / ผู้รับผิดชอบค่าใช้จ่าย | กรอกให้ครบ — KPI มูลค่าหลักประกันรวมและคำตอบของ AI จะแม่นขึ้น |
| `สถานะการต่อสัญญา` / `สถานะเอกสาร` ส่วนใหญ่ว่าง | กรอกเพื่อให้ตาราง "วันที่ต้องทำหนังสือแจ้งเตือน" แสดงสถานะ |

---

## 3. ติดตั้ง Backend (Apps Script)

### 3.1 เปิด Editor

เปิดชีตฐานข้อมูล → เมนู **Extensions → Apps Script**
(หรือใช้ Apps Script project เดิมที่ deploy อยู่แล้ว — URL ของ Web App จะได้ไม่เปลี่ยน)

### 3.2 วางโค้ด

โค้ด backend แยกเป็นหลายไฟล์ในโฟลเดอร์ `backend/` เลือกวิธีใดวิธีหนึ่ง:

**วิธี A — ไฟล์เดียว (ง่ายสุด)**

```bash
powershell -ExecutionPolicy Bypass -File backend\build.ps1
```

จะได้ `backend/dist/Code.gs` → คัดลอกทั้งไฟล์ไปวางแทนเนื้อหาใน `Code.gs` ของ editor

**วิธี B — แยกไฟล์ตามโปรเจกต์**

สร้างไฟล์ใน editor (ปุ่ม **+ → Script**) ให้ครบ: `Config`, `Main`, `Auth`, `Data`, `Api`, `AI`, `Members`, `Setup` แล้ววางเนื้อหาจาก `backend/*.gs` ตามชื่อ — ลบ `Code.gs` เดิมทิ้ง (ห้ามมีโค้ดซ้ำสองที่)

### 3.3 ตั้งค่า Manifest

1. **Project Settings** (ไอคอนเฟือง) → ติ๊ก ☑ **Show "appsscript.json" manifest file in editor**
2. เปิด `appsscript.json` → แทนที่ด้วยเนื้อหาจาก `backend/appsscript.json`
3. บันทึก

> v2 เพิ่มสิทธิ์ 2 อย่าง: `spreadsheets` (เปิดชีตด้วย ID) และ `script.external_request` (เรียก Claude API)

### 3.4 รัน setupSystem()

1. เลือกฟังก์ชัน **`setupSystem`** → **Run**
2. ขออนุญาต: **Review permissions** → เลือกบัญชี → **Advanced** → **Go to … (unsafe)** → **Allow**
3. ดู **Execution log** ต้องเห็นประมาณนี้:

```
แท็บข้อมูลสัญญา: "…" (header แถว 1)
อ่านสัญญาได้ N รายการ        ← ต้องตรงกับจำนวนแถวในชีต
ผู้ช่วย AI: ยังไม่ได้ตั้ง ANTHROPIC_API_KEY
```

ถ้าชีต `Users` ยังว่าง จะสร้างบัญชี `admin@planb.co.th` / `PlanB@2026` ให้ (มีผู้ใช้อยู่แล้วจะไม่รีเซ็ต)

---

## 4. ตั้งค่าผู้ช่วย AI

### 4.1 ใส่ API key (ห้ามใส่ในโค้ด / GitHub)

**Project Settings → Script properties → Add script property**

| Property | ค่า | จำเป็น |
|---|---|---|
| `ANTHROPIC_API_KEY` | คีย์จาก console.anthropic.com | ✅ |
| `AI_MODEL` | ค่าเริ่มต้น `claude-opus-5` | – |
| `SPREADSHEET_ID` | เปลี่ยนฐานข้อมูลโดยไม่แก้โค้ด | – |
| `SHEET_DATA` | ล็อกชื่อแท็บข้อมูลสัญญา | – |

### 4.2 ทดสอบ

เลือกฟังก์ชัน **`testAI`** → **Run** → Execution log ต้องมี `"ok": true` และคำตอบภาษาไทย

### 4.3 ทำงานอย่างไร

```
ผู้ใช้พิมพ์คำถาม (แท็บ ✦ ผู้ช่วย AI)
  └─► POST { action:'askAI', question, history }  → backend
        ├─ ตรวจ token (ต้องล็อกอิน)
        ├─ อ่านสัญญาทั้งหมดจากชีต → แนบเป็น context (prompt cache)
        ├─ UrlFetchApp → api.anthropic.com/v1/messages
        └─ บันทึกคำถาม + จำนวน token ลงชีต Log
```

- ค่าใช้จ่าย: ข้อมูล ~72 สัญญา ≈ 20K tokens ต่อคำถาม · คำถามถัดไปภายใน 5 นาทีได้ส่วนลด cache
- ปรับความลึกของการคิดได้ที่ `CFG.AI_EFFORT` (`low` / `medium` / `high`) — ถ้าเจอ timeout ให้ลดเป็น `low`
- ข้อมูลสัญญาถูกส่งไปประมวลผลที่ Anthropic API ตอนถามคำถาม — ตรวจสอบนโยบายข้อมูลขององค์กรก่อนเปิดใช้

### 4.4 แจ้งเตือนหนังสือต่อสัญญาทางอีเมล

อิงคอลัมน์ AF **"วันที่ต้องทำหนังสือแจ้งเตือน"** ของชีต **TEST- Contract Rental 2026 (PB)** — ตรวจทุกวันประมาณ 08:00 น. ส่งอีเมล 1 ฉบับเฉพาะวันที่มีรายการ:

| เงื่อนไข | เตือนเมื่อ |
|---|---|
| แจ้งเตือนล่วงหน้า | เหลืออีก **30 วัน** ถึงวันที่ต้องทำหนังสือแจ้งเตือน |
| ใกล้ถึงกำหนด | เหลืออีก **3 วัน** |
| สรุปเดือนปัจจุบัน | วันที่ 1 ของทุกเดือน |

- ผู้รับ: **vanidarat.si@planbmedia.co.th**
- ข้อมูลในอีเมล: วันที่ต้องจัดทำหนังสือต่อระยะเวลาสัญญา · Contract No. · Media Site · ชื่อคู่สัญญา · วันสิ้นสุดสัญญา
- ข้าม: สัญญา Write Off และสัญญาที่ "สถานะการต่อสัญญา" = Complete / Not Renew
- ปรับวันเตือนได้ที่ `NOTICE.OFFSETS` ใน `backend/Notice.gs` (เช่น `[30, 7, 3]`)

**ตั้งค่า (ไม่บังคับ)** — Project Settings → Script properties:

| Property | ค่า |
|---|---|
| `NOTICE_EMAILS` | เปลี่ยน/เพิ่มผู้รับ คั่นด้วย `,` (ค่าเริ่มต้น vanidarat.si@planbmedia.co.th) |
| `SITE_URL` | `https://contract-woad.vercel.app/frontend/` — ใส่ปุ่มเปิดระบบในอีเมล |

**เปิดใช้งาน (ครั้งเดียว):** วางโค้ด → **Ctrl+S** → เลือกฟังก์ชัน `installNoticeTrigger` → **เรียกใช้** → อนุญาตสิทธิ์ส่งอีเมล
> อีเมลอัตโนมัติรันจากโค้ดที่บันทึกใน editor — **ไม่ต้อง Deploy** ก็ทำงาน (Deploy จำเป็นเฉพาะหน้าเว็บ)

**ทดสอบทันที:** เลือกฟังก์ชัน `testNoticeEmail` → **เรียกใช้** → ได้อีเมล `[ทดสอบ]` แสดงรายการของเดือนนี้ + 30 วันข้างหน้า
หรือบนเว็บ: แท็บ **หนังสือแจ้งเตือน** → เลือกเดือน → **ส่งสรุปเดือนที่เลือกให้ฉัน (ทดสอบ)**

**ปิด:** รัน `removeNoticeTrigger`

#### ทางลัด: ไฟล์เดี่ยว `backend/standalone/EmailReminder.gs`

ถ้าต้องการแค่อีเมลแจ้งเตือน (ยังไม่อัปเดต backend ทั้งระบบ) ใช้ไฟล์นี้ไฟล์เดียวได้ — ไม่พึ่งไฟล์อื่น ใส่ในโปรเจกต์ Apps Script ไหนก็ได้ที่เปิดชีตได้

1. Apps Script → **+** ข้าง "ไฟล์" → **สคริปต์** → ตั้งชื่อ `EmailReminder` → วางทั้งไฟล์ → **Ctrl+S**
2. เรียกใช้ `reminderInstall` → อนุญาตสิทธิ์ (เปิดตรวจทุกวัน 08:00 น.)
3. เรียกใช้ `reminderTest` → ได้อีเมล `[ทดสอบ]` ทันที

ตั้งค่าอยู่ใน `ER` บนสุดของไฟล์ (ผู้รับ / วันเตือน `[30, 3]` / ชื่อชีต) · ปิดด้วย `reminderRemove`
> ใช้ **อย่างใดอย่างหนึ่ง** กับ `installNoticeTrigger` ของระบบหลัก — `reminderInstall` ปิด trigger ของระบบหลักให้อัตโนมัติ กันอีเมลซ้ำ

**หยุดเตือนสัญญาที่ทำหนังสือแล้ว:** ตั้ง **"สถานะการต่อสัญญา"** เป็น `Complete` หรือ `Not Renew`

### 4.5 แก้สถานะจากหน้าเว็บ (admin)

แท็บ **หนังสือแจ้งเตือน** → เลือกเดือน → ตารางรายละเอียด:

| ช่อง | รูปแบบ | บันทึก |
|---|---|---|
| สถานะการต่อสัญญา | Dropdown: `Complete` / `On Process` / `Not Renew` | ทันทีที่เลือก |
| สถานะเอกสาร | Text box ไม่เกิน 100 ตัวอักษร | เมื่อกด Enter หรือคลิกออกจากช่อง |

- เขียนกลับลงชีตทันที + บันทึกค่าเดิม → ค่าใหม่ในชีต `Log` (Action `UPDATE_STATUS`)
- ผู้ใช้ role `viewer` เห็นเป็นข้อความอย่างเดียว
- ถ้ามีคนแทรก/ลบแถวในชีตหลังเปิดหน้าเว็บ ระบบจะไม่เขียนผิดแถว — ขึ้นข้อความให้กด ↻ รีเฟรช
- `setupSystem` ใส่ dropdown และจำกัด 100 ตัวอักษรในชีตให้ด้วย (หรือเมนู ⚙️ Contract Hub → ตั้ง Dropdown สถานะในชีต)
  ค่าเดิมที่ไม่ใช่ 3 สถานะนี้ (เช่น `Write Off`) จะยังอยู่ แต่ชีตจะขึ้นเครื่องหมายเตือนสีแดงที่เซลล์

> โควตา MailApp: บัญชี Google Workspace ส่งได้ 1,500 ผู้รับ/วัน — ระบบส่งวันละไม่เกิน 1 ฉบับ

### 4.5.1 แก้ไขข้อมูลสัญญาทุกช่องจากหน้าเว็บ (admin)

เปิดรายละเอียดสัญญา (คลิกแถวในตาราง) → ปุ่ม **✎ แก้ไข** → แก้ช่องที่ต้องการ (ช่องที่เปลี่ยนจะเป็นสีเหลือง) → **บันทึกลง Google Sheet**

- เขียนลงชีตเฉพาะช่องที่เปลี่ยน · วันที่เขียนเป็นวันที่จริงของชีต · %Rev Share กรอก 0–100 · มูลค่าหลักประกันเป็นตัวเลข
- ตรวจค่าก่อนเขียน — ถ้าช่องใดผิดจะไม่เขียนเลยสักช่อง และบอกช่องที่ผิดใต้ช่องนั้น
- บันทึกค่าเดิม → ค่าใหม่ลงชีต `Log` (Action `UPDATE_CONTRACT`)
- ระหว่างเปิดฟอร์มแก้ไข ระบบจะไม่โหลดข้อมูลทับ — ถ้ามีคนแก้ชีตพร้อมกัน จะโหลดให้หลังปิดฟอร์ม
- ช่อง `No` แก้จากเว็บไม่ได้

### 4.6 ซิงค์สองทาง Google Sheet ⇄ หน้าเว็บ

| ทิศทาง | ทำงานอย่างไร | ใช้เวลา |
|---|---|---|
| หน้าเว็บ → ชีต | แก้ "สถานะการต่อสัญญา" / "สถานะเอกสาร" บนเว็บ → เขียนลงชีตทันที | ทันที |
| ชีต → หน้าเว็บ | หน้าเว็บที่เปิดอยู่ตรวจลายนิ้วมือข้อมูลในชีตทุก 30 วินาที ถ้าเปลี่ยนจะโหลดใหม่เอง | ≤ ~45 วินาที |
| หน้าเว็บ → หน้าเว็บคนอื่น | ผ่านชีต — คนที่เปิดเว็บอยู่จะเห็นการแก้ของคนอื่นในรอบถัดไป | ≤ ~45 วินาที |

- ป้าย **● ซิงค์กับ Google Sheet** มุมบนแสดงสถานะ: เขียว = ตรงกับชีต · ส้ม = มีข้อมูลใหม่ รอคุณแก้ช่องให้เสร็จ · แดง = เชื่อมต่อไม่ได้ (ลองใหม่เอง) — คลิกเพื่อตรวจทันที
- โหลดใหม่แบบเบื้องหลัง: คงแท็บ เดือนที่เลือก และตัวกรองไว้ · ไม่โหลดทับขณะกำลังพิมพ์/บันทึกสถานะ
- กลับมาที่แท็บเบราว์เซอร์ ระบบตรวจทันที · แท็บที่ถูกซ่อนจะหยุดตรวจเพื่อประหยัดโควตา
- Netlify เป็นแค่ที่เก็บไฟล์หน้าเว็บ — ข้อมูลทั้งหมดวิ่งผ่าน Apps Script ไป Google Sheet จึงไม่ต้อง deploy Netlify ใหม่เมื่อข้อมูลเปลี่ยน

---

## 5. Deploy Web App

**ติดตั้งครั้งแรก:** **Deploy → New deployment** → type **Web app**

| ช่อง | ค่า |
|---|---|
| Execute as | **Me** |
| Who has access | **Anyone** |

→ **Deploy** → คัดลอก **Web app URL** (ลงท้าย `/exec`)

**อัปเดตโค้ด (URL เดิม):** **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**

ทดสอบ: เปิด URL ตรง ๆ ต้องได้ `{"ok":true,"service":"Contract Rental Hub API","version":"2.0.0"}`

---

## 6. Frontend: GitHub Pages หรือ Netlify

repo เดียวกันใช้ได้ทั้งสองที่ — เลือกอย่างใดอย่างหนึ่งหรือทั้งคู่ (ข้อมูลซิงค์ผ่าน Google Sheet เหมือนกัน)

### 6.0 GitHub (เก็บโค้ด + GitHub Pages)

**ขึ้นโค้ดผ่านหน้าเว็บ GitHub (ไม่ต้องติดตั้ง git):**

1. รัน `powershell -ExecutionPolicy Bypass -File tools\prepare-upload.ps1` → ได้โฟลเดอร์ `_upload\` ที่คัดไฟล์ไว้แล้ว (ไม่มี `backend/dist`, ไฟล์ข้อมูล)
2. repo บน GitHub → **Add file → Upload files**
3. เปิด `_upload\` → **Ctrl+A** → ลากทั้งหมดไปวาง → **Commit changes**
4. ถ้าใน repo มีไฟล์ v1 ค้างที่ root (`css/`, `js/`, `google-apps-script/`, `Code.gs`, `config.js`) ให้ลบออก — **ยกเว้น `index.html` ที่ root** (ตัวใหม่เป็นตัวพาไป `frontend/`)

**หรือใช้ git:**

```bash
git add -A
git commit -m "Contract Rental Hub v2.2"
git push
```

**เปิด GitHub Pages (ครั้งเดียว)** — เลือกแบบใดแบบหนึ่ง:

| แบบ | ตั้งค่า | URL |
|---|---|---|
| **A. GitHub Actions (แนะนำ)** | Settings → Pages → Source: **GitHub Actions** → แท็บ Actions ต้องขึ้น ✅ | `https://<user>.github.io/<repo>/` |
| B. Deploy from a branch | Settings → Pages → Source: Deploy from a branch → `main` / `/ (root)` | `https://<user>.github.io/<repo>/` → พาไป `/frontend/` อัตโนมัติ |

> GitHub Pages ของ repo **Private** ใช้ได้เฉพาะแผน Team/Enterprise — แผนฟรีต้องเป็น Public (repo ไม่มีข้อมูลสัญญา / คีย์ — ตรวจแล้ว) หรือใช้ Netlify แทน

## Netlify

### 6.1 ตั้งค่า API

`frontend/js/config.js` → `API_URL` = Web app URL (ลงท้าย `/exec`)
ก่อน deploy ให้เปิด `{API_URL}?action=ping` ในเบราว์เซอร์ ต้องได้ `{"ok":true,...}` ก่อน

### 6.2 วิธี A — ลากวาง (Netlify Drop, ไม่ต้องใช้ git)

1. สมัคร/ล็อกอิน [app.netlify.com](https://app.netlify.com) (ถ้าไม่ล็อกอิน เว็บจะถูกลบใน 1 ชม. และแก้ไขไม่ได้)
2. **Add new site → Deploy manually** (หรือเปิด [app.netlify.com/drop](https://app.netlify.com/drop))
3. ลาก **เฉพาะโฟลเดอร์ `frontend/`** ไปวาง — ห้ามลากทั้งโปรเจกต์ (`backend/` จะหลุดขึ้นเว็บ)
4. ได้ URL เช่น `https://xxxx.netlify.app` → **Site configuration → Change site name** ตั้งชื่อให้จำง่าย

**อัปเดตครั้งถัดไป:** เข้าเว็บไซต์ใน Netlify → แท็บ **Deploys** → ลากโฟลเดอร์ `frontend/` ใหม่ไปวางในกรอบ "Drag and drop" — URL เดิม

### 6.3 วิธี B — เชื่อม GitHub (deploy อัตโนมัติทุกครั้งที่ push)

1. ขึ้นโค้ดไป GitHub (ผ่านเว็บ **Add file → Upload files** หรือ `git push`)
   - อัปโหลด: `frontend/`, `backend/`, `netlify.toml`, `.gitignore`, ไฟล์ `.md`
   - **ไม่ต้อง**อัปโหลด: `backend/dist/`, ไฟล์ `.xlsx`
   - ถ้ามีไฟล์ v1 ที่ root ของ repo (`index.html`, `css/`, `js/`, `google-apps-script/`, `Code.gs`, `config.js`) ให้ลบออก
2. Netlify → **Add new site → Import an existing project → GitHub** → เลือก repo
3. Netlify อ่าน `netlify.toml` เอง (publish = `frontend`) → **Deploy**

> ถ้าเคยเปิด GitHub Pages ไว้ ปิดได้ที่ repo → Settings → Pages (ไม่จำเป็นแล้ว)

---

## 7. ทดสอบระบบ

- [ ] ล็อกอินได้ → Dashboard เห็น KPI 9 ตัว
- [ ] การ์ด **สัญญาที่จะหมดใน 12 เดือนข้างหน้า** แสดงครบทุกประเภทสื่อ + ยอดรวม
- [ ] การ์ด **วันที่ต้องทำหนังสือแจ้งเตือน** แสดง 24 เดือน (ม.ค. ปีนี้ – ธ.ค. ปีหน้า) คลิกเลขที่สัญญาแล้ว drawer เปิด
- [ ] แท็บ **ทะเบียนสัญญา** จำนวนแถวตรงกับชีต · ฟิลเตอร์ใช้ได้
- [ ] drawer แสดง "ต้องทำหนังสือแจ้งเตือนภายใน … (ตามชีต)"
- [ ] แท็บ **✦ ผู้ช่วย AI** → กดคำถามตัวอย่าง → ได้คำตอบที่อ้างเลขที่สัญญา
- [ ] ถามต่อเนื่อง ("ขอเฉพาะของ Plan B") → AI เข้าใจบริบทคำถามก่อนหน้า
- [ ] ชีต `Log` มีแถว `ASK_AI`
- [ ] Export CSV เปิดใน Excel ภาษาไทยไม่เพี้ยน

---

## 8. การจัดการผู้ใช้

- เพิ่มจากหน้าเว็บ: แท็บ **สมาชิก** (เฉพาะ admin) — ระบบสุ่มรหัสผ่านชั่วคราวให้
- เปลี่ยนรหัส / เพิ่มจาก editor:

```javascript
function changeAdminPassword() {
  addUser('admin@planb.co.th', 'รหัสผ่านใหม่ที่แข็งแรง', 'Administrator', 'admin');
}
```

- ปิดบัญชี: ชีต `Users` → คอลัมน์ `Active` = `FALSE`
- ประวัติการใช้งาน (ล็อกอิน / เพิ่มสมาชิก / ถาม AI): ชีต `Log`

---

## 9. อัปเดตโค้ดครั้งถัดไป

| แก้อะไร | ทำอะไรต่อ |
|---|---|
| `backend/*.gs` | รัน `build.ps1` → วาง `dist/Code.gs` ใน editor → **Manage deployments → New version** |
| `frontend/**` | GitHub: `tools\prepare-upload.ps1` → อัปโหลด `_upload\` (Pages deploy เอง) · Netlify: Deploys → ลาก `frontend/` วางใหม่ (หรือเชื่อม Netlify กับ repo ให้ deploy ตาม GitHub) |
| เปลี่ยนฐานข้อมูล | ตั้ง Script Property `SPREADSHEET_ID` → รัน `setupSystem` เพื่อตรวจ |

**clasp (ทางเลือก):** `.clasp.json` ใส่ `{"scriptId":"<Script ID>","rootDir":"backend"}` แล้ว `clasp push` จาก root ของโปรเจกต์ (ไม่ต้อง build)

---

## 10. Troubleshooting

| อาการ | สาเหตุ | วิธีแก้ |
|---|---|---|
| "ไม่พบแท็บข้อมูลสัญญา" | ไม่มีหัวคอลัมน์ `Contract No.` ใน 5 แถวแรก | ตรวจชื่อหัวคอลัมน์ / ตั้ง `SHEET_DATA` |
| "แท็บ … ไม่มีคอลัมน์: …" | ชื่อหัวคอลัมน์ถูกเปลี่ยน | แก้ชื่อในชีต หรือเพิ่มชื่อใหม่ใน `COLUMNS` (`Config.gs`) |
| Exception: You do not have permission to call SpreadsheetApp.openById | manifest ยังเป็นของ v1 | วาง `backend/appsscript.json` ใหม่ แล้วรัน `setupSystem` อนุญาตสิทธิ์อีกครั้ง |
| AI: "ยังไม่ได้ตั้งค่า ANTHROPIC_API_KEY" | ไม่มี Script Property | ข้อ 4.1 |
| AI: "API key ของ Claude ไม่ถูกต้อง" | คีย์ผิด/ถูกยกเลิก | สร้างคีย์ใหม่ที่ console.anthropic.com |
| AI: "ระบบ AI มีผู้ใช้งานมาก" | rate limit / API overload | รอสักครู่แล้วถามใหม่ |
| AI ตอบช้าจนขึ้น error | UrlFetchApp timeout | ลด `CFG.AI_EFFORT` เป็น `low` |
| เปิด `/exec` แล้วขึ้น "ไม่พบฟังก์ชันของสคริปต์: doGet" | deployment ไม่มีโค้ด backend (ยังไม่ได้วาง/บันทึก หรือ deploy version เก่า) | วาง `dist/Code.gs` → บันทึก → Manage deployments → Edit → **New version** |
| Netlify ขึ้น "Page not found" | ลากทั้งโปรเจกต์แทนโฟลเดอร์ `frontend/` | ลากเฉพาะ `frontend/` (ต้องมี `index.html` อยู่ชั้นบนสุด) |
| ข้อมูลไม่อัปเดตหลังแก้ชีต | cache 5 นาที | กด **↻ รีเฟรช** |
| "เชื่อมต่อ API ไม่สำเร็จ" | Web App access ไม่ใช่ Anyone | Manage deployments → Who has access: **Anyone** |

Debug: F12 → Console / Network · Apps Script → **Executions**

---

## 11. Security Checklist

- [ ] เปลี่ยนรหัสผ่าน `admin@planb.co.th` แล้ว
- [ ] `ANTHROPIC_API_KEY` อยู่ใน Script Properties เท่านั้น — ไม่อยู่ในโค้ดหรือ GitHub
- [ ] Google Sheet ตั้ง sharing เป็น **Restricted** — เข้าถึงข้อมูลผ่าน backend เท่านั้น
- [ ] repo ไม่มีข้อมูลสัญญาจริง (`.xlsx`, `.csv` อยู่ใน `.gitignore` แล้ว)
- [ ] ตรวจนโยบายองค์กรเรื่องการส่งข้อมูลสัญญา (ชื่อคู่สัญญาบุคคล / มูลค่า) ไปประมวลผลที่ Anthropic API

### ข้อจำกัดที่ควรรู้

- `API_URL` เปิดเผยในโค้ดฝั่ง client (เลี่ยงไม่ได้สำหรับ static site) — ทุก endpoint ยกเว้น `ping` / `login` ต้องมี token
- Token เก็บใน `sessionStorage` หมดอายุใน 8 ชม.
- หน้าเว็บแก้ได้เฉพาะ "สถานะการต่อสัญญา" และ "สถานะเอกสาร" (admin) — ข้อมูลอื่นแก้ในชีตโดยตรง
