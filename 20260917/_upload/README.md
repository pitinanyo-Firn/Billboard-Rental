# Plan B — Contract Rental Hub

ระบบบริหารจัดการสัญญาเช่าพื้นที่สื่อโฆษณา — Dashboard + ทะเบียนสัญญา + ระบบเตือนต่อสัญญา + **ผู้ช่วย AI**

| ส่วน | เทคโนโลยี | โฟลเดอร์ |
|---|---|---|
| **Frontend** | HTML/CSS/JS · Vercel ([contract-woad.vercel.app](https://contract-woad.vercel.app/frontend/)) / GitHub Pages / Netlify | [`frontend/`](frontend/) |
| **Backend** | Google Apps Script Web App | [`backend/`](backend/) |
| **Database** | Google Sheets — [Contract Rental (PB)](https://docs.google.com/spreadsheets/d/11VOe1_OWevonHJc73rKVeDIYJKzzieWxuaXrjvwPDUU) | – |
| **AI** | Claude API (`claude-opus-5`) เรียกจาก backend | [`backend/AI.gs`](backend/AI.gs) |

---

## Architecture

```
┌──────────────────────────┐   POST (text/plain, JSON)   ┌──────────────────────┐      ┌──────────────────┐
│  frontend/               │ ──────────────────────────► │  backend/            │ ───► │  Google Sheets   │
│  GitHub Pages / Netlify  │ ◄────────────────────────── │  Apps Script Web App │      │  สัญญา · Users · Log │
│  (ไม่มีข้อมูล / ไม่มีคีย์)      │        JSON response        │  (auth + data + AI)  │      └──────────────────┘
└──────────────────────────┘                             └──────────┬───────────┘
                                                                    │ HTTPS (API key ใน Script Properties)
                                                         ┌──────────▼───────────┐
                                                         │  Claude API          │
                                                         └──────────────────────┘
```

- **ข้อมูลสัญญาและ API key อยู่ฝั่ง backend เท่านั้น** — repo บน GitHub มีแค่โค้ด
- ใช้ `Content-Type: text/plain` เพื่อเลี่ยง CORS preflight ที่ Apps Script ไม่รองรับ

---

## Features

| ส่วน | รายละเอียด |
|---|---|
| **Login** | Email + Password (SHA-256 + salt ในชีต `Users`) · session 8 ชม. · log ทุกครั้ง |
| **Dashboard** | KPI 9 ตัว · สัญญาที่จะหมดใน 12 เดือนแยกประเภทสื่อ · ตารางวันที่ต้องทำหนังสือแจ้งเตือน 24 เดือน · กราฟ 5 ชุด |
| **ทะเบียนสัญญา** | ค้นหา + ฟิลเตอร์ 5 ชั้น (บริษัท · ประเภทสื่อ · สถานะ · จังหวัด · ความเร่งด่วน) |
| **รายการต้องดำเนินการ** | สัญญาที่หมดอายุภายใน 180 วัน พร้อมเส้นตายทำหนังสือแจ้งเตือน |
| **หนังสือแจ้งเตือน** | ตารางรายเดือน 24 เดือนตาม "วันที่ต้องทำหนังสือแจ้งเตือน" + รายละเอียดรายเดือน · admin แก้ "สถานะการต่อสัญญา" (Complete / On Process / Not Renew) และ "สถานะเอกสาร" (≤100 ตัวอักษร) บันทึกลงชีตทันที |
| **แก้ไขข้อมูล** | admin แก้ทุกช่องของสัญญาจากหน้ารายละเอียด (✎ แก้ไข) → เขียนลงชีตทันที พร้อม audit log ([`editor.js`](frontend/js/editor.js), [`Edit.gs`](backend/Edit.gs)) |
| **ซิงค์สองทาง** | แก้บนเว็บ → เขียนลงชีตทันที · แก้ในชีต → หน้าเว็บที่เปิดอยู่อัปเดตเองภายใน ~45 วินาที ([`sync.js`](frontend/js/sync.js)) |
| **อีเมลเตือน** | ส่งอัตโนมัติทุกวันเมื่อใกล้/เลยกำหนดทำหนังสือ + สรุปทุกวันที่ 1 · admin ส่งสรุปเองจากหน้าเว็บได้ ([`Notice.gs`](backend/Notice.gs)) |
| **หน้ารายละเอียด** | drawer ตาม layout "รายละเอียดสัญญา" + ความรับผิดชอบค่าใช้จ่าย 9 รายการ + สั่งพิมพ์ได้ |
| **✦ ผู้ช่วย AI** | ถามเป็นภาษาไทยเรื่องสัญญา เช่น "สัญญาไหนต้องส่งหนังสือแจ้งต่อสัญญาเดือนหน้า" · ถามต่อเนื่องได้ · log ทุกคำถาม |
| **สมาชิก** | admin เพิ่มผู้ใช้จากหน้าเว็บ |
| **Export** | CSV พร้อม BOM (Excel ภาษาไทยไม่เพี้ยน) |

### Business Logic

- อ่านชีตตาม **ชื่อหัวคอลัมน์** — แทรก/สลับคอลัมน์ได้ · หาแท็บข้อมูลอัตโนมัติจากหัวคอลัมน์ `Contract No.`
- `daysToExpire` — วันคงเหลือถึงวันสิ้นสุดสัญญา
- `noticeDeadline` — ค่าจากคอลัมน์ `วันที่ต้องทำหนังสือแจ้งเตือน` · ถ้าว่าง = วันสิ้นสุด − `เงื่อนไขการต่อสัญญา` (วัน)
- `alert`:

| ระดับ | เงื่อนไข | สี |
|---|---|---|
| `critical` | เลยวันที่ต้องทำหนังสือแจ้งเตือนแล้ว | แดง |
| `expired` | หมดอายุแล้ว | แดงเข้ม |
| `warning` | หมดอายุภายใน 90 วัน | ส้ม |
| `normal` | ปกติ | เขียว |
| `closed` | สถานะ Write Off | เทา |
| `unknown` | ไม่มีวันที่สิ้นสุด | เทาอ่อน |

---

## Quick Start

1. ชีตฐานข้อมูล → **Extensions → Apps Script**
2. `powershell -ExecutionPolicy Bypass -File backend\build.ps1` → โฟลเดอร์ `backend/dist/` มีไฟล์ที่ต้องวางใน Apps Script ครบ (`Code.gs`, `appsscript.json`, `EmailReminder.gs` + วิธีวาง)
3. Script properties → `ANTHROPIC_API_KEY`
4. รัน `setupSystem()` แล้ว `testAI()` → Authorize
5. **Deploy → Web app** (Execute as: Me · Access: Anyone) → URL ใส่ `frontend/js/config.js`
6. หน้าเว็บ — เลือก:
   - **GitHub Pages:** `tools\prepare-upload.ps1` → อัปโหลด `_upload\` ขึ้น repo → Settings → Pages → Source: **GitHub Actions**
   - **Netlify:** ลาก `frontend/` ไปวางที่ [app.netlify.com/drop](https://app.netlify.com/drop) หรือเชื่อม Netlify กับ repo (อ่าน `netlify.toml` ให้เอง)

> ขั้นตอนละเอียด: [`SETUP_GUIDE_FULL.md`](SETUP_GUIDE_FULL.md) · โครงสร้างไฟล์: [`FILE_STRUCTURE.md`](FILE_STRUCTURE.md)

---

## API Reference

ทุก request เป็น `POST` ไปที่ `CONFIG.API_URL` body เป็น JSON: `{ "action": "...", "token": "...", ... }`

| Action | Params | Response |
|---|---|---|
| `ping` | — | `{ok, service, version}` |
| `login` | `email`, `password` | `{ok, token, profile, expiresIn}` |
| `logout` / `checkSession` | `token` | `{ok}` / `{ok, profile}` |
| `getDashboard` | `token` | `{ok, kpi, charts, noticeSchedule, filters, contracts, version, alertDays, actionDays, updatedAt}` |
| `getVersion` | `token` | `{ok, version}` — ลายนิ้วมือข้อมูลในชีต ใช้ตรวจการเปลี่ยนแปลง |
| `getContract` | `token`, `id` | `{ok, contract, responsibility}` |
| `getActionList` | `token` | `{ok, list}` |
| `exportCSV` | `token` | `{ok, csv}` |
| `clearCache` | `token` | `{ok}` |
| `addMember` | `token`, `email`, `name`, `role`, … (admin) | `{ok, email, tempPassword}` |
| `askAI` | `token`, `question`, `history[]` | `{ok, answer, model}` |
| `getNoticeSettings` | `token` | `{ok, triggerOn, hour, offsets, overdueEvery, recipientCount, recipients}` |
| `sendNoticeNow` | `token`, `month` (`yyyy-MM`), `toSelf` (admin) | `{ok, sent, to}` |
| `updateContract` | `token`, `id`, `contractNo`, `fields{}` (admin) | `{ok, id, changed, contract, version}` · ผิดจะได้ `errors{field: ข้อความ}` |
| `updateNoticeStatus` | `token`, `id`, `contractNo`, `renewStatus?`, `docStatus?` (admin) | `{ok, id, renewStatus, docStatus, changed}` |

**Error codes:** `BAD_REQUEST` · `UNKNOWN_ACTION` · `MISSING_FIELD` · `INVALID_CREDENTIAL` · `DISABLED` · `SESSION_EXPIRED` · `NOT_FOUND` · `FORBIDDEN` · `SERVER_ERROR` · `AI_NOT_CONFIGURED` · `AI_AUTH` · `AI_BUSY` · `AI_REFUSED` · `AI_ERROR` · `TOO_LONG`

---

## Roadmap

- [x] แก้สถานะการต่อสัญญา / สถานะเอกสารจากหน้าเว็บ (write back + audit trail)
- [ ] แก้ไขข้อมูลสัญญาฟิลด์อื่นจากหน้าเว็บ
- [ ] แนบรูป Ratecard ป้าย / ไฟล์สัญญา PDF รายสัญญา
- [ ] แจ้งเตือนอัตโนมัติทาง Email/LINE เมื่อถึง `noticeDeadline`
- [ ] AI ร่างหนังสือแจ้งเตือนการต่อสัญญาจากข้อมูลสัญญา
- [ ] Role-based access: `viewer` ดูอย่างเดียว / `admin` แก้ไขได้

---

**Maintainer:** Thanakorn Talubsri — Plan B Media
**License:** Internal use only
