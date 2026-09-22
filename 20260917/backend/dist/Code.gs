// ==================== Config.gs ====================
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

// ==================== Main.gs ====================
/**
 * Main.gs — HTTP entry points + router
 * เพิ่ม action ใหม่: เขียนฟังก์ชัน apiXxx_() แล้วเพิ่ม case ใน route_() ที่เดียว
 */

/** ตอบกลับเป็น JSON */
function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** ตอบกลับเป็น JSONP (fallback กรณี CORS มีปัญหา) */
function jsonp_(callback, obj) {
  if (!/^[A-Za-z_$][\w$]*$/.test(callback)) return json_({ ok: false, code: 'BAD_REQUEST' });
  return ContentService
    .createTextOutput(callback + '(' + JSON.stringify(obj) + ');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

/**
 * GET — health check + JSONP fallback
 * ตัวอย่าง: {WEBAPP_URL}?action=ping
 */
function doGet(e) {
  const p = (e && e.parameter) || {};
  const result = route_(p.action || 'ping', p);
  return p.callback ? jsonp_(p.callback, result) : json_(result);
}

/**
 * POST — ช่องทางหลัก
 * body: text/plain (เลี่ยง CORS preflight) เนื้อหาเป็น JSON
 *       { "action": "login", "email": "...", "password": "..." }
 */
function doPost(e) {
  let payload = {};
  try {
    payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, code: 'BAD_REQUEST', message: 'รูปแบบข้อมูลไม่ถูกต้อง' });
  }
  return json_(route_(payload.action, payload));
}

