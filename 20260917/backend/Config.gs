/**
 * ============================================================
 *  PLAN B — CONTRACT RENTAL HUB  |  Backend (Google Apps Script)
 *  Config.gs — ค่าตั้งระบบ + แผนผังคอลัมน์ของชีตสัญญา
 * ============================================================
 *  สถาปัตยกรรม:
 *    frontend/ (Netlify)       ──POST JSON──►  backend/ (Web App นี้)  ──►  Google Sheets
 *                              ◄──JSON──────                           ──►  Claude API (ผู้ช่วย AI)
 *
 *  ไฟล์ .gs ทุกไฟล์ในโฟลเดอร์ backend/ ใช้ global scope ร่วมกัน (ลำดับไฟล์ไม่มีผล)
 *
 *  Script Properties (Project Settings → Script properties):
 *    ANTHROPIC_API_KEY  (จำเป็นสำหรับผู้ช่วย AI)   คีย์ Claude API — ห้ามใส่ในโค้ด/GitHub
 *    AI_MODEL           (ไม่บังคับ)               ค่าเริ่มต้น claude-opus-5
 *    SPREADSHEET_ID     (ไม่บังคับ)               override ฐานข้อมูลใน CFG.SPREADSHEET_ID
 *    SHEET_DATA         (ไม่บังคับ)               ชื่อแท็บข้อมูลสัญญา ถ้าไม่ระบุจะค้นหาอัตโนมัติ
 * ============================================================
 */

const CFG = {
  // ฐานข้อมูล: https://docs.google.com/spreadsheets/d/11VOe1_OWevonHJc73rKVeDIYJKzzieWxuaXrjvwPDUU
  // เปลี่ยนฐานข้อมูลได้โดยตั้ง Script Property SPREADSHEET_ID (ไม่ต้องแก้โค้ด)
  SPREADSHEET_ID: '11VOe1_OWevonHJc73rKVeDIYJKzzieWxuaXrjvwPDUU',
  SHEET_DATA:    'ข้อมูล Data รวม',   // ถ้าไม่พบ จะหาแท็บที่มีหัวคอลัมน์ 'Contract No.' ให้เอง
  SHEET_USERS:   'Users',
  SHEET_LOG:     'Log',
  HEADER_SCAN:   5,                   // สแกนหาแถว header ภายใน 5 แถวแรก
  TOKEN_TTL_MS:  8 * 60 * 60 * 1000,  // อายุ session 8 ชม.
  ALERT_DAYS:    90,                  // เกณฑ์เตือนสัญญาใกล้หมดอายุ (วัน)
  ACTION_DAYS:   180,                 // รายการต้องดำเนินการ (วัน)
  NOTICE_MONTHS: 24,                  // ตารางหนังสือแจ้งเตือน: ม.ค. ปีนี้ → 24 เดือน
  CACHE_SEC:     300,                 // อายุ cache ข้อมูลสัญญา
  CACHE_KEY:     'contracts_v2',
  TZ:            'Asia/Bangkok',
  VERSION:       '2.3.0',

  // ---- ผู้ช่วย AI ----
  AI_MODEL:        'claude-opus-5',
  AI_EFFORT:       'medium',          // low | medium | high — ถ้าคำตอบช้าจน timeout ให้ลดเป็น low
  AI_MAX_TOKENS:   16000,
  AI_MAX_QUESTION: 2000,              // ความยาวคำถามสูงสุด (ตัวอักษร)
  AI_MAX_HISTORY:  10                 // จำนวนข้อความย้อนหลังที่ส่งให้ AI
};

/**
 * ประเภทสื่อทั้งหมดตามสเปก Dashboard (ชีต "1. Dash Board สรุปสัญญาทั้งหมด")
 * แสดงครบทุกประเภทแม้จำนวนเป็น 0 — ประเภทใหม่ที่เจอในข้อมูลจะถูกเพิ่มต่อท้ายอัตโนมัติ
 */
const MEDIA_TYPES = [
  'Building Wrap', 'Bus Wrap', 'Cookies', 'Flyover 2.0', 'Gateway Billboard',
  'Lightbox Paragon', 'Metro Poster', 'Other Media', 'Pole Wrap',
  'Serie Poster', 'Unipole Billboard', 'Unipole NTW Billboard'
];

/**
 * แผนผังคอลัมน์: [field, [ชื่อหัวคอลัมน์ที่รองรับ]]
 * อ่านตาม "ชื่อหัวคอลัมน์" ไม่ใช่ตำแหน่ง — แทรก/สลับคอลัมน์ในชีตได้โดยไม่ต้องแก้โค้ด
 * การเทียบชื่อไม่สนตัวพิมพ์เล็ก-ใหญ่และช่องว่าง
 */
