/**
 * Data.gs — อ่านชีต Contract_Master + คำนวณ field ที่ derive ได้ + ตรวจคุณภาพข้อมูล
 *
 * derive fields:
 *   freq          monthly | quarterly | yearly | other   (จากคอลัมน์ Payment)
 *   installment   ยอดต่องวด   = Amount/Month (รายเดือน) · Amount/Month × 3 (ราย 3 เดือน) · Amount/Year (รายปี) + Up or CN
 *   annualCost    ประมาณการต่อปี = Amount/Month × 12 หรือ Amount/Year
 *   payDate       วันที่ต้องจ่ายถัดไป: ยังไม่เบิก → ว/ด/ป ชำระตามสัญญา · เบิกแล้วแต่เช็คยังไม่ถึงวัน → เช็คลงวันที่
 *   daysToPay     วันคงเหลือถึง payDate
 *   payAlert      overdue | due3 | soon | normal | paid | unknown
 *   daysToExpire  วันคงเหลือถึงวันสิ้นสุดสัญญา · expireAlert  expired | warning | normal | unknown
 *   issues        [{ field, level, msg, fix? }]  ปัญหาคุณภาพข้อมูลของแถวนั้น (แท็บ "ตรวจสอบข้อมูล")
 */

/* ---------- แปลงค่า ---------- */

const DAY_MS = 86400000;

function isDate_(v) {
  return Object.prototype.toString.call(v) === '[object Date]';
}

function iso_(y, m, d) {
  const dt = new Date(y, m - 1, d);
  if (isNaN(dt) || dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return '';
  return Utilities.formatDate(dt, CFG.TZ, 'yyyy-MM-dd');
}

/**
 * แปลงวันที่จากเซลล์ → { iso, swapped, bad }
 *   Date object · 'd/m/yyyy' · 'yyyy-MM-dd'  (ปี > 2400 ถือเป็น พ.ศ. ลบ 543 ให้)
 *   swapped = เซลล์เขียนเป็น เดือน/วัน/ปี (เช่น 12/31/2571) — อ่านถูกแล้วแต่ควรแก้ในชีต
 *   bad     = มีค่าแต่อ่านเป็นวันที่ไม่ได้
 */
function parseDate_(v) {
  const out = { iso: '', swapped: false, bad: false };
  if (v === '' || v === null || v === undefined) return out;
  if (isDate_(v)) {
    if (isNaN(v)) { out.bad = true; return out; }
    const y = v.getFullYear();
    out.iso = y > 2400
      ? iso_(y - 543, v.getMonth() + 1, v.getDate())
      : Utilities.formatDate(v, CFG.TZ, 'yyyy-MM-dd');
    return out;
  }
  const s = String(v).trim();
  if (s === '' || s === '-' || s === '–') return out;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) { out.iso = iso_(+m[1], +m[2], +m[3]); out.bad = !out.iso; return out; }
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (!m) { out.bad = true; return out; }
  let d = +m[1], mo = +m[2], y = +m[3];
  if (mo > 12 && d <= 12) { const t = d; d = mo; mo = t; out.swapped = true; }
  if (y < 100) y += 2000;
  if (y > 2400) y -= 543;
  out.iso = iso_(y, mo, d);
  out.bad = !out.iso;
  return out;
}

/** Date object หรือ string -> ISO 'yyyy-MM-dd' */
function toISODate_(v) {
  return parseDate_(v).iso;
}