/** Router กลาง */
function route_(action, p) {
  try {
    switch (action) {
      case 'ping':          return { ok: true, service: 'Contract Rental Hub API', version: CFG.VERSION };
      case 'login':         return apiLogin_(p.email, p.password);
      case 'logout':        return apiLogout_(p.token);
      case 'checkSession':  return apiCheckSession_(p.token);
      case 'getDashboard':  return apiDashboard_(p.token);
      case 'getVersion':    return apiVersion_(p.token);
      case 'getContract':   return apiContract_(p.token, p.id);
      case 'getActionList': return apiActionList_(p.token);
      case 'exportCSV':     return apiExportCSV_(p.token);
      case 'clearCache':    return apiClearCache_(p.token);
      case 'addMember':     return apiAddMember_(p.token, p);
      case 'askAI':         return apiAskAI_(p.token, p);
      case 'getNoticeSettings': return apiNoticeSettings_(p.token);
      case 'sendNoticeNow':     return apiSendNoticeNow_(p.token, p);
      case 'updateNoticeStatus': return apiUpdateNoticeStatus_(p.token, p);
      case 'updateContract':     return apiUpdateContract_(p.token, p);
      default:
        return { ok: false, code: 'UNKNOWN_ACTION', message: 'ไม่รู้จักคำสั่ง: ' + action };
    }
  } catch (err) {
    if (err.message === 'SESSION_EXPIRED') {
      return { ok: false, code: 'SESSION_EXPIRED', message: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่' };
    }
    return { ok: false, code: 'SERVER_ERROR', message: err.message };
  }
}

// ==================== Auth.gs ====================
/**
 * Auth.gs — login / session / log
 * รหัสผ่านเก็บเป็น SHA-256 + salt ในชีต Users · session เก็บใน CacheService (อายุ CFG.TOKEN_TTL_MS)
 */

/** สเปรดชีตฐานข้อมูล: Script Property SPREADSHEET_ID > CFG.SPREADSHEET_ID > ชีตที่ผูก script นี้ */
function ss_() {
  const id = prop_('SPREADSHEET_ID', CFG.SPREADSHEET_ID);
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

function getSheet_(name) {
  const ss = ss_();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function hashPassword_(plain, salt) {
  const raw = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(salt) + '::' + String(plain),
    Utilities.Charset.UTF_8
  );
  return raw.map(function (b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
}

function apiLogin_(email, password) {
  email = String(email || '').trim().toLowerCase();
  if (!email || !password) {
    return { ok: false, code: 'MISSING_FIELD', message: 'กรุณากรอกอีเมลและรหัสผ่าน' };
  }
  const rows = getSheet_(CFG.SHEET_USERS).getDataRange().getValues();
  // header: Email | Salt | PasswordHash | Name | Role | Active | Position | Phone | Department | PhotoUrl
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (String(r[0]).trim().toLowerCase() !== email) continue;

    if (r[5] !== true && String(r[5]).toLowerCase() !== 'true') {
      return { ok: false, code: 'DISABLED', message: 'บัญชีนี้ถูกปิดการใช้งาน' };
    }
    if (hashPassword_(password, r[1]) !== String(r[2])) {
      writeLog_(email, 'LOGIN', 'fail:wrong-password');
      return { ok: false, code: 'INVALID_CREDENTIAL', message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' };
    }

    const token = Utilities.getUuid();
    const profile = { email: r[0], name: r[3] || r[0], role: r[4] || 'viewer' };
    CacheService.getScriptCache().put(
      'tk_' + token, JSON.stringify(profile), Math.floor(CFG.TOKEN_TTL_MS / 1000)
    );
    writeLog_(profile.email, 'LOGIN', 'success');
    return { ok: true, token: token, profile: profile, expiresIn: CFG.TOKEN_TTL_MS };
  }
  writeLog_(email, 'LOGIN', 'fail:no-user');
  return { ok: false, code: 'INVALID_CREDENTIAL', message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' };
}

function apiLogout_(token) {
  CacheService.getScriptCache().remove('tk_' + token);
  return { ok: true };
}

/** ตรวจ token — โยน error ถ้าไม่ผ่าน (ทุก API ที่ต้อง auth เรียกตัวนี้ก่อน) */
function auth_(token) {
  const raw = CacheService.getScriptCache().get('tk_' + token);
  if (!raw) throw new Error('SESSION_EXPIRED');
  return JSON.parse(raw);
}

function apiCheckSession_(token) {
  try { return { ok: true, profile: auth_(token) }; }
  catch (e) { return { ok: false, code: 'SESSION_EXPIRED' }; }
}

function writeLog_(email, action, detail) {
  try {
    const sh = getSheet_(CFG.SHEET_LOG);
    if (sh.getLastRow() === 0) sh.appendRow(['Timestamp', 'Email', 'Action', 'Detail']);
    sh.appendRow([new Date(), email, action, detail]);
  } catch (e) { /* ไม่ให้ log ล้มพังทั้ง request */ }
}

// ==================== Data.gs ====================
/**
 * Data.gs — อ่านชีตสัญญา + คำนวณ field ที่ derive ได้
 *
 * derive fields:
 *   daysToExpire    วันคงเหลือถึงวันสิ้นสุดสัญญา
 *   noticeDays      จำนวนวันที่ต้องแจ้งล่วงหน้า (จากคอลัมน์ 'เงื่อนไขการต่อสัญญา' เช่น 90 หรือ 'แจ้งล่วงหน้า 90 วัน')
 *   noticeDeadline  วันที่ต้องทำหนังสือแจ้งเตือน — ใช้ค่าจากชีตก่อน ถ้าว่างคำนวณ = endDate − noticeDays
 *   daysToNotice    วันคงเหลือถึง noticeDeadline
 *   alert           critical | expired | warning | normal | closed | unknown
 */

/* ---------- แปลงค่า ---------- */

/** Date object หรือ string 'd/m/yyyy' -> ISO 'yyyy-MM-dd' */
function toISODate_(v) {
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return isNaN(v) ? '' : Utilities.formatDate(v, CFG.TZ, 'yyyy-MM-dd');
  }
  const m = String(v).trim().match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (!m) return '';
  let d = +m[1], mo = +m[2], y = +m[3];
  if (y < 100) y += 2000;
  if (y > 2400) y -= 543;                    // เผื่อกรอกเป็น พ.ศ.
  return Utilities.formatDate(new Date(y, mo - 1, d), CFG.TZ, 'yyyy-MM-dd');
}

function toNumber_(v) {
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : n;
}

/** เปอร์เซ็นต์ -> สัดส่วน 0..1  (เซลล์ format % ให้ค่า 0.4 · ข้อความ '40%' ให้ 40) */
function toRatio_(v) {
  if (typeof v === 'number') return v > 1 ? v / 100 : v;
  const s = String(v == null ? '' : v);
  const n = toNumber_(s);
  return (s.indexOf('%') > -1 || n > 1) ? n / 100 : n;
}

function clean_(v) {
  const s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  return (s === '-' || s === '–' || s === 'N/A') ? '' : s;
}

/** จำนวนวันแจ้งล่วงหน้า: 90 -> 90 · 'แจ้งล่วงหน้า 90 วัน' -> 90 */
function extractDays_(v) {
  if (typeof v === 'number') return v;
  const s = String(v || '').trim();
  if (/^\d+$/.test(s)) return +s;
  const m = s.match(/(\d+)\s*วัน/);
  return m ? +m[1] : 0;
}

function daysBetween_(isoA, isoB) {
  if (!isoA || !isoB) return null;
  return Math.round((new Date(isoB) - new Date(isoA)) / 86400000);
}

function addDays_(iso, days) {
  if (!iso) return '';
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return Utilities.formatDate(d, CFG.TZ, 'yyyy-MM-dd');
}

function todayISO_() {
  return Utilities.formatDate(new Date(), CFG.TZ, 'yyyy-MM-dd');
}

/* ---------- หาแท็บ + แถว header ---------- */

function normHeader_(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/\s+/g, '');
}

/** แปลงแถว header เป็น { field: columnIndex } */
function buildColumnMap_(headerCells) {
  const cells = headerCells.map(normHeader_);
  const map = {};
  const used = {};
  COLUMNS.forEach(function (c) {
    const aliases = c[1].map(normHeader_);
    for (let i = 0; i < cells.length; i++) {
      if (!used[i] && aliases.indexOf(cells[i]) > -1) { map[c[0]] = i; used[i] = true; return; }
    }
  });
  if (map.siteCode === undefined && map[SITE_CODE_FALLBACK.after] !== undefined) {
    const i = map[SITE_CODE_FALLBACK.after] + 1;
    if (!used[i]) map.siteCode = i;
  }
  return map;
}

/** คืน { sheet, headerRow, map } ของแท็บข้อมูลสัญญา */
/** ชื่อแท็บข้อมูลสัญญาที่ลองก่อน (ตามลำดับ) — ถ้าไม่พบ จะค้นทุกแท็บหาหัวคอลัมน์ 'Contract No.' */
const DATA_SHEET_NAMES = ['TEST- Contract Rental 2026 (PB)'];

function findDataSheet_() {
  const ss = ss_();
  const names = [prop_('SHEET_DATA', '')].concat(DATA_SHEET_NAMES, [CFG.SHEET_DATA]).filter(String);
  let named = null;
  for (let i = 0; i < names.length && !named; i++) named = ss.getSheetByName(names[i]);
  const sheets = named ? [named] : ss.getSheets();

  for (let s = 0; s < sheets.length; s++) {
    const sh = sheets[s];
    const lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
    if (!lastRow || !lastCol) continue;
    const top = sh.getRange(1, 1, Math.min(CFG.HEADER_SCAN, lastRow), lastCol).getDisplayValues();
    for (let r = 0; r < top.length; r++) {
      const map = buildColumnMap_(top[r]);
      if (map.contractNo === undefined) continue;
      const missing = REQUIRED_FIELDS.filter(function (f) { return map[f] === undefined; });
      if (missing.length) {
        throw new Error('แท็บ "' + sh.getName() + '" ไม่มีคอลัมน์: ' + missing.join(', '));
      }
      return { sheet: sh, headerRow: r + 1, map: map };
    }
  }
  throw new Error('ไม่พบแท็บข้อมูลสัญญา (ต้องมีหัวคอลัมน์ "Contract No.")');
}

/* ---------- ซิงค์: ลายนิ้วมือของข้อมูลในชีต ---------- */

const SYNC = {
  FP_KEY:  'data_fp',
  FP_SEC:  15            // แก้ในชีตแล้ว หน้าเว็บเห็นภายใน ~15 วินาที + รอบ polling ของหน้าเว็บ
};

/**
 * ค่า hash ของทุกเซลล์ในแท็บข้อมูลสัญญา — เปลี่ยนเมื่อมีใครแก้ชีต (ในชีตเอง หรือผ่านหน้าเว็บ)
 * หน้าเว็บเรียก getVersion เป็นระยะ ถ้าค่าเปลี่ยนจะโหลดข้อมูลใหม่อัตโนมัติ
 */
function dataFingerprint_(src) {
  const cache = CacheService.getScriptCache();
  const hit = cache.get(SYNC.FP_KEY);
  if (hit) return hit;
  src = src || findDataSheet_();
  const raw = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_1,
    JSON.stringify(src.sheet.getDataRange().getDisplayValues()),
    Utilities.Charset.UTF_8
  );
  const fp = raw.slice(0, 8).map(function (b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
  cache.put(SYNC.FP_KEY, fp, SYNC.FP_SEC);
  return fp;
}

/** เรียกหลังเขียนชีต เพื่อให้ทุกหน้าเว็บเห็นการเปลี่ยนแปลงทันทีในรอบถัดไป */
function invalidateData_() {
  CacheService.getScriptCache().removeAll([SYNC.FP_KEY, CFG.CACHE_KEY, CFG.CACHE_KEY + '_fp']);
}

function apiVersion_(token) {
  auth_(token);
  return { ok: true, version: dataFingerprint_() };
}

/* ---------- อ่านสัญญาทั้งหมด (cache ใช้ได้ตราบที่ข้อมูลในชีตไม่เปลี่ยน) ---------- */

function readContracts_() {
  const cache = CacheService.getScriptCache();
  const src = findDataSheet_();
  const fp = dataFingerprint_(src);
  const hit = cache.get(CFG.CACHE_KEY);
  if (hit && cache.get(CFG.CACHE_KEY + '_fp') === fp) return JSON.parse(hit);

  const sh = src.sheet, map = src.map;
  const lastRow = sh.getLastRow();
  if (lastRow <= src.headerRow) return [];

  const values = sh.getRange(src.headerRow + 1, 1, lastRow - src.headerRow, sh.getLastColumn()).getValues();
  const today = todayISO_();
  const out = [];

  values.forEach(function (row, idx) {
    const get = function (f) { return map[f] === undefined ? '' : row[map[f]]; };
    if (!clean_(get('contractNo')) && !clean_(get('company')) && !clean_(get('mediaSite'))) return;

    const o = { _row: src.headerRow + 1 + idx };
    COLUMNS.forEach(function (c) { o[c[0]] = clean_(get(c[0])); });
    Object.keys(VALUE_FIX).forEach(function (f) {
      if (VALUE_FIX[f][o[f]]) o[f] = VALUE_FIX[f][o[f]];
    });

    o.id              = 'C' + o._row;
    o.startDate       = toISODate_(get('startDate'));
    o.endDate         = toISODate_(get('endDate'));
    o.noticeDate      = toISODate_(get('noticeDate'));
    o.collateralValue = toNumber_(get('collateralValue'));
    o.revShareCompany = toRatio_(get('revShareCompany'));
    o.revShareOwner   = toRatio_(get('revShareOwner'));

    // --- นับถอยหลัง + วันที่ต้องทำหนังสือแจ้งเตือน ---
    o.daysToExpire   = daysBetween_(today, o.endDate);
    o.noticeDays     = extractDays_(get('renewCondition'));
    o.noticeDeadline = o.noticeDate ||
                       ((o.endDate && o.noticeDays) ? addDays_(o.endDate, -o.noticeDays) : '');
    o.noticeSource   = o.noticeDate ? 'sheet' : (o.noticeDeadline ? 'calc' : '');
    o.daysToNotice   = o.noticeDeadline ? daysBetween_(today, o.noticeDeadline) : null;

    // --- ระดับความเร่งด่วน ---
    if (o.status === 'Write Off')                             o.alert = 'closed';
    else if (o.daysToExpire === null)                         o.alert = 'unknown';
    else if (o.daysToExpire < 0)                              o.alert = 'expired';
    else if (o.daysToNotice !== null && o.daysToNotice <= 0)  o.alert = 'critical';
    else if (o.daysToExpire <= CFG.ALERT_DAYS)                o.alert = 'warning';
    else                                                      o.alert = 'normal';

    out.push(o);
  });

  try {
    cache.put(CFG.CACHE_KEY, JSON.stringify(out), CFG.CACHE_SEC);
    cache.put(CFG.CACHE_KEY + '_fp', fp, CFG.CACHE_SEC);
  } catch (e) { /* ข้อมูลเกิน 100KB — ข้าม cache อ่านชีตตรง */ }
  return out;
}

// ==================== Api.gs ====================
/**
 * Api.gs — API handlers ของ Dashboard / ทะเบียนสัญญา / Export
 */

function apiDashboard_(token) {
  auth_(token);
  const data = readContracts_();
  const today = todayISO_();
  const now = new Date();

  const countBy = function (key) {
    const m = {};
    data.forEach(function (d) {
      const k = d[key] || 'ไม่ระบุ';
      m[k] = (m[k] || 0) + 1;
    });
    return Object.keys(m)
      .map(function (k) { return { label: k, value: m[k] }; })
      .sort(function (a, b) { return b.value - a.value; });
  };

  // ไทม์ไลน์หมดอายุ 12 เดือนข้างหน้า
  const timeline = {};
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    timeline[Utilities.formatDate(d, CFG.TZ, 'yyyy-MM')] = 0;
  }
  data.forEach(function (d) {
    if (!d.endDate) return;
    const k = d.endDate.slice(0, 7);
    if (k in timeline) timeline[k]++;
  });

  // สเปก Dashboard ข้อ 1: สัญญาที่จะหมดใน 12 เดือนข้างหน้า แยกตามประเภทสื่อ
  const in12m = Utilities.formatDate(new Date(now.getFullYear() + 1, now.getMonth(), now.getDate()), CFG.TZ, 'yyyy-MM-dd');
  const expiring12m = data.filter(function (d) {
    return d.status !== 'Write Off' && d.endDate && d.endDate >= today && d.endDate <= in12m;
  });
  const mediaTypes = MEDIA_TYPES.slice();
  data.forEach(function (d) {
    if (d.mediaType && mediaTypes.indexOf(d.mediaType) < 0) mediaTypes.push(d.mediaType);
  });
  const expiringByMedia = mediaTypes.map(function (t) {
    return { label: t, value: expiring12m.filter(function (d) { return d.mediaType === t; }).length };
  });

  const kpi = {
    total:       data.length,
    active:      data.filter(function (d) { return d.status === 'Active'; }).length,
    isNew:       data.filter(function (d) { return d.status === 'New'; }).length,
    writeOff:    data.filter(function (d) { return d.status === 'Write Off'; }).length,
    changeLED:   data.filter(function (d) { return d.status === 'Change to LED'; }).length,
    expiring:    data.filter(function (d) { return d.alert === 'warning' || d.alert === 'critical'; }).length,
    expired:     data.filter(function (d) { return d.alert === 'expired'; }).length,
    expiring12m: expiring12m.length,
    collateral:  data.reduce(function (s, d) { return s + d.collateralValue; }, 0)
  };

  const uniq = function (key) {
    const set = {};
    data.forEach(function (d) { if (d[key]) set[d[key]] = 1; });
    return Object.keys(set).sort();
  };

  return {
    ok: true,
    kpi: kpi,
    charts: {
      byStatus:        countBy('status'),
      byMediaType:     countBy('mediaType').slice(0, 10),
      byCompany:       countBy('company'),
      byProvince:      countBy('province').slice(0, 8),
      timeline:        Object.keys(timeline).map(function (k) { return { label: k, value: timeline[k] }; }),
      expiringByMedia: expiringByMedia
    },
    noticeSchedule: noticeSchedule_(data),
    filters: {
      company:   uniq('company'),
      mediaType: uniq('mediaType'),
      status:    uniq('status'),
      province:  uniq('province')
    },
    contracts: data,
    version: dataFingerprint_(),
    alertDays: CFG.ALERT_DAYS,
    actionDays: CFG.ACTION_DAYS,
    updatedAt: Utilities.formatDate(new Date(), CFG.TZ, 'dd/MM/yyyy HH:mm')
  };
}

/**
 * สเปก Dashboard ข้อ 2: วันที่ต้องทำหนังสือแจ้งเตือน รายเดือน
 * ตั้งแต่ ม.ค. ของปีปัจจุบัน ไป CFG.NOTICE_MONTHS เดือน (ไม่รวมสัญญา Write Off)
 */
function noticeSchedule_(data) {
  const y = new Date().getFullYear();
  const months = [];
  const byKey = {};
  for (let i = 0; i < CFG.NOTICE_MONTHS; i++) {
    const key = Utilities.formatDate(new Date(y, i, 1), CFG.TZ, 'yyyy-MM');
    byKey[key] = { month: key, count: 0, contracts: [] };
    months.push(byKey[key]);
  }
  data.forEach(function (d) {
    if (d.status === 'Write Off' || !d.noticeDeadline) return;
    const m = byKey[d.noticeDeadline.slice(0, 7)];
    if (!m) return;
    m.count++;
    m.contracts.push({
      id: d.id, contractNo: d.contractNo, mediaSite: d.mediaSite, mediaType: d.mediaType,
      counterparty: d.counterparty, endDate: d.endDate, status: d.status,
      noticeDeadline: d.noticeDeadline, daysToNotice: d.daysToNotice,
      renewStatus: d.renewStatus, docStatus: d.docStatus
    });
  });
  months.forEach(function (m) {
    m.contracts.sort(function (a, b) { return a.noticeDeadline < b.noticeDeadline ? -1 : 1; });
  });
  return months;
}

function apiContract_(token, id) {
  auth_(token);
  const item = readContracts_().filter(function (d) { return d.id === id; })[0];
  if (!item) return { ok: false, code: 'NOT_FOUND', message: 'ไม่พบสัญญา' };
  return {
    ok: true,
    contract: item,
    responsibility: RESP_FIELDS.map(function (f) {
      return { label: f[1], value: item[f[0]] || 'ไม่ระบุ' };
    })
  };
}

function apiActionList_(token) {
  auth_(token);
  const list = readContracts_()
    .filter(function (d) {
      return d.status !== 'Write Off' && d.daysToExpire !== null && d.daysToExpire <= CFG.ACTION_DAYS;
    })
    .sort(function (a, b) { return a.daysToExpire - b.daysToExpire; });
  return { ok: true, list: list };
}

function apiExportCSV_(token) {
  auth_(token);
  const cols = ['contractNo', 'company', 'mediaType', 'mediaSite', 'province',
                'counterparty', 'status', 'businessModel', 'startDate', 'endDate',
                'duration', 'collateralType', 'collateralValue', 'paymentTerm',
                'renewCondition', 'noticeDeadline', 'daysToExpire', 'renewStatus', 'docStatus'];
  const esc = function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };
  const rows = [cols.map(esc).join(',')];
  readContracts_().forEach(function (d) {
    rows.push(cols.map(function (c) { return esc(d[c]); }).join(','));
  });
  return { ok: true, csv: '﻿' + rows.join('\r\n') };   // BOM กัน Excel อ่านไทยเพี้ยน
}

function apiClearCache_(token) {
  auth_(token);
  invalidateData_();
  return { ok: true };
}

// ==================== AI.gs ====================
/**
 * AI.gs — ผู้ช่วย AI ตอบคำถามเกี่ยวกับสัญญา (Claude API)
 *
 * ความปลอดภัย:
 *   - API key อยู่ใน Script Properties (ANTHROPIC_API_KEY) ฝั่ง backend เท่านั้น
 *     frontend บน GitHub ไม่เคยเห็นคีย์ และไม่เคยเห็นข้อมูลสัญญาทั้งก้อน
 *   - ต้องล็อกอินก่อนถึงจะถามได้ ทุกคำถามถูกบันทึกลงชีต Log
 *
 * Apps Script ไม่มี Anthropic SDK จึงเรียก REST API ตรงผ่าน UrlFetchApp
 */

const AI_ENDPOINT = 'https://api.anthropic.com/v1/messages';

const AI_SYSTEM_PROMPT = [
  'คุณคือผู้ช่วยฝ่ายบริหารสัญญาของ Plan B Media ตอบคำถามเกี่ยวกับสัญญาเช่าพื้นที่สื่อโฆษณา',
  'โดยใช้ข้อมูลสัญญาใน JSON ที่แนบมาเท่านั้น',
  '',
  'แนวทาง:',
  '- ตอบเป็นภาษาไทย กระชับ อ้างอิงเลขที่สัญญา (contractNo) และทำเล (mediaSite) ทุกครั้งที่พูดถึงสัญญา',
  '- ถ้าข้อมูลไม่พอหรือไม่มีในชุดข้อมูล ให้บอกตรง ๆ ว่าไม่มีข้อมูล อย่าเดา',
  '- วันที่ในข้อมูลเป็นรูปแบบ yyyy-MM-dd ให้แสดงผลเป็น dd/MM/yyyy (ค.ศ.)',
  '- ใช้ "วันนี้" ตามที่ระบุท้ายข้อความระบบในการนับวัน',
  '- ตอบเป็นข้อความธรรมดา ใช้หัวข้อย่อย (- ) ได้ ไม่ต้องใช้ตาราง Markdown',
  '',
  'ความหมายของฟิลด์ที่คำนวณไว้แล้ว:',
  '- daysToExpire = จำนวนวันจากวันนี้ถึงวันสิ้นสุดสัญญา (ติดลบ = หมดอายุแล้ว)',
  '- noticeDeadline = วันที่ต้องทำหนังสือแจ้งเตือนการต่อสัญญา, daysToNotice = วันคงเหลือถึงวันนั้น',
  '- alert: critical = เลยกำหนดแจ้งต่อสัญญาแล้ว, expired = หมดอายุแล้ว, warning = หมดอายุภายใน ' +
    CFG.ALERT_DAYS + ' วัน, normal = ปกติ, closed = Write Off, unknown = ไม่มีวันสิ้นสุด',
  '- revShareCompany / revShareOwner เป็นสัดส่วน 0-1 (0.4 = 40%)',
  '- ownerAsset, opex, capex, electricity, tax1-3, maintenance, insurance = ฝ่ายที่รับผิดชอบค่าใช้จ่ายนั้น (บริษัท / คู่สัญญา)'
].join('\n');

/** ฟิลด์ที่ส่งให้ AI (ตัด _row / id / noticeSource ที่เป็นข้อมูลภายในระบบออก) */
const AI_FIELDS = [
  'contractNo', 'company', 'mediaType', 'code', 'siteCode', 'mediaSite', 'province',
  'businessModel', 'counterparty', 'status', 'costType', 'startDate', 'endDate', 'duration',
  'collateralType', 'collateralValue', 'ownerAsset', 'opex', 'capex', 'electricity',
  'tax1', 'tax2', 'tax3', 'maintenance', 'insurance', 'paymentTerm', 'paymentDue',
  'revShareCompany', 'revShareOwner', 'renewCondition', 'endCondition', 'removalPeriod',
  'accessCondition', 'renewStatus', 'docStatus',
  'daysToExpire', 'noticeDeadline', 'daysToNotice', 'alert'
];

/** ข้อมูลสัญญาแบบกระชับ (ไม่ส่งฟิลด์ว่าง) — ลำดับคงที่เพื่อให้ prompt cache ใช้ซ้ำได้ */
function contractsForAI_() {
  return JSON.stringify(readContracts_().map(function (d) {
    const o = {};
    AI_FIELDS.forEach(function (f) {
      const v = d[f];
      if (v !== '' && v !== null && v !== undefined) o[f] = v;
    });
    return o;
  }));
}

/** ตรวจ/ตัดประวัติแชทจาก client: role user/assistant สลับกัน เริ่มด้วย user */
function sanitizeHistory_(history) {
  if (!Array.isArray(history)) return [];
  const out = [];
  history.slice(-CFG.AI_MAX_HISTORY).forEach(function (m) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) return;
    const text = String(m.content || '').slice(0, 8000);
    if (!text) return;
    const expected = out.length % 2 === 0 ? 'user' : 'assistant';
    if (m.role === expected) out.push({ role: m.role, content: text });
  });
  if (out.length && out[out.length - 1].role === 'user') out.pop();   // ต้องจบด้วย assistant ก่อนต่อคำถามใหม่
  return out;
}

