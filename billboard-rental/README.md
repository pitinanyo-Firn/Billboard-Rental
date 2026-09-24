# Plan B — Billboard Rental Hub

ระบบติดตามค่าเช่าป้ายโฆษณาและการเบิกจ่าย — Dashboard + ทะเบียนค่าเช่า + ครบกำหนดจ่าย + บันทึกจ่าย/ใบเสร็จ + ตรวจสอบข้อมูล + **ผู้ช่วย AI**

โครงสร้างและดีไซน์เดียวกับ Contract Rental Hub (frontend แยกจาก backend, login, ซิงค์สองทางกับชีต) — แทนที่โค้ด "Billboard ERP" เดิมใน Apps Script

| ส่วน | เทคโนโลยี | โฟลเดอร์ |
|---|---|---|
| **Frontend** | HTML/CSS/JS · Vercel / GitHub Pages | [`frontend/`](frontend/) |
| **Backend** | Google Apps Script Web App ([Billboard Rental](https://script.google.com/home/projects/1-6nGq5g24XJjqjqgTfWYgiQyLfzQyvVxeLUZuaBXVlqh1vG6XymqgZVS/edit)) | [`backend/`](backend/) |
| **Database** | Google Sheets — [AI_Rental_Billboard_2026](https://docs.google.com/spreadsheets/d/1u79bT7EnBxU8kYmcc14NUi6ZRAc2UDOdSvWNqd2uwlU) | – |
| **AI** | Claude API (`claude-opus-5`) เรียกจาก backend | [`backend/AI.gs`](backend/AI.gs) |

---

## Architecture

```
┌──────────────────────────┐   POST (text/plain, JSON)   ┌──────────────────────┐      ┌─────────────────────────┐
│  frontend/               │ ──────────────────────────► │  backend/            │ ───► │  Google Sheets          │
│  Vercel / GitHub Pages   │ ◄────────────────────────── │  Apps Script Web App │      │  Contract_Master        │
│  (ไม่มีข้อมูล / ไม่มีคีย์)      │        JSON response        │  (auth + data + AI)  │      │  Payment_History        │
└──────────────────────────┘                             └──────────┬───────────┘      │  Receipt_Tracking       │
                                                                    │                  │  Users · Log            │
                                                         ┌──────────▼───────────┐      └─────────────────────────┘
                                                         │  Claude API          │
                                                         └──────────────────────┘
```

- **ข้อมูลค่าเช่าและ API key อยู่ฝั่ง backend เท่านั้น** — repo บน GitHub มีแค่โค้ด
- ใช้ `Content-Type: text/plain` เพื่อเลี่ยง CORS preflight ที่ Apps Script ไม่รองรับ

---

## Features

| แท็บ | รายละเอียด |
|---|---|
| **Login** | Email + Password (SHA-256 + salt ในชีต `Users`) · session 8 ชม. · log ทุกครั้ง · role `admin` / `viewer` |
| **Dashboard** | KPI 10 ตัว · ค่าเช่าต่อปีแยกประเภทสื่อ · ครบกำหนดจ่ายเร็ว ๆ นี้ · ประมาณการค่าเช่า 12 เดือน · สถานะการเบิกตามประเภทสื่อ · บริษัท · External vs Inter-Co · สัญญาหมดอายุ |
| **ทะเบียนค่าเช่า** | ค้นหา + ตัวกรอง 6 ชั้น · คลิกแถวเปิดรายละเอียด · admin ✎ แก้ไขทุกช่อง → เขียนลงชีตทันที + audit log |
| **ครบกำหนดจ่าย** | เลยกำหนด + ภายใน 30 วัน (วันชำระตามสัญญา หรือเช็คลงวันที่) · สถานะอีเมลแจ้งเตือน · admin ส่งสรุปเองได้ |
| **บันทึกจ่าย / ใบเสร็จ** | บันทึกลง `Payment_History` + สร้างรายการ `Receipt_Tracking` · กันบันทึกซ้ำ · เปลี่ยนสถานะ/ลบใบเสร็จ (admin) · แสดงส่วนต่างยอด |
| **ตรวจสอบข้อมูล** | ตรวจทุกแถวใน `Contract_Master` · แก้อัตโนมัติได้: วันที่เขียนเป็น ด/ว/ป, คำสะกดผิด, ช่องว่างเกิน |
| **✦ ผู้ช่วย AI** | ถามเป็นภาษาไทย เช่น "เดือนหน้าต้องเตรียมเงินจ่ายค่าเช่ารวมเท่าไหร่" |
| **สมาชิก** | admin เพิ่ม/แก้สิทธิ์/ปิดใช้งาน/รีเซ็ตรหัสผ่าน/ลบผู้ใช้จากหน้าเว็บ · เข้าสู่ระบบด้วยอีเมลหรือชื่อผู้ใช้ |
| **อีเมลเตือน** | ทุกวัน 08:00 เมื่อเหลือ 3 วันถึงวันที่ต้องจ่าย + สรุปรายการเลยกำหนดทุกวันจันทร์ ([`Alert.gs`](backend/Alert.gs)) |
| **ซิงค์สองทาง** | แก้บนเว็บ → เขียนชีตทันที · แก้ในชีต → หน้าเว็บอัปเดตเองภายใน ~45 วินาที |
| **Export** | CSV พร้อม BOM (Excel ภาษาไทยไม่เพี้ยน) |

### Business Logic

- อ่านชีตตาม **ชื่อหัวคอลัมน์** ([`COLUMNS`](backend/Config.gs)) — แทรก/สลับคอลัมน์ได้
- วันที่: รองรับ Date และข้อความ `d/m/yyyy` · ปี > 2400 = พ.ศ. · ถ้าเขียนเป็น `m/d/yyyy` (เช่น `12/31/2571`) อ่านถูกและแจ้งในแท็บตรวจสอบข้อมูล
- ยอดเงิน: `1,280,000.00` / `+10,569.00` / `-` อ่านเป็นตัวเลขได้ถูกต้อง
- `installment` ยอดต่องวด = Amount/Month (รายเดือน) · Amount/Month × 3 (ราย 3 เดือน) · Amount/Year (รายปี) + Up or CN
- `annualCost` ประมาณการต่อปี = Amount/Month × 12 หรือ Amount/Year
- `payDate` = วันชำระตามสัญญา (ยังรอเบิก) หรือ เช็คลงวันที่ (เบิกแล้ว เช็คยังไม่ถึงวัน)

| payAlert | เงื่อนไข | สี |
|---|---|---|
| `overdue` | เลยวันชำระแล้ว ยังรอเบิก | แดงเข้ม |
| `due3` | ภายใน 3 วัน | แดง |
| `soon` | ภายใน 30 วัน | ส้ม |
| `normal` | ยังไม่ถึงกำหนด | เขียว |
| `paid` | เบิกแล้ว | เขียว |
| `unknown` | ไม่มีวันที่ | เทา |

---

## Quick Start

1. `powershell -ExecutionPolicy Bypass -File backend\build.ps1` → `backend/dist/` มี `Code.gs` + `appsscript.json` + วิธีวาง
2. เปิด [Apps Script: Billboard Rental](https://script.google.com/home/projects/1-6nGq5g24XJjqjqgTfWYgiQyLfzQyvVxeLUZuaBXVlqh1vG6XymqgZVS/edit) → วาง `Code.gs` แทนโค้ดเดิม + `appsscript.json`
3. รัน `setupSystem()` → Authorize (สร้าง admin `admin-rental` / `P@ssword` — เปลี่ยนรหัสทันที)
4. (ถ้าใช้ AI) Script properties → `ANTHROPIC_API_KEY` · (อีเมลเตือน) รัน `installAlertTrigger()`
5. **Deploy → Web app** (Execute as: Me · Access: Anyone) → URL ใส่ `frontend/js/config.js` → push
6. Vercel → Add New Project → Import repo นี้ → Deploy (อ่าน `vercel.json` ให้เอง ไม่ต้อง build)

> ขั้นตอนละเอียด: [`SETUP_GUIDE.md`](SETUP_GUIDE.md) · โครงสร้างไฟล์: [`FILE_STRUCTURE.md`](FILE_STRUCTURE.md)

---

## API Reference

ทุก request เป็น `POST` ไปที่ `CONFIG.API_URL` body เป็น JSON: `{ "action": "...", "token": "...", ... }`

| Action | Params | Response |
|---|---|---|
| `ping` | — | `{ok, service, version}` |
| `login` | `email`, `password` | `{ok, token, profile, expiresIn}` |
| `logout` / `checkSession` | `token` | `{ok}` / `{ok, profile}` |
| `getDashboard` | `token` | `{ok, kpi, charts, filters, rentals, payments, receipts, receiptStatuses, version, …}` |
| `getVersion` | `token` | `{ok, version}` |
| `getRental` | `token`, `id` | `{ok, rental, payments, receipts}` |
| `updateRental` | `token`, `id`, `contractNo`, `fields{}` (admin) | `{ok, id, changed, rental, version}` · ผิดจะได้ `errors{field}` |
| `getPayments` | `token` | `{ok, payments, receipts}` |
| `recordPayment` | `token`, `id`, `contractNo`, `month` (`yyyy-MM`), `actual`, `remark`, `markPaid`, `force` (admin) | `{ok, month}` · ซ้ำได้ `DUPLICATE` |
| `updateReceipt` / `deleteReceipt` | `token`, `id`, `timestamp`, `vendor`, `status?` (admin) | `{ok}` |
| `previewFixes` / `applyFixes` | `token` (admin) | `{ok, fixes}` / `{ok, applied, skipped}` |
| `getAlertSettings` | `token` | `{ok, triggerOn, hour, offsets, recipientCount, recipients}` |
| `sendAlertNow` | `token`, `toSelf` (admin) | `{ok, sent, to}` |
| `exportCSV` / `clearCache` | `token` | `{ok, csv}` / `{ok}` |
| `getMembers` | `token` (admin) | `{ok, me, members}` |
| `addMember` | `token`, `email`, `name`, `role`, `password?`, … (admin) | `{ok, email, tempPassword}` |
| `updateMember` | `token`, `id`, `email`, `role?`, `active?`, `password?`, `resetPassword?` (admin) | `{ok, email, role, active, tempPassword}` |
| `deleteMember` | `token`, `id`, `email` (admin) | `{ok, email}` |
| `askAI` | `token`, `question`, `history[]` | `{ok, answer, model}` |

**Error codes:** `BAD_REQUEST` · `UNKNOWN_ACTION` · `MISSING_FIELD` · `INVALID_VALUE` · `INVALID_CREDENTIAL` · `DISABLED` · `SESSION_EXPIRED` · `NOT_FOUND` · `STALE` · `DUPLICATE` · `FORBIDDEN` · `SERVER_ERROR` · `AI_*`

---

## สิ่งที่แก้จากโค้ด Billboard ERP เดิม

| ปัญหาในโค้ดเดิม | แก้แล้ว |
|---|---|
| ไม่มี login — ใครมีลิงก์ Web App ก็เรียก `updateCellData` / `deleteReceiptRecord` แก้/ลบชีตได้ | login + session · เขียน/ลบเฉพาะ admin · log ทุกครั้ง |
| `parseFloat("1,280,000.00")` ได้ 1 → กราฟค่าเช่าผิดทั้งหมด | `toNumber_()` ตัดคอมมา |
| Status Payment ถูก fix เป็น "รอเบิก" ทุกแถว · External/Inter-Co เดาจากชื่อบริษัท | อ่านจากคอลัมน์ `Status Payment` / `Rent` จริง |
| อ่านคอลัมน์ตามตำแหน่ง (`d[18]`, `d[32]`) | อ่านตามชื่อหัวคอลัมน์ |
| ข้อมูลจากชีตใส่ `innerHTML` ตรง ๆ (XSS) | escape ทุกค่า |
| `initDatabase()` เขียนชีตทุกครั้งที่เปิดหน้า | สร้างชีตครั้งเดียวใน `setupSystem()` |
| บันทึกจ่ายซ้ำได้ (Payment_History มีรายการซ้ำ 3 ครั้ง) | กันซ้ำ Vendor + Media Site + รอบดิว |
| ลบใบเสร็จตามเลขแถว — ถ้ามีคนแทรก/ลบแถวจะลบผิดรายการ | ตรวจ Timestamp + Vendor ก่อนลบ |
| อีเมลเตือนเฉพาะวันที่เหลือ 3 วันพอดีตาม "เช็คลงวันที่" | + วันชำระตามสัญญาของรายการที่ยังรอเบิก + สรุปรายการเลยกำหนด |
| เมนู 5 จาก 6 ในหน้าเว็บกดแล้วไม่ทำอะไร | ทุกแท็บใช้งานได้ |

---

**Maintainer:** Pitinan 'Firn' Yooviengchai (pitinan.yo@planbmedia.co.th) — Plan B Media
**License:** Internal use only