const COLUMNS = [
  ['no',              ['No', 'ลำดับ']],
  ['company',         ['Company', 'บริษัท']],
  ['mediaType',       ['Media Type']],
  ['code',            ['Code', 'Code ป้าย']],
  ['siteCode',        ['Asset Code', 'Site Code']],       // หัวคอลัมน์ E ในไฟล์ต้นทางเป็นค่า data → ดู SITE_CODE_FALLBACK
  ['mediaSite',       ['Media Site']],
  ['province',        ['Province', 'จังหวัด']],
  ['contractNo',      ['Contract No.', 'Contract No', 'เลขที่สัญญา']],
  ['businessModel',   ['Type of Business Model', 'Business Model']],
  ['counterparty',    ['คู่สัญญา']],
  ['status',          ['Contract Status', 'สถานะสัญญา']],
  ['costType',        ['Cost Type']],
  ['startDate',       ['เริ่มต้นสัญญา', 'วันเริ่มต้นสัญญา']],
  ['endDate',         ['สิ้นสุดสัญญา', 'วันสิ้นสุดสัญญา']],
  ['duration',        ['ระยะสัญญา']],
  ['collateralType',  ['ประเภทหลักประกันสัญญา']],
  ['collateralValue', ['มูลค่าหลักประกัน']],
  ['ownerAsset',      ['Owner Asset']],
  ['opex',            ['Opex']],
  ['capex',           ['Capex']],
  ['electricity',     ['ค่าไฟฟ้า']],
  ['tax1',            ['ค่าภาษีประเภท 1']],
  ['tax2',            ['ค่าภาษีประเภท 2']],
  ['tax3',            ['ค่าภาษีประเภท 3']],
  ['maintenance',     ['ค่าซ่อมบำรุง', 'ค่าซ่อมแซมบำรุงรักษา']],
  ['insurance',       ['ค่าประกันภัย']],
  ['paymentTerm',     ['เงื่อนไขการชำระค่าเช่า', 'เงื่อนไขการชำระ']],
  ['paymentDue',      ['กำหนดชำระ']],
  ['revShareCompany', ['%Rev Share (บริษัท)']],
  ['revShareOwner',   ['%Rev Share (เจ้าของสื่อ)']],
  ['renewCondition',  ['เงื่อนไขการต่อสัญญา']],
  ['noticeDate',      ['วันที่ต้องทำหนังสือแจ้งเตือน']],
  ['endCondition',    ['เงื่อนไขสิ้นสุดสัญญา']],
  ['removalPeriod',   ['ระยะเวลารื้อถอน']],
  ['accessCondition', ['เงื่อนไขการเข้าพื้นที่']],
  ['renewStatus',     ['สถานะการต่อสัญญา']],
  ['docStatus',       ['สถานะเอกสาร']]
];

/** ถ้าหา siteCode จากชื่อหัวคอลัมน์ไม่เจอ ให้ใช้คอลัมน์ถัดจาก 'code' */
const SITE_CODE_FALLBACK = { after: 'code' };

/** field ที่ต้องมีในชีต ไม่งั้นถือว่าโครงสร้างผิด */
const REQUIRED_FIELDS = ['contractNo', 'mediaType', 'status', 'startDate', 'endDate'];

/** แก้คำสะกดผิดที่พบในไฟล์ต้นทาง ก่อนนำไปจัดกลุ่ม/กรอง */
const VALUE_FIX = {
  province: { 'กรุุงเทพมหานคร': 'กรุงเทพมหานคร' }
};

/** ตารางความรับผิดชอบค่าใช้จ่าย (หน้ารายละเอียดสัญญา) */
const RESP_FIELDS = [
  ['ownerAsset',  'Owner Asset'],
  ['opex',        'Opex'],
  ['capex',       'Capex'],
  ['electricity', 'ค่าไฟฟ้า'],
  ['tax1',        'ค่าภาษีประเภท 1'],
  ['tax2',        'ค่าภาษีประเภท 2'],
  ['tax3',        'ค่าภาษีประเภท 3'],
  ['maintenance', 'ค่าซ่อมแซมบำรุงรักษา'],
  ['insurance',   'ค่าประกันภัย']
];

/** อ่าน Script Property (คืน fallback ถ้าไม่ได้ตั้งค่า) */
function prop_(key, fallback) {
  const v = PropertiesService.getScriptProperties().getProperty(key);
  return v ? v : fallback;
}
