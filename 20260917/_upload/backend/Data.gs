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
