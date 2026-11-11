> **สถานะปัจจุบัน:** ติดตั้งและ deploy เรียบร้อยแล้ว — เว็บ https://billboard-rental.vercel.app/ · Apps Script Version 61 · คู่มือผู้ใช้: [`USER_MANUAL.md`](USER_MANUAL.md)
> คู่มือนี้ใช้เมื่อย้ายไปชีต/โปรเจกต์ใหม่ หรือกู้ระบบ

# SETUP_GUIDE.md — ติดตั้ง Billboard Rental Hub

## 1. Backend (Google Apps Script)

1. ในเครื่อง: `powershell -ExecutionPolicy Bypass -File backend\build.ps1`
2. เปิด [Apps Script: Billboard Rental](https://script.google.com/home/projects/1-6nGq5g24XJjqjqgTfWYgiQyLfzQyvVxeLUZuaBXVlqh1vG6XymqgZVS/edit)
3. **Code.gs** → Ctrl+A → วางเนื้อหา `backend/dist/Code.gs` → Ctrl+S
   (โค้ด Billboard ERP เดิมถูกแทนทั้งหมด — `Index.html` ลบได้ เพราะหน้าเว็บย้ายไป Vercel)
4. **Project Settings** → ติ๊ก *Show "appsscript.json"* → วาง `backend/dist/appsscript.json`
5. เลือกฟังก์ชัน `setupSystem` → **Run** → Authorize
   - สร้างชีต `Users` / `Log` + admin `admin-rental` รหัสผ่าน `P@ssword`
   - Execution log แสดงจำนวนรายการ + จำนวนแถวที่มีปัญหาข้อมูล
6. (ทางเลือก) **Script properties**
   | Key | ค่า |
   |---|---|
   | `ANTHROPIC_API_KEY` | คีย์ Claude API (ผู้ช่วย AI) |
   | `NOTICE_EMAILS` | ผู้รับอีเมลเตือน คั่นด้วย `,` (ค่าเริ่มต้น pitinan.yo@, vanidarat.si@, jiraporn@planbmedia.co.th) |
   | `ALERT_OFFSETS` | เตือนล่วงหน้ากี่วัน (ค่าเริ่มต้น `7,3` = ครั้งที่ 1 ก่อน 7 วัน · ครั้งที่ 2 ก่อน 3 วัน) |
   | `SITE_URL` | ลิงก์หน้าเว็บ Vercel (ใส่ปุ่มในอีเมล) |
   | `GEMINI_API_KEY` | คีย์ Gemini **ฟรี** จาก https://aistudio.google.com/apikey — AI สรุปความเสี่ยงประจำวัน |
   | `GEMINI_MODEL` | รุ่น Gemini (ค่าเริ่มต้น `gemini-3.5-flash-lite`) |
   | `AI_PROVIDER` | `claude` = ใช้ Claude แทน Gemini (ต้องมี `ANTHROPIC_API_KEY`) |
   | `REVIEW_PROVIDER` | AI ตัวที่ 2 ตรวจซ้ำ: `auto` (ค่าเริ่มต้น — Claude ถ้ามี `ANTHROPIC_API_KEY` ไม่งั้น Gemini) · `claude` · `gemini` · `off` |
   | `REVIEW_MODEL` | รุ่นของ AI ผู้ตรวจ (ค่าเริ่มต้น Gemini `gemini-3.8-flash` / Claude ตาม `AI_MODEL`) |
   | `DOC_AI_PROVIDER` | AI ตรวจเอกสารในไฟล์แนบ: `auto` (Claude ถ้ามีคีย์ ไม่งั้น Gemini) · `claude` · `gemini` |
   | `ATTACH_FOLDER_ID` | โฟลเดอร์ Drive เก็บไฟล์แนบ — ระบบสร้างให้เองครั้งแรก |
   | `INSIGHT_EMAILS` | ผู้รับอีเมล AI สรุปความเสี่ยงระดับสูง คั่นด้วย `,` (ค่าเริ่มต้น `CFG.ADMIN_EMAIL`) |
7. อีเมลเตือน: รัน `installAlertTrigger` (ลบ trigger `sendPaymentAlertEmails` ของโค้ดเดิมให้เอง)
   **ไฟล์แนบ (Version 62+):** manifest ต้องมี scope `https://www.googleapis.com/auth/drive` (อยู่ใน `backend/dist/appsscript.json` แล้ว) — หลังวาง manifest ใหม่ ให้รันฟังก์ชันใดก็ได้ 1 ครั้ง (เช่น `testAIInsight`) แล้วกด Allow สิทธิ์ Google Drive
   API Key ใส่จากหน้าเว็บได้ที่ปุ่ม 🔑 API Key (admin)
   AI สรุปความเสี่ยง: ทำงานพร้อม trigger นี้ · ทดสอบด้วย `testAIInsight` (ไม่ส่งอีเมล) แล้วดูชีต `AI_Insights`
   Accrued: รัน `setupAccrued` ครั้งเดียว — สร้างชีต `Accrued` ตาม Form ของบัญชี (+ นำเข้ารายการ Sep-26 จากไฟล์ Excel ถ้ายังไม่มี)
8. **Deploy → New deployment → Web app** · Execute as: **Me** · Who has access: **Anyone** → คัดลอก URL ที่ลงท้าย `/exec`
9. ทดสอบ: เปิด `<URL>?action=ping` ต้องได้ `{"ok":true,"service":"Billboard Rental Hub API","version":"1.0.0"}`

> ครั้งต่อไปที่แก้โค้ด: Deploy → **Manage deployments** → ✎ → Version: **New version** (URL เดิมใช้ต่อได้) → แล้วรัน `installAlertTrigger` ใหม่ (trigger ผูกกับเวอร์ชันที่ติดตั้ง)

## 2. แก้ข้อมูลในชีต

- เว็บแท็บ **ตรวจสอบข้อมูล** แสดงทุกปัญหา · admin กด **แก้อัตโนมัติ…** เพื่อแก้วันที่ที่เขียนเป็น เดือน/วัน/ปี, คำสะกดผิด, ช่องว่างเกิน
  (หรือในชีต เมนู ⚙️ Billboard Rental → แก้ข้อมูลอัตโนมัติ)
- ปัญหาที่ต้องตรวจกับเอกสารจริง (ยอดเงินว่าง, ปีน่าจะพิมพ์ผิด, ยอดใส่ผิดช่อง) → คลิกแถว → ✎ แก้ไข

## 3. Frontend (Vercel)

1. แก้ `frontend/js/config.js` → `API_URL` = URL จากข้อ 1.8 → commit/push
2. [vercel.com/firn1](https://vercel.com/firn1) → **Add New… → Project** → Import `Billboard-Rental`
3. Framework Preset: **Other** · Build Command: ว่าง · Output Directory: ว่าง → **Deploy**
4. เปิด URL ที่ได้ → login ด้วย admin → เปลี่ยนรหัสผ่าน (เพิ่มสมาชิกใหม่ในแท็บสมาชิก)
5. ใส่ URL เว็บใน Script property `SITE_URL`

## 4. อัปเดตโค้ดขึ้น GitHub (ไม่มี git ในเครื่อง)

`powershell -ExecutionPolicy Bypass -File tools\prepare-upload.ps1` → เปิด `_upload\` → ลากทั้งหมดไปวางที่ GitHub → **Add file → Upload files** → Commit
