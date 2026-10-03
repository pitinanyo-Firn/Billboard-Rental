/**
 * Accrued.gs — ค่าใช้จ่ายค้างจ่ายประจำเดือน (ส่งแผนกบัญชีทุกวันที่ 23)
 *
 * Accrued = เดือนนี้มีค่าใช้จ่ายเกิดขึ้นแล้วตาม Service Month แต่ยังไม่มี Transaction
 *
 * ชีต Accrued: 13 คอลัมน์แรก = ตาราง "Form Accrued" ของบัญชี (STT-BB-BUS-OTHER) ตรงตามไฟล์ Excel
 *   Line | Company | Department | VENDOR | Part Code | Part Description | Description & Period |
 *   Amount (ก่อน VAT) | Media Site Code | Media Site Name | ถึงบัญชี | หมายเหตุ | Email ผู้ส่งข้อมูล
 * ต่อท้ายด้วยคอลัมน์ติดตาม: Service Month (Sep-26) | Timestamp | บันทึกโดย
 * Line = ลำดับภายใน Service Month เดียวกัน (ระบบเรียงเลขใหม่ให้เมื่อเพิ่ม/ลบ/ย้ายเดือน)
 */

const ACCRUED_FORM = ['Line', 'Company', 'Department', 'VENDOR', 'Part Code', 'Part Description',
                      'Description & Period', 'Amount (ก่อน VAT)', 'Media Site Code', 'Media Site Name',
                      'ถึงบัญชี', 'หมายเหตุ', 'Email ผู้ส่งข้อมูล'];
const ACCRUED_HEADER = ACCRUED_FORM.concat(['Service Month', 'Timestamp', 'บันทึกโดย']);
const ACCRUED_FIELDS = ['line', 'company', 'department', 'vendor', 'partCode', 'partDesc',
                        'desc', 'amount', 'siteCode', 'siteName', 'toAccount', 'note', 'email'];
/** ความกว้างคอลัมน์ตามไฟล์ Form Accrued (หน่วยตัวอักษรของ Excel) */
const ACCRUED_WIDTHS = [7.09, 10.82, 24.36, 43, 18, 53.73, 88.45, 18.18, 21.64, 48.55, 30.18, 78.55, 25.36, 12, 18, 25];
const ACCRUED_AMOUNT_FMT = '_-* #,##0.00_-;-* #,##0.00_-;_-* "-"??_-;_-@_-';
const ACCRUED = {
  DAY:         23,                                  // วันส่ง Accrued ให้บัญชีทุกเดือน
  COMPANY:     'PB',
  DEPARTMENT:  'BD & Asset Management',
  TO_ACCOUNT:  'ponprom.ch@planbmedia.co.th'
};
const MON3_ = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 'Sep-26' | '2026-09' | Date → '2026-09' ('' ถ้าอ่านไม่ได้) */
function accruedMonthKey_(v) {
  if (isDate_(v)) return isNaN(v) ? '' : Utilities.formatDate(v, CFG.TZ, 'yyyy-MM');
  const s = String(v == null ? '' : v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})$/);
  if (m && +m[2] >= 1 && +m[2] <= 12) return m[1] + '-' + ('0' + (+m[2])).slice(-2);
  m = s.match(/^([A-Za-z]{3})[\s\-]?(\d{2}|\d{4})$/);
  if (m) {
    const i = MON3_.map(function (x) { return x.toLowerCase(); }).indexOf(m[1].toLowerCase());
    if (i > -1) return (m[2].length === 2 ? '20' + m[2] : m[2]) + '-' + ('0' + (i + 1)).slice(-2);
  }
  return '';
}

/** '2026-09' → 'Sep-26' (รูปแบบเดียวกับคอลัมน์ Month ของ Contract_Master) */
function accruedMonthLabel_(key) {
  return MON3_[+key.slice(5, 7) - 1] + '-' + key.slice(2, 4);
}

