/**
 * ============================================================
 *  PLAN B — BILLBOARD RENTAL HUB  |  Backend (Google Apps Script)
 *  Config.gs — ค่าตั้งระบบ + แผนผังคอลัมน์ของชีต Contract_Master
 * ============================================================
 *  สถาปัตยกรรม:
 *    frontend/ (Vercel)        ──POST JSON──►  backend/ (Web App นี้)  ──►  Google Sheets
 *                              ◄──JSON──────                           ──►  Claude API (ผู้ช่วย AI)
 *
 *  ไฟล์ .gs ทุกไฟล์ในโฟลเดอร์ backend/ ใช้ global scope ร่วมกัน (ลำดับไฟล์ไม่มีผล)
 *
 *  Script Properties (Project Settings → Script properties):
 *    ANTHROPIC_API_KEY  (จำเป็นสำหรับผู้ช่วย AI)   คีย์ Claude API — ห้ามใส่ในโค้ด/GitHub
 *    AI_MODEL           (ไม่บังคับ)               ค่าเริ่มต้น claude-opus-5
 *    SPREADSHEET_ID     (ไม่บังคับ)               override ฐานข้อมูลใน CFG.SPREADSHEET_ID
 *    SHEET_DATA         (ไม่บังคับ)               ชื่อแท็บข้อมูลค่าเช่า ถ้าไม่ระบุใช้ Contract_Master
 *    NOTICE_EMAILS      (ไม่บังคับ)               ผู้รับอีเมลแจ้งเตือนดิวจ่าย (คั่นด้วย ,)
 *    SITE_URL           (ไม่บังคับ)               ลิงก์หน้าเว็บในอีเมล เช่น https://billboard-rental.vercel.app/
 * ============================================================
 */

const CFG = {
  // ฐานข้อมูล: https://docs.google.com/spreadsheets/d/1u79bT7EnBxU8kYmcc14NUi6ZRAc2UDOdSvWNqd2uwlU
  // เปลี่ยนฐานข้อมูลได้โดยตั้ง Script Property SPREADSHEET_ID (ไม่ต้องแก้โค้ด)
  SPREADSHEET_ID: '1u79bT7EnBxU8kYmcc14NUi6ZRAc2UDOdSvWNqd2uwlU',
  SHEET_DATA:     'Contract_Master',   // ถ้าไม่พบ จะหาแท็บที่มีหัวคอลัมน์ 'Contract No.' ให้เอง
  SHEET_PAYMENT:  'Payment_History',
  SHEET_RECEIPT:  'Receipt_Tracking',
  SHEET_LOCATION: 'New_Location',
  SHEET_USERS:    'Users',
  SHEET_LOG:      'Log',
  HEADER_SCAN:    5,                   // สแกนหาแถว header ภายใน 5 แถวแรก
  TOKEN_TTL_MS:   8 * 60 * 60 * 1000,  // อายุ session 8 ชม.
  DUE_SOON_DAYS:  30,                  // "ครบกำหนดจ่าย" แสดงรายการภายในกี่วัน
  EXPIRE_DAYS:    90,                  // เกณฑ์เตือนสัญญาใกล้หมดอายุ (วัน)
  CACHE_SEC:      300,                 // อายุ cache ข้อมูลค่าเช่า
  CACHE_KEY:      'rentals_v1',
  TZ:             'Asia/Bangkok',
  VERSION:        '1.0.0',

  // ผู้ดูแลระบบคนแรก — setupSystem() สร้างบัญชีนี้ให้ (เปลี่ยนรหัสผ่านทันทีหลังเข้าสู่ระบบครั้งแรก)
  ADMIN_USER:     'admin-rental',
  ADMIN_PASSWORD: 'P@ssword',
  ADMIN_NAME:     'Administrator',
  // อีเมลผู้ดูแล (ใช้เป็นผู้รับอีเมลแจ้งเตือนเริ่มต้น)
  ADMIN_EMAIL:    'pitinan.yo@planbmedia.co.th',

  // ---- ผู้ช่วย AI ----
  AI_MODEL:        'claude-opus-5',
  AI_EFFORT:       'medium',          // low | medium | high — ถ้าคำตอบช้าจน timeout ให้ลดเป็น low
  AI_MAX_TOKENS:   16000,
  AI_MAX_QUESTION: 2000,              // ความยาวคำถามสูงสุด (ตัวอักษร)
  AI_MAX_HISTORY:  10                 // จำนวนข้อความย้อนหลังที่ส่งให้ AI
};

/** ตัวเลือก "Status Payment" (dropdown ทั้งบนเว็บและในชีต — ต้องตรงกับ frontend/js/config.js) */
const PAY_STATUSES = ['เบิกแล้ว', 'รอเบิก'];
const PAY_DONE = 'เบิกแล้ว';

/** สถานะใบเสร็จ (วนตามลำดับเมื่อกดเปลี่ยนสถานะ) — ค่าเดียวกับโค้ด Billboard ERP เดิม */
const RECEIPT_STATUSES = ['⏳ รอใบเสร็จ', '✅ ได้รับใบเสร็จแล้ว', '🏛️ การเงินรับ (จบกระบวนการ)'];