function apiAskAI_(token, p) {
  const me = auth_(token);

  const apiKey = prop_('ANTHROPIC_API_KEY', '');
  if (!apiKey) {
    return { ok: false, code: 'AI_NOT_CONFIGURED',
             message: 'ยังไม่ได้ตั้งค่า ANTHROPIC_API_KEY ใน Script Properties ของ backend' };
  }

  const question = String(p.question || '').trim();
  if (!question) return { ok: false, code: 'MISSING_FIELD', message: 'กรุณาพิมพ์คำถาม' };
  if (question.length > CFG.AI_MAX_QUESTION) {
    return { ok: false, code: 'TOO_LONG', message: 'คำถามยาวเกิน ' + CFG.AI_MAX_QUESTION + ' ตัวอักษร' };
  }

  const body = {
    model: prop_('AI_MODEL', CFG.AI_MODEL),
    max_tokens: CFG.AI_MAX_TOKENS,
    thinking: { type: 'adaptive' },
    output_config: { effort: CFG.AI_EFFORT },
    fallbacks: 'default',                      // ถ้าโมเดลปฏิเสธคำขอ ให้ API ส่งต่อโมเดลสำรองให้อัตโนมัติ
    system: [
      { type: 'text', text: AI_SYSTEM_PROMPT },
      { type: 'text', text: 'ข้อมูลสัญญาทั้งหมด (JSON):\n' + contractsForAI_(),
        cache_control: { type: 'ephemeral' } },  // cache ส่วนที่ยาวและคงที่ — คำถามถัดไปถูกลง
      { type: 'text', text: 'วันนี้: ' + todayISO_() }   // อยู่หลังจุด cache เพื่อไม่ให้ cache เสีย
    ],
    messages: sanitizeHistory_(p.history).concat([{ role: 'user', content: question }])
  };

  const res = UrlFetchApp.fetch(AI_ENDPOINT, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'server-side-fallback-2026-07-01'
    },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });

  const status = res.getResponseCode();
  let json = {};
  try { json = JSON.parse(res.getContentText()); } catch (e) {}

  if (status !== 200) {
    const detail = (json.error && json.error.message) || ('HTTP ' + status);
    writeLog_(me.email, 'ASK_AI', 'error:' + status + ' ' + detail.slice(0, 150));
    if (status === 401 || status === 403) {
      return { ok: false, code: 'AI_AUTH', message: 'API key ของ Claude ไม่ถูกต้องหรือไม่มีสิทธิ์' };
    }
    if (status === 429 || status === 529 || status >= 500) {
      return { ok: false, code: 'AI_BUSY', message: 'ระบบ AI มีผู้ใช้งานมาก กรุณาลองใหม่อีกครั้ง' };
    }
    return { ok: false, code: 'AI_ERROR', message: 'AI ตอบกลับผิดพลาด: ' + detail };
  }

  if (json.stop_reason === 'refusal') {
    writeLog_(me.email, 'ASK_AI', 'refusal');
    return { ok: false, code: 'AI_REFUSED', message: 'AI ไม่สามารถตอบคำถามนี้ได้ กรุณาปรับคำถามใหม่' };
  }

  let answer = (json.content || [])
    .filter(function (b) { return b.type === 'text'; })
    .map(function (b) { return b.text; })
    .join('')
    .trim();
  if (json.stop_reason === 'max_tokens') answer += '\n\n(คำตอบยาวเกินกำหนด ถูกตัดท้าย — ลองถามให้แคบลง)';
  if (!answer) answer = 'ไม่ได้รับคำตอบจาก AI กรุณาลองใหม่อีกครั้ง';

  const u = json.usage || {};
  writeLog_(me.email, 'ASK_AI', question.slice(0, 200) +
    ' | in:' + (u.input_tokens || 0) + ' cache:' + (u.cache_read_input_tokens || 0) + ' out:' + (u.output_tokens || 0));

  return { ok: true, answer: answer, model: json.model };
}