/** สร้างชีต Accrued + จัดรูปแบบหัวตารางให้เหมือน Form Accrued ของบัญชี */
function ensureAccruedSheet_() {
  const sh = getSheet_(CFG.SHEET_ACCRUED);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, ACCRUED_HEADER.length).setValues([ACCRUED_HEADER]);
    sh.getRange(1, 1, 1, ACCRUED_FORM.length)
      .setFontFamily('Calibri').setFontSize(11).setFontWeight('bold')
      .setBackground('#DDEBF7').setHorizontalAlignment('center').setVerticalAlignment('middle')
      .setBorder(true, true, true, true, true, true);
    sh.getRange(1, ACCRUED_FORM.length + 1, 1, ACCRUED_HEADER.length - ACCRUED_FORM.length)
      .setFontWeight('bold').setBackground('#F3F4F6').setHorizontalAlignment('center');
    sh.setRowHeight(1, 31);
    ACCRUED_WIDTHS.forEach(function (w, i) { sh.setColumnWidth(i + 1, Math.round(w * 7 + 5)); });
    sh.getRange('N:N').setNumberFormat('@');            // Service Month เก็บเป็นข้อความ กันชีตแปลงเป็นวันที่
    sh.setFrozenRows(1);
  }
  return sh;
}

/** แถวทั้งหมดในชีต Accrued (ไม่รวม header) */
function accruedRows_() {
  const sh = ensureAccruedSheet_();
  const last = sh.getLastRow();
  return {
    sheet: sh,
    rows: last > 1 ? sh.getRange(2, 1, last - 1, ACCRUED_HEADER.length).getValues() : []
  };
}

function accruedItem_(r, row) {
  const o = { id: 'A' + row, _row: row };
  ACCRUED_FIELDS.forEach(function (f, i) { o[f] = i === 7 ? toNumber_(r[i]) : clean_(r[i]); });
  o.line = parseInt(r[0], 10) || 0;
  o.month = accruedMonthKey_(r[13]);
  o.monthLabel = o.month ? accruedMonthLabel_(o.month) : clean_(r[13]);
  o.ts = isDate_(r[14]) ? Utilities.formatDate(r[14], CFG.TZ, 'yyyy-MM-dd HH:mm') : clean_(r[14]);
  o.by = clean_(r[15]);
  return o;
}

/** รายการ Accrued ทั้งหมด เรียงตามเดือน (ใหม่ก่อน) แล้วตาม Line */
function readAccrued_() {
  return accruedRows_().rows
    .map(function (r, i) { return accruedItem_(r, i + 2); })
    .filter(function (o) { return o.vendor || o.desc || o.amount; })
    .sort(function (a, b) {
      return a.month !== b.month ? (a.month < b.month ? 1 : -1) : (a.line - b.line) || (a._row - b._row);
    });
}

/** เรียงเลข Line ใหม่ 1..n ของเดือนที่ระบุ (ตามลำดับ Line เดิม แล้วตามแถว) */
function renumberAccrued_(sh, monthKey) {
  const last = sh.getLastRow();
  if (last < 2) return;
  const vals = sh.getRange(2, 1, last - 1, ACCRUED_HEADER.length).getValues();
  const rows = [];
  vals.forEach(function (r, i) {
    if (accruedMonthKey_(r[13]) === monthKey) rows.push({ row: i + 2, line: parseInt(r[0], 10) || 9999 });
  });
  rows.sort(function (a, b) { return (a.line - b.line) || (a.row - b.row); });
  rows.forEach(function (x, i) { if (x.line !== i + 1) sh.getRange(x.row, 1).setValue(i + 1); });
}

/** ตรวจ + ทำความสะอาดข้อมูล 1 รายการจากหน้าเว็บ → { values } หรือ { error } */
function accruedValues_(it, me) {
  const safe = function (s) { return /^[=+\-@]/.test(s) ? "'" + s : s; };
  const txt = function (k, max) { return safe(clean_(it[k]).slice(0, max || 300)); };
  const vendor = txt('vendor', 200);
  const desc = txt('desc', 500);
  const amount = Math.round(toNumber_(it.amount) * 100) / 100;
  if (!vendor) return { error: 'กรุณากรอก VENDOR' };
  if (!desc)   return { error: 'กรุณากรอก Description & Period' };
  if (!(amount > 0) && !(amount < 0)) return { error: 'กรุณากรอก Amount (ก่อน VAT)' };
  return {
    values: [
      txt('company', 50) || ACCRUED.COMPANY,
      txt('department', 100) || ACCRUED.DEPARTMENT,
      vendor, txt('partCode', 60), txt('partDesc', 300), desc, amount,
      txt('siteCode', 100), txt('siteName', 300),
      txt('toAccount', 200) || ACCRUED.TO_ACCOUNT,
      txt('note', 500),
      txt('email', 200) || String(me.email || '')
    ]
  };
}