/** หัวคอลัมน์ของชีตที่ระบบสร้างให้ถ้ายังไม่มี */
const PAYMENT_HEADER  = ['Timestamp', 'Vendor Name', 'Media Site', 'รอบดิว', 'ยอดที่ต้องจ่าย', 'ยอดที่จ่ายจริง', 'หมายเหตุ'];
const RECEIPT_HEADER  = ['Timestamp', 'Vendor Name', 'Media Site', 'ยอดเงิน', 'สถานะใบเสร็จ'];
const LOCATION_HEADER = ['Timestamp', 'Company', 'Vendor Name', 'Media Type', 'Media Site', 'Part Description', 'ค่าเช่าประเมิน', 'สถานะ'];

/**
 * ประเภทสื่อที่แสดงบน Dashboard เสมอ (แม้จำนวนเป็น 0)
 * ประเภทใหม่ที่เจอในข้อมูลจะถูกเพิ่มต่อท้ายอัตโนมัติ
 */
const MEDIA_TYPES = [
  'Building Wrap', 'Bus Wrap', 'Cookies', 'Flyover 2.0', 'Gateway Billboard',
  'Lightbox Paragon', 'Metro Poster', 'Other Media', 'Pole Wrap',
  'Serie Poster', 'Uni Pole', 'Uni Pole Nationwide'
];

/**
 * แผนผังคอลัมน์ Contract_Master: [field, [ชื่อหัวคอลัมน์ที่รองรับ]]
 * อ่านตาม "ชื่อหัวคอลัมน์" ไม่ใช่ตำแหน่ง — แทรก/สลับคอลัมน์ในชีตได้โดยไม่ต้องแก้โค้ด
 * การเทียบชื่อไม่สนตัวพิมพ์เล็ก-ใหญ่และช่องว่าง (เช่น "Start  Contract" = "Start Contract")
 */
const COLUMNS = [
  ['no',           ['ลำดับ', 'No']],
  ['rentalYear',   ['Rental Year']],
  ['payment',      ['Payment']],                      // รายเดือน / รายปี / ราย 3 เดือน
  ['company',      ['Company', 'บริษัท']],
  ['mediaType',    ['Media Type']],
  ['mediaSite',    ['Media Site']],
  ['epicoreCode',  ['Epicore Code']],
  ['vendorNo',     ['Vendor No.', 'Vendor No']],
  ['vendorName',   ['Vendor name', 'Vendor Name']],
  ['partDesc',     ['Part Description']],
  ['partCode',     ['Part Code']],
  ['contractNo',   ['Contract No.', 'Contract No', 'เลขที่สัญญา']],
  ['startDate',    ['Start Contract']],
  ['endDate',      ['End Contract']],
  ['period',       ['Period']],
  ['contractStatus', ['Status Contract']],
  ['rent',         ['Rent']],                         // External / Inter-Co
  ['paymentTerm',  ['Payment term']],
  ['amountMonth',  ['Amount/Month']],
  ['amountYear',   ['Amount/Year']],
  ['adjust',       ['Up or CN [Amount]', 'Up or CN']],
  ['month',        ['Month']],
  ['dueDate',      ['ว/ด/ป ชำระตามสัญญา']],
  ['periodStart',  ['รอบการจ่าย (เริ่มต้น)']],
  ['periodEnd',    ['รอบการจ่าย (สิ้นสุด)']],
  ['payStatus',    ['Status Payment']],
  ['docType',      ['รูปแบบ']],                       // Memo / Invoice
  ['sentDate',     ['วันที่ส่งจัดซื้อ']],
  ['pr',           ['PR']],
  ['po',           ['PO']],
  ['memoInv',      ['MEMO/INV No.']],
  ['docPeriod',    ['รอบจ่ายตามเอกสาร']],
  ['chequeDate',   ['เช็คลงวันที่']],
  ['ecmSent',      ['Send ECM']],
  ['ecmNo',        ['ECM No.']],
  ['remark',       ['Remark']]
];

/** field ที่ต้องมีในชีต ไม่งั้นถือว่าโครงสร้างผิด */
const REQUIRED_FIELDS = ['contractNo', 'mediaSite', 'vendorName', 'payStatus'];

/**
 * คอลัมน์วันที่ + ระบบปีที่ใช้ในชีต (ใช้ตอนเขียนกลับ ให้ตรงกับสไตล์เดิมของแต่ละคอลัมน์)
 *   BE = พ.ศ. (สัญญา 16/4/2563)   CE = ค.ศ. (รอบจ่าย 3/2/2026)
 */
const DATE_FIELDS = {
  startDate: 'BE', endDate: 'BE',
  dueDate: 'CE', periodStart: 'CE', periodEnd: 'CE',
  sentDate: 'CE', chequeDate: 'CE', ecmSent: 'CE'
};
const NUMBER_FIELDS = ['amountMonth', 'amountYear', 'adjust'];

/** แก้คำสะกดผิดที่พบในไฟล์ต้นทาง — ใช้ทั้งตอนอ่าน และ applyDataFixes() เขียนกลับลงชีต */
const VALUE_FIX = {
  vendorName: { 'บริษั มีเดีย เอเชีย จำกัด': 'บริษัท มีเดีย เอเชีย จำกัด' },
  partDesc:   { 'ค่าสิทธิการใช้โครงสร้างป้ายโฆษณา : Uni Ploe ทางด่วนมักกะสัน A, B, C, D':
                'ค่าสิทธิการใช้โครงสร้างป้ายโฆษณา : Uni Pole ทางด่วนมักกะสัน A, B, C, D' }
};

/** อ่าน Script Property (คืน fallback ถ้าไม่ได้ตั้งค่า) */
function prop_(key, fallback) {
  const v = PropertiesService.getScriptProperties().getProperty(key);
  return v ? v : fallback;
}