/** ทดสอบจาก Apps Script Editor: เลือกฟังก์ชันนี้แล้วกด Run ดูผลใน Execution log */
function testAI() {
  const token = Utilities.getUuid();
  CacheService.getScriptCache().put('tk_' + token, JSON.stringify({ email: 'editor-test', role: 'admin' }), 60);
  Logger.log(JSON.stringify(apiAskAI_(token, { question: 'มีสัญญากี่ฉบับที่จะหมดอายุภายในสิ้นปีนี้ มีอะไรบ้าง' }), null, 2));
}

// ==================== Notice.gs ====================
/**
 * Notice.gs — อีเมล "แจ้งเตือนล่วงหน้าก่อนถึงวันที่ต้องทำหนังสือแจ้งเตือน"
 *
 * อิงคอลัมน์ AF "วันที่ต้องทำหนังสือแจ้งเตือน" ของชีต TEST- Contract Rental 2026 (PB)
 *
 * dailyNoticeCheck() รันทุกวันประมาณ 08:00 น. (Time-driven trigger) — ส่งอีเมล 1 ฉบับต่อวัน เฉพาะวันที่มีรายการ:
 *   1) เหลืออีก 30 วัน ถึงวันที่ต้องทำหนังสือแจ้งเตือน   (NOTICE.OFFSETS)
 *   2) เหลืออีก 3 วัน  ถึงวันที่ต้องทำหนังสือแจ้งเตือน
 *   3) วันที่ 1 ของเดือน — สรุปรายการที่ต้องทำหนังสือในเดือนปัจจุบัน
 *   ข้าม: สัญญา Write Off และสัญญาที่ "สถานะการต่อสัญญา" = Complete / Not Renew
 *
 * ข้อมูลในอีเมล: วันที่ต้องจัดทำหนังสือต่อระยะเวลาสัญญา · Contract No. · Media Site · ชื่อคู่สัญญา · วันสิ้นสุดสัญญา
 *
 * ผู้รับ: vanidarat.si@planbmedia.co.th (NOTICE.DEFAULT_TO) — เปลี่ยน/เพิ่มได้ที่ Script Property NOTICE_EMAILS (คั่นด้วย ,)
 * ลิงก์ในอีเมล: Script Property SITE_URL (เช่น https://contract-woad.vercel.app/frontend/)
 *
 * เปิดใช้งาน: รัน installNoticeTrigger() จาก editor ครั้งเดียว (หรือเมนู ⚙️ Contract Hub)
 * ทดสอบ:      รัน testNoticeEmail() — ส่งอีเมลตัวอย่างทันที
 * หมายเหตุ:   trigger รันโค้ดที่บันทึกล่าสุดใน editor — ไม่ต้อง Deploy เวอร์ชันใหม่ก็ส่งอีเมลได้
 */