/** แถวสุดท้ายของเดือนนั้นในชีต (0 ถ้ายังไม่มี) + Line สูงสุด */
function accruedMonthTail_(rows, monthKey) {
  let lastRow = 0, maxLine = 0;
  rows.forEach(function (r, i) {
    if (accruedMonthKey_(r[13]) !== monthKey) return;
    lastRow = i + 2;
    maxLine = Math.max(maxLine, parseInt(r[0], 10) || 0);
  });
  return { lastRow: lastRow, maxLine: maxLine };
}

/** เขียนแถว Accrued ตั้งแต่แถว at พร้อมจัดรูปแบบให้เหมือน Form ของบัญชี */
function writeAccruedRows_(sh, at, out) {
  const n = out.length;
  sh.getRange(at, 14, n, 1).setNumberFormat('@');
  sh.getRange(at, 1, n, ACCRUED_HEADER.length).setValues(out);
  sh.getRange(at, 1, n, ACCRUED_FORM.length)
    .setFontFamily('Calibri').setFontSize(11).setFontWeight('normal').setBackground(null)
    .setHorizontalAlignment(null).setBorder(true, true, true, true, true, true);
  sh.getRange(at, 1, n, 1).setHorizontalAlignment('center');
  sh.getRange(at, 8, n, 1).setNumberFormat(ACCRUED_AMOUNT_FMT);
  sh.getRange(at, 15, n, 1).setNumberFormat('dd/MM/yyyy HH:mm');
}

function apiAccrued_(token) {
  auth_(token);
  return { ok: true, accrued: readAccrued_(), day: ACCRUED.DAY };
}

/**
 * เพิ่มรายการ Accrued (admin) — p: { month: 'yyyy-MM', items: [{ company, department, vendor, partCode,
 *   partDesc, desc, amount, siteCode, siteName, toAccount, note, email }] }  (หรือส่ง field ของรายการเดียวมาตรง ๆ)
 * แทรกต่อท้ายกลุ่มเดือนเดียวกันในชีต Line ต่อจากเลขสุดท้ายของเดือนนั้น
 */
function apiAddAccrued_(token, p) {
  const me = authAdmin_(token);
  if (!me) return forbidden_('เพิ่มรายการ Accrued');
  const month = accruedMonthKey_(p.month);
  if (!month) return { ok: false, code: 'MISSING_FIELD', message: 'กรุณาเลือก Service Month' };
  let items = p.items;
  if (typeof items === 'string') { try { items = JSON.parse(items); } catch (e) { items = null; } }
  if (!Array.isArray(items)) items = [p];
  if (!items.length) return { ok: false, code: 'MISSING_FIELD', message: 'ไม่มีรายการที่จะเพิ่ม' };
  if (items.length > 200) return { ok: false, code: 'INVALID_VALUE', message: 'เพิ่มได้ครั้งละไม่เกิน 200 รายการ' };

  const vals = [];
  for (let i = 0; i < items.length; i++) {
    const v = accruedValues_(items[i] || {}, me);
    if (v.error) return { ok: false, code: 'MISSING_FIELD', message: (items.length > 1 ? 'รายการที่ ' + (i + 1) + ': ' : '') + v.error };
    vals.push(v.values);
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const src = accruedRows_();
    const sh = src.sheet;
    const tail = accruedMonthTail_(src.rows, month);
    const label = accruedMonthLabel_(month);
    const now = new Date();
    const out = vals.map(function (v, i) { return [tail.maxLine + i + 1].concat(v, [label, now, me.email]); });

    let at;
    if (tail.lastRow) {
      sh.insertRowsAfter(tail.lastRow, out.length);
      at = tail.lastRow + 1;
    } else {
      at = Math.max(sh.getLastRow(), 1) + 1;
    }
    writeAccruedRows_(sh, at, out);
    SpreadsheetApp.flush();
    invalidateData_();

    writeLog_(me.email, 'ADD_ACCRUED', label + ' | ' + out.map(function (r) {
      return 'L' + r[0] + ' ' + r[3] + ' ' + r[7];
    }).join(' ; '));
    return { ok: true, added: out.length, month: month };
  } finally {
    lock.releaseLock();
  }
}