/** '1,280,000.00' -> 1280000 · '+10,569.00' -> 10569 · '-' -> 0 */
function toNumber_(v) {
  if (typeof v === 'number') return v;
  const s = String(v == null ? '' : v).trim();
  if (s === '' || s === '-' || s === '–') return 0;
  const n = parseFloat(s.replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : n;
}

function clean_(v) {
  const s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  return (s === '-' || s === '–' || s === 'N/A') ? '' : s;
}

function daysBetween_(isoA, isoB) {
  if (!isoA || !isoB) return null;
  return Math.round((new Date(isoB) - new Date(isoA)) / DAY_MS);
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

/** ความถี่การจ่ายจากคอลัมน์ Payment */
function freqOf_(s) {
  s = String(s || '');
  if (/3\s*เดือน|ไตรมาส/.test(s)) return 'quarterly';
  if (/ปี/.test(s))               return 'yearly';
  if (/เดือน/.test(s))            return 'monthly';
  return 'other';
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
  return map;
}

/** คืน { sheet, headerRow, map } ของแท็บข้อมูลค่าเช่า */
function findDataSheet_() {
  const ss = ss_();
  const names = [prop_('SHEET_DATA', ''), CFG.SHEET_DATA, 'Billboard'].filter(String);
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
  throw new Error('ไม่พบแท็บข้อมูลค่าเช่า (ต้องมีหัวคอลัมน์ "Contract No.")');
}

/* ---------- ซิงค์: ลายนิ้วมือของข้อมูลในชีต ---------- */

const SYNC = {
  FP_KEY:  'data_fp',
  FP_SEC:  15            // แก้ในชีตแล้ว หน้าเว็บเห็นภายใน ~15 วินาที + รอบ polling ของหน้าเว็บ
};

/**
 * ค่า hash ของทุกเซลล์ใน Contract_Master + Payment_History + Receipt_Tracking
 * เปลี่ยนเมื่อมีใครแก้ชีต (ในชีตเอง หรือผ่านหน้าเว็บ) — หน้าเว็บเรียก getVersion เป็นระยะ
 */
function dataFingerprint_(src) {
  const cache = CacheService.getScriptCache();
  const hit = cache.get(SYNC.FP_KEY);
  if (hit) return hit;
  src = src || findDataSheet_();
  const ss = src.sheet.getParent();
  const parts = [src.sheet.getDataRange().getDisplayValues()];
  [CFG.SHEET_PAYMENT, CFG.SHEET_RECEIPT].forEach(function (n) {
    const sh = ss.getSheetByName(n);
    parts.push(sh && sh.getLastRow() ? sh.getDataRange().getDisplayValues() : []);
  });
  const raw = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_1, JSON.stringify(parts), Utilities.Charset.UTF_8
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

/* ---------- ตรวจคุณภาพข้อมูลรายแถว ---------- */

/** ช่องข้อความที่ควรตัดช่องว่างหัว-ท้าย (ใช้จัดกลุ่ม/กรอง/จับคู่ ถ้ามีช่องว่างเกินจะนับแยกกลุ่ม) */
const TRIM_FIELDS = ['company', 'mediaType', 'mediaSite', 'vendorName', 'contractNo', 'payStatus', 'memoInv', 'ecmNo'];

/** 'd/m/yyyy' ตามปีเดิมในเซลล์ (พ.ศ. คงเป็น พ.ศ.) — ใช้ตอนแก้วันที่ที่เขียนเป็น ด/ว/ป */
function swapDateText_(s) {
  const m = String(s).trim().match(/^(\d{1,2})([\/\-.])(\d{1,2})\2(\d{2,4})$/);
  return m ? (+m[3]) + '/' + (+m[1]) + '/' + m[4] : '';
}

function checkRow_(o, raw, disp, today) {
  const issues = [];
  const add = function (field, level, msg, fix, before) {
    const it = { field: field, level: level, msg: msg };
    if (fix) { it.fix = fix; it.before = before; }
    issues.push(it);
  };

  Object.keys(DATE_FIELDS).forEach(function (f) {
    const p = o._dates[f];
    if (!p) return;
    if (p.swapped) add(f, 'high', 'วันที่เขียนเป็น เดือน/วัน/ปี ("' + disp[f] + '") ควรเป็น วัน/เดือน/ปี', swapDateText_(disp[f]), disp[f]);
    else if (p.bad) add(f, 'high', 'อ่านเป็นวันที่ไม่ได้: "' + disp[f] + '"');
  });

  if (!o.amountMonth && !o.amountYear) add('amountMonth', 'high', 'ไม่มียอดค่าเช่า (Amount/Month และ Amount/Year ว่าง)');
  else if (o.freq === 'yearly' && o.amountMonth && !o.amountYear) add('amountYear', 'medium', 'Payment เป็นรายปี แต่ใส่ยอดไว้ในช่อง Amount/Month');
  else if (o.freq === 'monthly' && o.amountYear && !o.amountMonth) add('amountMonth', 'medium', 'Payment เป็นรายเดือน แต่ใส่ยอดไว้ในช่อง Amount/Year');

  if (!o.startDate || !o.endDate) add(!o.startDate ? 'startDate' : 'endDate', 'high', 'ไม่มีวันเริ่ม/วันสิ้นสุดสัญญา');
  else if (o.endDate < o.startDate) add('endDate', 'high', 'วันสิ้นสุดสัญญาอยู่ก่อนวันเริ่มสัญญา');

  ['sentDate', 'ecmSent'].forEach(function (f) {
    if (o[f] && o[f] > today) add(f, 'medium', 'วันที่ ' + disp[f] + ' ยังมาไม่ถึง — ปีอาจพิมพ์ผิด');
  });
  if (o.chequeDate && o.dueDate && Math.abs(daysBetween_(o.dueDate, o.chequeDate)) > 180) {
    add('chequeDate', 'medium', 'เช็คลงวันที่ ' + disp.chequeDate + ' ห่างจากวันชำระตามสัญญา ' + disp.dueDate + ' เกิน 180 วัน — ปีอาจพิมพ์ผิด');
  }
  if (o.payStatus === PAY_DONE && !o.memoInv && !o.ecmNo) add('memoInv', 'medium', 'สถานะเบิกแล้ว แต่ไม่มีเลข MEMO/INV และ ECM');
  if (o.payStatus && PAY_STATUSES.indexOf(o.payStatus) < 0) add('payStatus', 'medium', 'Status Payment ไม่ใช่ ' + PAY_STATUSES.join(' / '));

  Object.keys(VALUE_FIX).forEach(function (f) {
    const to = VALUE_FIX[f][clean_(raw[f])];
    if (to) add(f, 'low', 'สะกดผิด: "' + clean_(raw[f]) + '"', to, String(raw[f]));
  });
  TRIM_FIELDS.forEach(function (f) {
    const s = typeof raw[f] === 'string' ? raw[f] : '';
    if (s && s !== s.replace(/\s+/g, ' ').trim() && !(VALUE_FIX[f] && VALUE_FIX[f][clean_(s)])) {
      add(f, 'low', 'มีช่องว่างเกินหัว/ท้ายข้อความ ("' + s + '") — ทำให้จัดกลุ่มแยกกัน', s.replace(/\s+/g, ' ').trim(), s);
    }
  });
  return issues;
}

/* ---------- อ่านรายการค่าเช่าทั้งหมด (cache ใช้ได้ตราบที่ข้อมูลในชีตไม่เปลี่ยน) ---------- */

function readRentals_() {
  const cache = CacheService.getScriptCache();
  const src = findDataSheet_();
  const fp = dataFingerprint_(src);
  const hit = cache.get(CFG.CACHE_KEY);
  if (hit && cache.get(CFG.CACHE_KEY + '_fp') === fp) return JSON.parse(hit);

  const sh = src.sheet, map = src.map;
  const lastRow = sh.getLastRow();
  if (lastRow <= src.headerRow) return [];

  const range = sh.getRange(src.headerRow + 1, 1, lastRow - src.headerRow, sh.getLastColumn());
  const values = range.getValues();
  const shown = range.getDisplayValues();
  const today = todayISO_();
  const out = [];

  values.forEach(function (row, idx) {
    const get  = function (f) { return map[f] === undefined ? '' : row[map[f]]; };
    const show = function (f) { return map[f] === undefined ? '' : shown[idx][map[f]]; };
    if (!clean_(get('contractNo')) && !clean_(get('vendorName')) && !clean_(get('mediaSite'))) return;

    const o = { _row: src.headerRow + 1 + idx, _dates: {} };
    const raw = {}, disp = {};
    COLUMNS.forEach(function (c) {
      raw[c[0]] = get(c[0]);
      disp[c[0]] = String(show(c[0])).trim();
      o[c[0]] = clean_(disp[c[0]]);
    });
    Object.keys(VALUE_FIX).forEach(function (f) {
      if (VALUE_FIX[f][o[f]]) o[f] = VALUE_FIX[f][o[f]];
    });

    o.id = 'R' + o._row;
    Object.keys(DATE_FIELDS).forEach(function (f) {
      const p = parseDate_(get(f));
      o._dates[f] = p;
      o[f] = p.iso;
      o[f + 'Text'] = clean_(disp[f]);
    });
    NUMBER_FIELDS.forEach(function (f) { o[f] = toNumber_(get(f)); });

    // --- ยอดเงิน ---
    o.freq = freqOf_(o.payment);
    const m = o.amountMonth, y = o.amountYear;
    if (o.freq === 'monthly')        { o.installment = m || y;     o.annualCost = m ? m * 12 : y; }
    else if (o.freq === 'quarterly') { o.installment = m * 3 || y; o.annualCost = m ? m * 12 : y; }
    else if (o.freq === 'yearly')    { o.installment = y || m;     o.annualCost = y || m; }
    else                             { o.installment = m || y;     o.annualCost = m ? m * 12 : y; }
    o.installment += o.adjust;

    // --- วันที่ต้องจ่ายถัดไป ---
    const paid = o.payStatus === PAY_DONE;
    const dCheque = daysBetween_(today, o.chequeDate);
    if (!paid && o.dueDate)                             { o.payDate = o.dueDate;    o.payKind = 'due'; }
    else if (o.chequeDate && dCheque !== null && dCheque >= 0) { o.payDate = o.chequeDate; o.payKind = 'cheque'; }
    else                                                { o.payDate = '';           o.payKind = ''; }
    o.daysToPay = o.payDate ? daysBetween_(today, o.payDate) : null;

    if (o.daysToPay === null)                  o.payAlert = paid ? 'paid' : 'unknown';
    else if (o.daysToPay < 0)                  o.payAlert = 'overdue';
    else if (o.daysToPay <= 3)                 o.payAlert = 'due3';
    else if (o.daysToPay <= CFG.DUE_SOON_DAYS) o.payAlert = 'soon';
    else                                       o.payAlert = paid ? 'paid' : 'normal';

    // --- อายุสัญญา ---
    o.daysToExpire = daysBetween_(today, o.endDate);
    if (o.daysToExpire === null)                o.expireAlert = 'unknown';
    else if (o.daysToExpire < 0)                o.expireAlert = 'expired';
    else if (o.daysToExpire <= CFG.EXPIRE_DAYS) o.expireAlert = 'warning';
    else                                        o.expireAlert = 'normal';

    o.issues = checkRow_(o, raw, disp, today);
    delete o._dates;
    out.push(o);
  });

  try {
    cache.put(CFG.CACHE_KEY, JSON.stringify(out), CFG.CACHE_SEC);
    cache.put(CFG.CACHE_KEY + '_fp', fp, CFG.CACHE_SEC);
  } catch (e) { /* ข้อมูลเกิน 100KB — ข้าม cache อ่านชีตตรง */ }
  return out;
}