/** ตัวเลือกของคอลัมน์ "สถานะการต่อสัญญา" (dropdown ทั้งบนเว็บและในชีต — ต้องตรงกับ frontend/js/config.js) */
const RENEW_STATUSES = ['Complete', 'On Process', 'Not Renew'];
/** สถานะที่ถือว่าจบแล้ว — ไม่ต้องเตือนทำหนังสืออีก */
const RENEW_DONE = ['Complete', 'Not Renew'];
/** ความยาวสูงสุดของ "สถานะเอกสาร" */
const DOC_STATUS_MAX = 100;

const NOTICE = {
  OFFSETS:         [30, 3],               // แจ้งเตือนเมื่อเหลืออีกกี่วันถึงวันที่ต้องทำหนังสือแจ้งเตือน
  OVERDUE_EVERY:   0,                     // เลยกำหนดแล้ว เตือนซ้ำทุกกี่วัน (0 = ไม่เตือนซ้ำ)
  MONTHLY_SUMMARY: true,                  // วันที่ 1 ของเดือน ส่งสรุปรายการของเดือนปัจจุบัน
  HOUR:            8,                     // เวลาส่ง (โมงเช้า ตาม timezone ของ script)
  HANDLER:         'dailyNoticeCheck',
  DONE_WORD:       'ส่งแล้ว',
  DEFAULT_TO:      ['vanidarat.si@planbmedia.co.th']
};

/* ---------- ผู้รับ / สถานะ ---------- */

function noticeRecipients_() {
  const fromProp = prop_('NOTICE_EMAILS', '')
    .split(/[,;\s]+/).map(function (s) { return s.trim().toLowerCase(); })
    .filter(function (s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s); });
  return fromProp.length ? fromProp : NOTICE.DEFAULT_TO.slice();
}

function noticeTriggerOn_() {
  return ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === NOTICE.HANDLER; });
}

function isNoticeDone_(d) {
  return d.status === 'Write Off' || RENEW_DONE.indexOf(d.renewStatus) > -1 ||
         String(d.renewStatus || '').indexOf(NOTICE.DONE_WORD) > -1;   // รองรับค่าเดิม "ส่งแล้ว"
}

/* ---------- เลือกรายการที่ต้องเตือนวันนี้ ---------- */

function noticeDigest_(data, today) {
  const open = data.filter(function (d) { return d.noticeDeadline && !isNoticeDone_(d); });
  const byOffset = {};
  NOTICE.OFFSETS.forEach(function (n) {
    byOffset[n] = open.filter(function (d) { return d.daysToNotice === n; })
      .sort(function (a, b) { return a.noticeDeadline < b.noticeDeadline ? -1 : 1; });
  });
  const upcoming = [].concat.apply([], NOTICE.OFFSETS.map(function (n) { return byOffset[n]; }));
  const overdue = NOTICE.OVERDUE_EVERY > 0
    ? open.filter(function (d) {
        return d.daysToNotice < 0 && d.daysToExpire !== null && d.daysToExpire >= 0 &&
               (-d.daysToNotice) % NOTICE.OVERDUE_EVERY === 0;
      }).sort(function (a, b) { return a.daysToNotice - b.daysToNotice; })
    : [];
  const monthKey = today.slice(0, 7);
  const monthly = NOTICE.MONTHLY_SUMMARY && today.slice(8, 10) === '01'
    ? data.filter(function (d) { return d.status !== 'Write Off' && d.noticeDeadline && d.noticeDeadline.slice(0, 7) === monthKey; })
          .sort(function (a, b) { return a.noticeDeadline < b.noticeDeadline ? -1 : 1; })
    : [];
  return { byOffset: byOffset, upcoming: upcoming, overdue: overdue, monthly: monthly };
}

/* ---------- อีเมล ---------- */

function fmtThDate_(iso) {
  if (!iso) return '-';
  const p = iso.split('-');
  return p[2] + '/' + p[1] + '/' + p[0];
}