/** ตรวจว่าแถว A<row> ยังเป็นรายการเดิม (VENDOR + Service Month ตรงกัน) — คืน { sh, row, cur } หรือ { error } */
function accruedTarget_(p) {
  const row = parseInt(String(p.id || '').replace(/^A/, ''), 10);
  const src = accruedRows_();
  if (!row || row < 2 || row - 2 >= src.rows.length) {
    return { error: { ok: false, code: 'NOT_FOUND', message: 'ไม่พบรายการ Accrued' } };
  }
  const cur = src.rows[row - 2];
  if (clean_(cur[3]) !== clean_(p.origVendor) || accruedMonthKey_(cur[13]) !== accruedMonthKey_(p.origMonth)) {
    return { error: { ok: false, code: 'STALE', message: 'รายการนี้ถูกแก้ไขในชีตแล้ว กรุณากด ↻ รีเฟรช แล้วลองใหม่' } };
  }
  return { sh: src.sheet, row: row, cur: cur, rows: src.rows };
}

/** แก้ไขรายการ Accrued (admin) — p: { id: 'A<row>', origVendor, origMonth, month, ...fields } */
function apiUpdateAccrued_(token, p) {
  const me = authAdmin_(token);
  if (!me) return forbidden_('แก้ไขรายการ Accrued');
  const month = accruedMonthKey_(p.month);
  if (!month) return { ok: false, code: 'MISSING_FIELD', message: 'กรุณาเลือก Service Month' };
  const v = accruedValues_(p, me);
  if (v.error) return { ok: false, code: 'MISSING_FIELD', message: v.error };

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const t = accruedTarget_(p);
    if (t.error) return t.error;
    const oldMonth = accruedMonthKey_(t.cur[13]);
    const moved = oldMonth !== month;
    const tail = accruedMonthTail_(t.rows, month);
    const line = moved ? tail.maxLine + 1 : (parseInt(t.cur[0], 10) || 1);
    const out = [[line].concat(v.values, [accruedMonthLabel_(month), new Date(), me.email])];
    let row = t.row;
    if (!moved) {
      t.sh.getRange(row, 14).setNumberFormat('@');
      t.sh.getRange(row, 1, 1, ACCRUED_HEADER.length).setValues(out);
      t.sh.getRange(row, 8).setNumberFormat(ACCRUED_AMOUNT_FMT);
    } else {
      // ย้ายแถวไปต่อท้ายกลุ่มเดือนใหม่ ให้ชีตเรียงตามเดือนเหมือน Form ของบัญชี
      let at, old = t.row;
      if (tail.lastRow) {
        t.sh.insertRowsAfter(tail.lastRow, 1);
        at = tail.lastRow + 1;
        if (old >= at) old++;
      } else {
        at = t.sh.getLastRow() + 1;
      }
      writeAccruedRows_(t.sh, at, out);
      t.sh.deleteRow(old);
      row = at > old ? at - 1 : at;
      if (oldMonth) renumberAccrued_(t.sh, oldMonth);
    }
    SpreadsheetApp.flush();
    invalidateData_();

    const changes = [];
    v.values.forEach(function (x, i) {
      if (String(x) !== String(t.cur[i + 1])) changes.push(ACCRUED_FORM[i + 1] + ': ' + t.cur[i + 1] + ' → ' + x);
    });
    if (moved) changes.push('Service Month: ' + accruedMonthLabel_(oldMonth || month) + ' → ' + accruedMonthLabel_(month));
    writeLog_(me.email, 'UPDATE_ACCRUED', 'A' + t.row + ' ' + v.values[2] + ' | ' + (changes.join(' ; ') || 'ไม่มีการเปลี่ยนแปลง'));
    return { ok: true, id: 'A' + row };
  } finally {
    lock.releaseLock();
  }
}