function htmlEsc_(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

/** ตารางในอีเมล — คอลัมน์ตามที่กำหนด */
function noticeTable_(title, color, rows) {
  if (!rows.length) return '';
  const th = 'style="text-align:left;padding:8px 10px;background:#F8FAFC;border-bottom:1px solid #E2E8F0;font-size:12px;color:#334155"';
  const td = 'style="padding:8px 10px;border-bottom:1px solid #F1F5F9;font-size:13px;vertical-align:top"';
  return '<h3 style="margin:22px 0 8px;font-size:15px;color:' + color + '">' + htmlEsc_(title) + ' (' + rows.length + ' สัญญา)</h3>' +
    '<table style="border-collapse:collapse;width:100%;font-family:Arial,sans-serif">' +
    '<tr><th ' + th + '>วันที่ต้องจัดทำหนังสือต่อระยะเวลาสัญญา</th><th ' + th + '>Contract No.</th>' +
    '<th ' + th + '>Media Site</th><th ' + th + '>ชื่อคู่สัญญา</th><th ' + th + '>วันสิ้นสุดสัญญา</th></tr>' +
    rows.map(function (d) {
      const left = d.daysToNotice === 0 ? 'วันนี้'
        : d.daysToNotice > 0 ? 'อีก ' + d.daysToNotice + ' วัน'
        : 'เลยมา ' + (-d.daysToNotice) + ' วัน';
      return '<tr><td ' + td + '><b>' + fmtThDate_(d.noticeDeadline) + '</b><br><span style="color:' + color + ';font-size:12px">' + left + '</span></td>' +
        '<td ' + td + '><b>' + htmlEsc_(d.contractNo || '-') + '</b></td>' +
        '<td ' + td + '>' + htmlEsc_(d.mediaSite || '-') + '</td>' +
        '<td ' + td + '>' + htmlEsc_(d.counterparty || '-') + '</td>' +
        '<td ' + td + '>' + fmtThDate_(d.endDate) + '</td></tr>';
    }).join('') + '</table>';
}

function sendNoticeEmail_(to, subject, intro, sections) {
  const site = prop_('SITE_URL', '');
  const html =
    '<div style="font-family:Arial,sans-serif;color:#0F172A;max-width:860px">' +
    '<div style="font-size:18px;font-weight:bold;margin-bottom:4px">Plan B — Contract Rental Hub</div>' +
    '<div style="color:#475569;font-size:13px">' + htmlEsc_(intro) + '</div>' +
    sections.join('') +
    (site ? '<p style="margin-top:22px"><a href="' + htmlEsc_(site) + '" style="background:#E4002B;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-size:13px">เปิดระบบ Contract Rental Hub</a></p>' : '') +
    '<p style="color:#94A3B8;font-size:11px;margin-top:22px">อีเมลอัตโนมัติจากระบบ — ข้อมูลจากคอลัมน์ "วันที่ต้องทำหนังสือแจ้งเตือน" ' +
    'เปลี่ยน "สถานะการต่อสัญญา" เป็น Complete หรือ Not Renew (บนเว็บแท็บหนังสือแจ้งเตือน หรือในชีต) เพื่อหยุดการเตือน</p></div>';
  MailApp.sendEmail({ to: to.join(','), subject: subject, htmlBody: html, name: 'Contract Rental Hub' });
}

/* ---------- Trigger รายวัน ---------- */

/** รันอัตโนมัติทุกวัน — ห้ามเปลี่ยนชื่อ (ผูกกับ trigger) */
function dailyNoticeCheck() {
  invalidateData_();                                           // อ่านชีตล่าสุด
  const today = todayISO_();
  const dg = noticeDigest_(readContracts_(), today);
  const total = dg.upcoming.length + dg.overdue.length + dg.monthly.length;
  if (!total) return 'ไม่มีรายการต้องเตือนวันนี้';

  const to = noticeRecipients_();
  const parts = [];
  const sections = [];
  if (dg.overdue.length) {
    parts.push('เลยกำหนด ' + dg.overdue.length);
    sections.push(noticeTable_('เลยวันที่ต้องทำหนังสือแจ้งเตือนแล้ว', '#DC2626', dg.overdue));
  }
  NOTICE.OFFSETS.slice().sort(function (a, b) { return a - b; }).forEach(function (n) {
    const rows = dg.byOffset[n];
    if (!rows.length) return;
    parts.push('อีก ' + n + ' วัน ' + rows.length);
    sections.push(noticeTable_('เหลืออีก ' + n + ' วัน ถึงวันที่ต้องทำหนังสือแจ้งเตือน', n <= 7 ? '#DC2626' : '#D97706', rows));
  });
  if (dg.monthly.length) {
    parts.push('สรุปเดือนนี้ ' + dg.monthly.length);
    sections.push(noticeTable_('สรุปรายการที่ต้องทำหนังสือแจ้งเตือนเดือนนี้', '#2563EB', dg.monthly));
  }

  sendNoticeEmail_(to,
    '[แจ้งเตือนล่วงหน้า] ใกล้ถึงวันที่ต้องทำหนังสือแจ้งเตือนต่อสัญญา — ' + parts.join(' · ') + ' สัญญา',
    'รายการสัญญาที่ใกล้ถึงวันที่ต้องทำหนังสือแจ้งเตือน ตรวจสอบ ณ วันที่ ' + fmtThDate_(today),
    sections);
  writeLog_('system', 'NOTICE_EMAIL', parts.join(', ') + ' → ' + to.join(','));
  return 'ส่งแล้ว: ' + parts.join(', ') + ' → ' + to.join(', ');
}

/**
 * ทดสอบ: ส่งอีเมลตัวอย่างทันที (ไม่ต้องรอให้ตรงวัน)
 * แสดงสัญญาที่มีวันที่ต้องทำหนังสือแจ้งเตือนในเดือนปัจจุบัน และภายใน 30 วันข้างหน้า
 */
function testNoticeEmail() {
  invalidateData_();
  const today = todayISO_();
  const until = addDays_(today, Math.max.apply(null, NOTICE.OFFSETS));
  const month = today.slice(0, 7);
  const rows = readContracts_()
    .filter(function (d) {
      return d.noticeDeadline && !isNoticeDone_(d) &&
             (d.noticeDeadline.slice(0, 7) === month || (d.noticeDeadline >= today && d.noticeDeadline <= until));
    })
    .sort(function (a, b) { return a.noticeDeadline < b.noticeDeadline ? -1 : 1; });
  const to = noticeRecipients_();
  sendNoticeEmail_(to,
    '[ทดสอบ] แจ้งเตือนล่วงหน้า — วันที่ต้องทำหนังสือแจ้งเตือน (' + rows.length + ' สัญญา)',
    'อีเมลทดสอบ — รายการที่ถึงกำหนดในเดือนนี้และภายใน ' + Math.max.apply(null, NOTICE.OFFSETS) + ' วันข้างหน้า ณ วันที่ ' + fmtThDate_(today) +
      ' (อีเมลจริงจะส่งเฉพาะวันที่เหลืออีก ' + NOTICE.OFFSETS.join(' / ') + ' วัน)',
    [rows.length ? noticeTable_('รายการที่ใกล้ถึงวันที่ต้องทำหนังสือแจ้งเตือน', '#D97706', rows)
                 : '<p style="margin-top:18px">ไม่มีสัญญาที่ถึงกำหนดในช่วงนี้</p>']);
  writeLog_('system', 'NOTICE_EMAIL', 'test:' + rows.length + ' → ' + to.join(','));
  Logger.log('ส่งอีเมลทดสอบ ' + rows.length + ' สัญญา → ' + to.join(', '));
}

/** เปิดการเตือนอัตโนมัติ — รันจาก editor ครั้งเดียว */
function installNoticeTrigger() {
  removeNoticeTrigger();
  ScriptApp.getProjectTriggers().forEach(function (t) {           // กันอีเมลซ้ำกับไฟล์เดี่ยว EmailReminder.gs
    if (t.getHandlerFunction() === 'reminderDailyCheck') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger(NOTICE.HANDLER).timeBased().everyDays(1).atHour(NOTICE.HOUR).create();
  Logger.log('เปิดการเตือนทางอีเมลแล้ว — ตรวจทุกวันประมาณ ' + NOTICE.HOUR + ':00 น. · เตือนเมื่อเหลือ ' +
             NOTICE.OFFSETS.join(' / ') + ' วัน · ผู้รับ: ' + noticeRecipients_().join(', '));
}

/** ปิดการเตือนอัตโนมัติ */
function removeNoticeTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === NOTICE.HANDLER) ScriptApp.deleteTrigger(t);
  });
}

/* ---------- API ---------- */

function apiNoticeSettings_(token) {
  const me = auth_(token);
  const to = noticeRecipients_();
  return {
    ok: true,
    triggerOn: noticeTriggerOn_(),
    hour: NOTICE.HOUR,
    offsets: NOTICE.OFFSETS,
    overdueEvery: NOTICE.OVERDUE_EVERY,
    recipientCount: to.length,
    recipients: me.role === 'admin' ? to : [],
    monthlySummary: NOTICE.MONTHLY_SUMMARY,
    source: prop_('NOTICE_EMAILS', '') ? 'NOTICE_EMAILS' : 'default'
  };
}

/**
 * admin: แก้ "สถานะการต่อสัญญา" / "สถานะเอกสาร" จากหน้าเว็บ แล้วเขียนกลับลงชีต
 * p: { id: 'C<row>', contractNo, renewStatus?, docStatus? } — ส่งเฉพาะช่องที่ต้องการแก้
 */
function apiUpdateNoticeStatus_(token, p) {
  const me = auth_(token);
  if (me.role !== 'admin') return { ok: false, code: 'FORBIDDEN', message: 'เฉพาะ admin เท่านั้นที่แก้สถานะได้' };

  const row = parseInt(String(p.id || '').replace(/^C/, ''), 10);
  if (!row) return { ok: false, code: 'BAD_REQUEST', message: 'ไม่ระบุสัญญา' };

  const renew = p.renewStatus === undefined || p.renewStatus === null ? null : String(p.renewStatus).trim();
  if (renew !== null && renew !== '' && RENEW_STATUSES.indexOf(renew) < 0) {
    return { ok: false, code: 'INVALID_VALUE', message: 'สถานะการต่อสัญญาต้องเป็น ' + RENEW_STATUSES.join(' / ') };
  }
  const doc = p.docStatus === undefined || p.docStatus === null ? null : String(p.docStatus).replace(/\s+/g, ' ').trim();
  if (doc !== null && doc.length > DOC_STATUS_MAX) {
    return { ok: false, code: 'TOO_LONG', message: 'สถานะเอกสารยาวเกิน ' + DOC_STATUS_MAX + ' ตัวอักษร' };
  }
  if (renew === null && doc === null) return { ok: false, code: 'MISSING_FIELD', message: 'ไม่มีข้อมูลที่ต้องแก้' };

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  let contractNo = '';
  const changes = [];
  try {
    const src = findDataSheet_();
    const sh = src.sheet, map = src.map;
    if (row <= src.headerRow || row > sh.getLastRow()) return { ok: false, code: 'NOT_FOUND', message: 'ไม่พบสัญญาในชีต' };
    if ((renew !== null && map.renewStatus === undefined) || (doc !== null && map.docStatus === undefined)) {
      return { ok: false, code: 'NO_COLUMN', message: 'ชีตไม่มีคอลัมน์ "สถานะการต่อสัญญา" / "สถานะเอกสาร"' };
    }

    // กันเขียนผิดแถว: ถ้ามีคนแทรก/ลบแถวหลังจากหน้าเว็บโหลดข้อมูล เลขที่สัญญาจะไม่ตรง
    contractNo = clean_(sh.getRange(row, map.contractNo + 1).getDisplayValue());
    if (p.contractNo !== undefined && clean_(p.contractNo) !== contractNo) {
      return { ok: false, code: 'STALE', message: 'ข้อมูลในชีตมีการเปลี่ยนแปลง กรุณากด ↻ รีเฟรช แล้วลองใหม่' };
    }

    const write = function (field, value) {
      const cell = sh.getRange(row, map[field] + 1);
      const old = clean_(cell.getDisplayValue());
      if (old === value) return;
      cell.setValue(/^[=+\-@]/.test(value) ? "'" + value : value);   // กันข้อความถูกตีความเป็นสูตร
      changes.push(field + ': "' + old + '" → "' + value + '"');
    };
    if (renew !== null) write('renewStatus', renew);
    if (doc !== null) write('docStatus', doc);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }

  invalidateData_();
  if (changes.length) writeLog_(me.email, 'UPDATE_STATUS', contractNo + ' | ' + changes.join(' | '));
  return { ok: true, id: p.id, renewStatus: renew, docStatus: doc, changed: changes.length, version: dataFingerprint_() };
}

/**
 * ใส่ dropdown ให้คอลัมน์ "สถานะการต่อสัญญา" และจำกัด "สถานะเอกสาร" ไม่เกิน 100 ตัวอักษร ในชีต
 * (setupSystem เรียกให้อัตโนมัติ · รันซ้ำได้)
 */
function applyStatusDropdowns() {
  const src = findDataSheet_();
  const sh = src.sheet, first = src.headerRow + 1;
  const n = Math.max(sh.getMaxRows() - src.headerRow, 1);
  if (src.map.renewStatus !== undefined) {
    sh.getRange(first, src.map.renewStatus + 1, n, 1).setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireValueInList(RENEW_STATUSES, true)
        .setAllowInvalid(false)
        .setHelpText('เลือก: ' + RENEW_STATUSES.join(' / '))
        .build());
  }
  if (src.map.docStatus !== undefined) {
    const a1 = sh.getRange(first, src.map.docStatus + 1).getA1Notation();
    sh.getRange(first, src.map.docStatus + 1, n, 1).setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireFormulaSatisfied('=LEN(' + a1 + ')<=' + DOC_STATUS_MAX)
        .setAllowInvalid(false)
        .setHelpText('ข้อความไม่เกิน ' + DOC_STATUS_MAX + ' ตัวอักษร')
        .build());
  }
  Logger.log('ตั้ง dropdown "สถานะการต่อสัญญา" และจำกัด "สถานะเอกสาร" ' + DOC_STATUS_MAX + ' ตัวอักษร ในแท็บ "' + sh.getName() + '" แล้ว');
}

/** admin: ส่งอีเมลสรุปของเดือนที่เลือกทันที (ใช้ทดสอบ หรือส่งเตือนเอง) */
function apiSendNoticeNow_(token, p) {
  const me = auth_(token);
  if (me.role !== 'admin') return { ok: false, code: 'FORBIDDEN', message: 'เฉพาะ admin เท่านั้น' };

  const month = /^\d{4}-\d{2}$/.test(String(p.month || '')) ? p.month : todayISO_().slice(0, 7);
  const rows = readContracts_()
    .filter(function (d) { return d.status !== 'Write Off' && d.noticeDeadline && d.noticeDeadline.slice(0, 7) === month; })
    .sort(function (a, b) { return a.noticeDeadline < b.noticeDeadline ? -1 : 1; });
  if (!rows.length) return { ok: false, code: 'EMPTY', message: 'เดือนนี้ไม่มีสัญญาที่ต้องทำหนังสือแจ้งเตือน' };

  const to = p.toSelf ? [String(me.email).toLowerCase()] : noticeRecipients_();
  if (!to.length) return { ok: false, code: 'NO_RECIPIENT', message: 'ยังไม่มีผู้รับ — ตั้ง Script Property NOTICE_EMAILS' };

  const label = fmtThDate_(month + '-01').slice(3);
  sendNoticeEmail_(to,
    '[Contract Hub] สรุปหนังสือแจ้งเตือนเดือน ' + label + ' — ' + rows.length + ' สัญญา',
    'ส่งโดย ' + me.email + ' จากหน้า "หนังสือแจ้งเตือน"',
    [noticeTable_('ต้องทำหนังสือแจ้งเตือนเดือน ' + label, '#2563EB', rows)]);
  writeLog_(me.email, 'NOTICE_EMAIL', 'manual:' + month + ' → ' + to.join(','));
  return { ok: true, sent: rows.length, to: to };
}

// ==================== Edit.gs ====================
/**
 * Edit.gs — แก้ไขข้อมูลสัญญาจากหน้าเว็บ แล้วเขียนกลับลง Google Sheet (admin)
 *
 * p: { id: 'C<row>', contractNo: '<เลขที่สัญญาเดิม>', fields: { field: value, ... } }
 *    ส่งมาเฉพาะช่องที่เปลี่ยน · วันที่เป็น 'yyyy-MM-dd' · เปอร์เซ็นต์เป็นตัวเลข 0-100
 *
 * กันพลาด:
 *   - ตรวจเลขที่สัญญาในแถวก่อนเขียน (ถ้ามีคนแทรก/ลบแถวในชีต จะไม่เขียนผิดแถว)
 *   - LockService กันสองคนเขียนพร้อมกัน
 *   - ข้อความที่ขึ้นต้นด้วย = + - @ ถูกเก็บเป็นข้อความ ไม่กลายเป็นสูตร
 *   - บันทึกค่าเดิม → ค่าใหม่ ทุกช่องลงชีต Log (Action UPDATE_CONTRACT)
 */

const EDIT = {
  DATE:    ['startDate', 'endDate', 'noticeDate'],
  NUMBER:  ['collateralValue'],
  PERCENT: ['revShareCompany', 'revShareOwner'],
  LOCKED:  ['no'],                  // ไม่ให้แก้จากหน้าเว็บ
  TEXT_MAX: 300
};

/** แปลงค่าจากหน้าเว็บเป็นค่าที่จะเขียนลงเซลล์ — คืน { value } หรือ { error } */
function editValue_(field, raw) {
  const s = String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim();
  if (s === '') return { value: '' };

  if (EDIT.DATE.indexOf(field) > -1) {
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return { error: 'รูปแบบวันที่ไม่ถูกต้อง' };
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    if (isNaN(d) || d.getDate() !== +m[3]) return { error: 'วันที่ไม่ถูกต้อง' };
    return { value: d };                                   // เขียนเป็น Date — ไม่ขึ้นกับ locale ของชีต
  }
  if (EDIT.NUMBER.indexOf(field) > -1) {
    const n = Number(s.replace(/,/g, ''));
    if (!isFinite(n) || n < 0) return { error: 'ต้องเป็นตัวเลขไม่ติดลบ' };
    return { value: n };
  }
  if (EDIT.PERCENT.indexOf(field) > -1) {
    const n = Number(s.replace('%', ''));
    if (!isFinite(n) || n < 0 || n > 100) return { error: 'ต้องเป็น 0–100' };
    return { value: n + '%' };                             // ชีตแปลงเป็นเปอร์เซ็นต์ให้เอง
  }
  if (field === 'renewCondition' && /^\d+$/.test(s)) return { value: +s };
  if (field === 'renewStatus' && RENEW_STATUSES.indexOf(s) < 0) {
    return { error: 'ต้องเป็น ' + RENEW_STATUSES.join(' / ') };
  }
  const max = field === 'docStatus' ? DOC_STATUS_MAX : EDIT.TEXT_MAX;
  if (s.length > max) return { error: 'ยาวเกิน ' + max + ' ตัวอักษร' };
  return { value: /^[=+\-@]/.test(s) ? "'" + s : s };
}

function cellText_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') return toISODate_(v);
  return clean_(v);
}