/** ลบรายการ Accrued (admin) — p: { id: 'A<row>', origVendor, origMonth } แล้วเรียง Line ของเดือนนั้นใหม่ */
function apiDeleteAccrued_(token, p) {
  const me = authAdmin_(token);
  if (!me) return forbidden_('ลบรายการ Accrued');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const t = accruedTarget_(p);
    if (t.error) return t.error;
    t.sh.deleteRow(t.row);
    const month = accruedMonthKey_(t.cur[13]);
    if (month) renumberAccrued_(t.sh, month);
    SpreadsheetApp.flush();
    invalidateData_();
    writeLog_(me.email, 'DELETE_ACCRUED', (month ? accruedMonthLabel_(month) : '') + ' | ' +
              t.cur.slice(0, ACCRUED_FORM.length).join(' | '));
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/**
 * รันจาก editor ครั้งเดียว: สร้างชีต Accrued + นำเข้า 4 รายการจากไฟล์
 * "Accrued (STT-BB-BUS-OTHER)_20260922.xlsx" (Service Month Sep-26) — ข้ามถ้าเดือนนั้นมีข้อมูลแล้ว
 */
function setupAccrued() {
  const src = accruedRows_();
  if (accruedMonthTail_(src.rows, '2026-09').lastRow) {
    Logger.log('ชีต Accrued มีข้อมูล Sep-26 อยู่แล้ว — ไม่นำเข้าซ้ำ');
    return;
  }
  const by = 'jiraporn@planbmedia.co.th';
  const items = [
    ['บริษัท ทางด่วนและรถไฟฟ้ากรุงเทพ จำกัด (มหาชน)', 'AM-A02002-0001', 'ค่าเช่าพื้นที่โฆษณา Gateway Billboard',
     'ค่าเช่าพื้นที่โฆษณา Gateway Billboard ประชาชื่นขาเข้าและประชาชื่นขาออก  1-30 กันยายน 2569', 311040,
     'A02002-000-BECL', 'Gateway billboard BECL',
     'PR / ประชาชื่นขาเข้าและประชาชื่นขาออก  **ค่าเช่าพื้นที่ติดตั้งป้ายต่อวัน  10,368.00 บาท/วัน**'],
    ['บริษัท ซีเอ็มวายเค มีเดีย จำกัด', 'AM-A02003-0012', 'ค่าสิทธิในการบริหารจัดการ Uni Pole',
     'ค่าสิทธิในการบริหารจัดการ Uni Pole ทางด่วนศรีรัช - สาธุประดิษฐ์ มุ่งหน้าถนนพระราม 4 _ 1-30 กันยายน 2569', 80000,
     'A02003-BKK-PRW05', 'ทางด่วนศรีรัช - สาธุประดิษฐ์ มุ่งหน้าถนนพระราม 4', 'Ref. PR2608118'],
    ['บริษัท แม็กซ์วิว มีเดีย กรุ๊ป จำกัด', 'AM-A02003-0005', 'ค่าเช่าพื้นที่โฆษณา Uni Pole',
     'ค่าเช่าพื้นที่โฆษณา Uni Pole ศูนย์การประชุมแห่งชาติสิริกิติ์  1-30 กันยายน 2569', 130000,
     'A02003-BKK-WAT00', 'ศูนย์การประชุมแห่งชาติสิริกิติ์', ''],
    ['บริษัท บี เอ็น โอ กรุ๊ป จำกัด', 'AM-A02003-0012', 'ค่าสิทธิในการบริหารจัดการ Uni Pole',
     'ค่าสิทธิในการบริหารจัดการ Uni Pole  1-30 กันยายน 2569', 40000,
     'A02003-BKK-HKW14', 'ถ.เพชรบุรี ขาเข้า มุ่งหน้าแยกอโศก', 'Ref.สัญญา PB2026/210 (ข้อ3.2 ติดตั้งสินค้าในเครือ)']
  ].map(function (x) {
    return { vendor: x[0], partCode: x[1], partDesc: x[2], desc: x[3], amount: x[4],
             siteCode: x[5], siteName: x[6], note: x[7], email: by };
  });
  // เขียนตรงด้วยสิทธิ์เจ้าของสคริปต์ (ไม่ผ่าน token)
  const me = { email: by, role: 'admin' };
  const tk = 'setup-' + Utilities.getUuid();
  CacheService.getScriptCache().put('tk_' + tk, JSON.stringify(me), 60);
  const r = apiAddAccrued_(tk, { month: '2026-09', items: items });
  CacheService.getScriptCache().remove('tk_' + tk);
  Logger.log(JSON.stringify(r));
}