function apiUpdateContract_(token, p) {
  const me = auth_(token);
  if (me.role !== 'admin') return { ok: false, code: 'FORBIDDEN', message: 'เฉพาะ admin เท่านั้นที่แก้ไขข้อมูลได้' };

  const row = parseInt(String(p.id || '').replace(/^C/, ''), 10);
  const fields = p.fields && typeof p.fields === 'object' ? p.fields : null;
  if (!row || !fields || !Object.keys(fields).length) {
    return { ok: false, code: 'MISSING_FIELD', message: 'ไม่มีข้อมูลที่ต้องแก้' };
  }

  // ตรวจค่าทั้งหมดก่อน — ถ้ามีช่องไหนผิด ไม่เขียนเลยสักช่อง
  const known = COLUMNS.map(function (c) { return c[0]; });
  const prepared = {};
  const errors = {};
  Object.keys(fields).forEach(function (f) {
    if (known.indexOf(f) < 0 || EDIT.LOCKED.indexOf(f) > -1) { errors[f] = 'แก้ช่องนี้ไม่ได้'; return; }
    const r = editValue_(f, fields[f]);
    if (r.error) errors[f] = r.error; else prepared[f] = r.value;
  });
  if (Object.keys(errors).length) {
    return { ok: false, code: 'INVALID_VALUE', message: 'ข้อมูลบางช่องไม่ถูกต้อง', errors: errors };
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  let contractNo = '';
  const changes = [];
  try {
    const src = findDataSheet_();
    const sh = src.sheet, map = src.map;
    if (row <= src.headerRow || row > sh.getLastRow()) return { ok: false, code: 'NOT_FOUND', message: 'ไม่พบสัญญาในชีต' };

    contractNo = clean_(sh.getRange(row, map.contractNo + 1).getDisplayValue());
    if (p.contractNo !== undefined && clean_(p.contractNo) !== contractNo) {
      return { ok: false, code: 'STALE', message: 'ข้อมูลในชีตมีการเปลี่ยนแปลง กรุณากด ↻ รีเฟรช แล้วลองใหม่' };
    }

    const missing = Object.keys(prepared).filter(function (f) { return map[f] === undefined; });
    if (missing.length) return { ok: false, code: 'NO_COLUMN', message: 'ชีตไม่มีคอลัมน์: ' + missing.join(', ') };

    Object.keys(prepared).forEach(function (f) {
      const cell = sh.getRange(row, map[f] + 1);
      const before = cellText_(cell.getValue());
      cell.setValue(prepared[f]);
      changes.push(f + ': "' + before + '" → "' + cellText_(prepared[f]).replace(/^'/, '') + '"');
    });
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }

  invalidateData_();
  const newNo = prepared.contractNo !== undefined ? String(prepared.contractNo).replace(/^'/, '') : contractNo;
  writeLog_(me.email, 'UPDATE_CONTRACT', newNo + ' | ' + changes.join(' | '));
  const fresh = readContracts_().filter(function (d) { return d.id === p.id; })[0] || null;
  return { ok: true, id: p.id, changed: changes.length, contract: fresh, version: dataFingerprint_() };
}

// ==================== Members.gs ====================
/**
 * Members.gs — จัดการผู้ใช้ (แท็บ "สมาชิก" เฉพาะ admin + ฟังก์ชันรันจาก editor)
 */

const USER_HEADER = ['Email', 'Salt', 'PasswordHash', 'Name', 'Role', 'Active', 'Position', 'Phone', 'Department', 'PhotoUrl'];

/**
 * เพิ่มสมาชิกใหม่จากหน้าเว็บ
 * สุ่มรหัสผ่านชั่วคราวให้ 1 ครั้ง แล้วคืนกลับไปให้แอดมินส่งต่อให้สมาชิก
 */
function apiAddMember_(token, p) {
  const me = auth_(token);
  if (me.role !== 'admin') {
    return { ok: false, code: 'FORBIDDEN', message: 'เฉพาะ admin เท่านั้นที่เพิ่มสมาชิกได้' };
  }

  const email = String(p.email || '').trim().toLowerCase();
  const name  = String(p.name  || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, code: 'INVALID_EMAIL', message: 'อีเมลไม่ถูกต้อง' };
  }
  if (!name) {
    return { ok: false, code: 'MISSING_FIELD', message: 'กรุณากรอกชื่อ-นามสกุล' };
  }

  const rows = getSheet_(CFG.SHEET_USERS).getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim().toLowerCase() === email) {
      return { ok: false, code: 'DUPLICATE_EMAIL', message: 'มีอีเมลนี้ในระบบอยู่แล้ว' };
    }
  }

  const role         = p.role === 'admin' ? 'admin' : 'viewer';
  const active       = p.active !== false && p.active !== 'false';
  // รูปถูกย่อ+บีบอัดฝั่ง client แล้วเป็น data URI — เก็บตรง ๆ ในเซลล์ชีต เลี่ยงปัญหาลิงก์ Drive ที่ไม่เสถียร
  const photo        = (typeof p.photo === 'string' && p.photo.indexOf('data:image/') === 0 && p.photo.length <= 49000) ? p.photo : '';
  const tempPassword = genPassword_();

  addUser(email, tempPassword, name, role, {
    active:     active,
    position:   p.position,
    phone:      p.phone,
    department: p.department,
    photoUrl:   photo
  });

  writeLog_(me.email, 'ADD_MEMBER', 'add:' + email);
  return { ok: true, email: email, tempPassword: tempPassword };
}

/** สุ่มรหัสผ่านชั่วคราวอ่านง่าย (เลี่ยงตัวอักษรกำกวม 0/O, 1/l/I) */
function genPassword_() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 10; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
  return out;
}

function ensureUserSheet_() {
  const sh = getSheet_(CFG.SHEET_USERS);
  if (sh.getLastRow() === 0) {
    sh.appendRow(USER_HEADER);
    sh.getRange(1, 1, 1, USER_HEADER.length).setFontWeight('bold').setBackground('#111827').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  }
  return sh;
}

/**
 * เพิ่ม/อัปเดตผู้ใช้ (เรียกจาก setupSystem(), apiAddMember_(), หรือรันเองจาก editor)
 * extra: { active, position, phone, department, photoUrl } — ทั้งหมดเป็น optional
 */
function addUser(email, password, name, role, extra) {
  extra = extra || {};
  const sh = ensureUserSheet_();
  email = String(email).trim().toLowerCase();
  const salt = Utilities.getUuid().slice(0, 8);
  const hash = hashPassword_(password, salt);
  const active = extra.active === false ? false : true;
  const tail = [extra.position || '', extra.phone || '', extra.department || '', extra.photoUrl || ''];
  const rows = sh.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim().toLowerCase() === email) {
      sh.getRange(i + 1, 1, 1, USER_HEADER.length).setValues([[email, salt, hash, name, role || 'viewer', active].concat(tail)]);
      return 'อัปเดตผู้ใช้: ' + email;
    }
  }
  sh.appendRow([email, salt, hash, name, role || 'viewer', active].concat(tail));
  return 'เพิ่มผู้ใช้: ' + email;
}

// ==================== Setup.gs ====================
/**
 * Setup.gs — ติดตั้งระบบ / เมนูในสเปรดชีต (รันจาก Apps Script Editor)
 */

/**
 * ติดตั้งครั้งแรก: ตรวจแท็บข้อมูลสัญญา + สร้างชีต Users / Log + บัญชี admin เริ่มต้น
 * รหัสผ่านเริ่มต้น: PlanB@2026  — เปลี่ยนทันทีหลังล็อกอินครั้งแรก
 * ถ้ามีผู้ใช้อยู่แล้ว จะไม่รีเซ็ตรหัส admin ซ้ำ
 */
function setupSystem() {
  const src = findDataSheet_();
  Logger.log('แท็บข้อมูลสัญญา: "' + src.sheet.getName() + '" (header แถว ' + src.headerRow + ')');
  const missing = COLUMNS.map(function (c) { return c[0]; })
    .filter(function (f) { return src.map[f] === undefined; });
  if (missing.length) Logger.log('คอลัมน์ที่ไม่พบ (จะแสดงเป็นค่าว่าง): ' + missing.join(', '));

  applyStatusDropdowns();

  const users = ensureUserSheet_();
  getSheet_(CFG.SHEET_LOG);
  if (users.getLastRow() <= 1) {
    addUser('admin@planb.co.th', 'PlanB@2026', 'Administrator', 'admin');
    Logger.log('สร้าง admin@planb.co.th / PlanB@2026 แล้ว (เปลี่ยนรหัสทันที)');
  }

  invalidateData_();
  Logger.log('อ่านสัญญาได้ ' + readContracts_().length + ' รายการ');
  Logger.log('ผู้ช่วย AI: ' + (prop_('ANTHROPIC_API_KEY', '') ? 'พร้อมใช้งาน' : 'ยังไม่ได้ตั้ง ANTHROPIC_API_KEY'));
  Logger.log('อีเมลเตือน: ' + (noticeTriggerOn_() ? 'เปิด' : 'ปิด (รัน installNoticeTrigger เพื่อเปิด)') +
             ' · ผู้รับ: ' + (noticeRecipients_().join(', ') || 'ยังไม่มี (ตั้ง NOTICE_EMAILS)'));
}

/** เมนูในสเปรดชีต (ทำงานเมื่อ script ผูกกับชีต) */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('⚙️ Contract Hub')
    .addItem('ติดตั้งระบบครั้งแรก', 'setupSystem')
    .addItem('ล้าง Cache ข้อมูล', 'menuClearCache')
    .addItem('ตั้ง Dropdown สถานะในชีต', 'applyStatusDropdowns')
    .addSeparator()
    .addItem('เปิดการเตือนทางอีเมล (ทุกวัน)', 'installNoticeTrigger')
    .addItem('ปิดการเตือนทางอีเมล', 'removeNoticeTrigger')
    .addItem('ตรวจและส่งอีเมลเตือนตอนนี้', 'dailyNoticeCheck')
    .addItem('ส่งอีเมลทดสอบ', 'testNoticeEmail')
    .addToUi();
}

function menuClearCache() {
  invalidateData_();
  SpreadsheetApp.getUi().alert('ล้าง Cache เรียบร้อย');
}
