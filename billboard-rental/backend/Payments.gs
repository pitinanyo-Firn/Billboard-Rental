/**
 * Payments.gs — บันทึกการเบิกจ่าย (Payment_History) + ติดตามใบเสร็จ (Receipt_Tracking)
 *
 * โครงสร้างชีตเหมือนระบบ Billboard ERP เดิม (ข้อมูลเดิมใช้ต่อได้ทันที):
 *   Payment_History : Timestamp | Vendor Name | Media Site | รอบดิว | ยอดที่ต้องจ่าย | ยอดที่จ่ายจริง | หมายเหตุ
 *   Receipt_Tracking: Timestamp | Vendor Name | Media Site | ยอดเงิน | สถานะใบเสร็จ
 *
 * ต่างจากเดิม:
 *   - ต้องล็อกอิน · บันทึก/แก้/ลบ เฉพาะ admin · ทุกการเขียนลงชีต Log
 *   - กันบันทึกซ้ำ (Vendor + Media Site + รอบดิว เดียวกัน) — ยืนยันซ้ำได้ด้วย force
 *   - ตรวจว่าแถวยังเป็นรายการเดิมก่อนแก้/ลบ (กันลบผิดแถวเมื่อมีคนแทรก/ลบแถวในชีต)
 */

function ensureSheet_(name, header) {
  const sh = getSheet_(name);
  if (sh.getLastRow() === 0) {
    sh.appendRow(header);
    sh.getRange(1, 1, 1, header.length).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function payKey_(vendor, site, month) {
  return [vendor, site, month].map(function (s) { return clean_(s).toLowerCase(); }).join('|');
}

/** อ่าน Payment_History — dup = รายการซ้ำกับแถวก่อนหน้า (Vendor + Media Site + รอบดิว) */
function readPayments_() {
  const sh = ss_().getSheetByName(CFG.SHEET_PAYMENT);
  if (!sh || sh.getLastRow() <= 1) return [];
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, PAYMENT_HEADER.length).getDisplayValues();
  const seen = {};
  const out = [];
  rows.forEach(function (r, i) {
    if (!clean_(r[1]) && !clean_(r[2])) return;
    const key = payKey_(r[1], r[2], r[3]);
    out.push({
      id: 'P' + (i + 2), timestamp: r[0], vendor: clean_(r[1]), site: clean_(r[2]), month: clean_(r[3]),
      expected: toNumber_(r[4]), actual: toNumber_(r[5]), remark: clean_(r[6]), dup: !!seen[key]
    });
    seen[key] = true;
  });
  return out.reverse();                       // ล่าสุดก่อน
}

function readReceipts_() {
  const sh = ss_().getSheetByName(CFG.SHEET_RECEIPT);
  if (!sh || sh.getLastRow() <= 1) return [];
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, RECEIPT_HEADER.length).getDisplayValues();
  const out = [];
  rows.forEach(function (r, i) {
    if (!clean_(r[1]) && !clean_(r[2])) return;
    out.push({ id: 'T' + (i + 2), timestamp: r[0], vendor: clean_(r[1]), site: clean_(r[2]),
               amount: toNumber_(r[3]), status: clean_(r[4]) || RECEIPT_STATUSES[0] });
  });
  return out.reverse();
}

function apiPayments_(token) {
  auth_(token);
  return { ok: true, payments: readPayments_(), receipts: readReceipts_() };
}

/** 'yyyy-MM' -> 'Sep-26' (รูปแบบเดียวกับคอลัมน์ รอบดิว / Month ในชีตเดิม) */
function monthLabel_(ym) {
  const m = String(ym || '').match(/^(\d{4})-(\d{2})$/);
  if (!m) return '';
  return Utilities.formatDate(new Date(+m[1], +m[2] - 1, 1), CFG.TZ, 'MMM-yy');
}

/**
 * บันทึกการเบิกจ่าย 1 รายการ (admin)
 * p: { id: 'R<row>', contractNo, month: 'yyyy-MM', actual, remark, markPaid, force }
 */
function apiRecordPayment_(token, p) {
  const me = authAdmin_(token);
  if (!me) return forbidden_('บันทึกการเบิกจ่าย');

  const rental = readRentals_().filter(function (d) { return d.id === p.id; })[0];
  if (!rental) return { ok: false, code: 'NOT_FOUND', message: 'ไม่พบรายการค่าเช่า' };
  if (p.contractNo !== undefined && clean_(p.contractNo) !== rental.contractNo) {
    return { ok: false, code: 'STALE', message: 'ข้อมูลในชีตมีการเปลี่ยนแปลง กรุณากด ↻ รีเฟรช แล้วลองใหม่' };
  }
  const month = monthLabel_(p.month);
  if (!month) return { ok: false, code: 'MISSING_FIELD', message: 'กรุณาเลือกรอบดิว (เดือน/ปี)' };
  const actual = Number(String(p.actual == null ? '' : p.actual).replace(/,/g, ''));
  if (!isFinite(actual) || actual <= 0) return { ok: false, code: 'INVALID_VALUE', message: 'ยอดที่จ่ายจริงต้องเป็นตัวเลขมากกว่า 0' };
  const remark = clean_(p.remark).slice(0, 300);

  const key = payKey_(rental.vendorName, rental.mediaSite, month);
  if (!p.force && readPayments_().some(function (x) { return payKey_(x.vendor, x.site, x.month) === key; })) {
    return { ok: false, code: 'DUPLICATE', message: 'มีการบันทึกจ่าย ' + rental.vendorName + ' รอบ ' + month + ' แล้ว — ยืนยันเพื่อบันทึกซ้ำ' };
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ts = Utilities.formatDate(new Date(), CFG.TZ, 'yyyy-MM-dd HH:mm:ss');
    const safe = function (s) { return /^[=+\-@]/.test(s) ? "'" + s : s; };
    ensureSheet_(CFG.SHEET_PAYMENT, PAYMENT_HEADER)
      .appendRow([ts, safe(rental.vendorName), safe(rental.mediaSite), "'" + month, rental.installment, actual, safe(remark)]);
    ensureSheet_(CFG.SHEET_RECEIPT, RECEIPT_HEADER)
      .appendRow([ts, safe(rental.vendorName), safe(rental.mediaSite), actual, RECEIPT_STATUSES[0]]);

    if (p.markPaid && rental.payStatus !== PAY_DONE) {
      const src = findDataSheet_();
      src.sheet.getRange(rental._row, src.map.payStatus + 1).setValue(PAY_DONE);
    }
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }

  invalidateData_();
  writeLog_(me.email, 'RECORD_PAYMENT', rental.contractNo + ' | ' + rental.vendorName + ' | ' + month + ' | ' + actual +
            (p.markPaid ? ' | Status Payment → ' + PAY_DONE : ''));
  return { ok: true, month: month };
}

/** หาแถวใน Receipt_Tracking + ตรวจว่ายังเป็นรายการเดิม */
function receiptRow_(p) {
  const row = parseInt(String(p.id || '').replace(/^T/, ''), 10);
  const sh = ss_().getSheetByName(CFG.SHEET_RECEIPT);
  if (!sh || !row || row < 2 || row > sh.getLastRow()) return { error: { ok: false, code: 'NOT_FOUND', message: 'ไม่พบรายการใบเสร็จ' } };
  const r = sh.getRange(row, 1, 1, RECEIPT_HEADER.length).getDisplayValues()[0];
  if (clean_(r[0]) !== clean_(p.timestamp) || clean_(r[1]) !== clean_(p.vendor)) {
    return { error: { ok: false, code: 'STALE', message: 'ข้อมูลในชีตมีการเปลี่ยนแปลง กรุณากด ↻ รีเฟรช แล้วลองใหม่' } };
  }
  return { sheet: sh, row: row, values: r };
}

/** เปลี่ยนสถานะใบเสร็จ (admin) — p: { id, timestamp, vendor, status } */
function apiUpdateReceipt_(token, p) {
  const me = authAdmin_(token);
  if (!me) return forbidden_('เปลี่ยนสถานะใบเสร็จ');
  if (RECEIPT_STATUSES.indexOf(p.status) < 0) {
    return { ok: false, code: 'INVALID_VALUE', message: 'สถานะต้องเป็น ' + RECEIPT_STATUSES.join(' / ') };
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  let before = '';
  try {
    const t = receiptRow_(p);
    if (t.error) return t.error;
    before = t.values[4];
    t.sheet.getRange(t.row, 5).setValue(p.status);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  invalidateData_();
  writeLog_(me.email, 'UPDATE_RECEIPT', p.vendor + ' | ' + p.timestamp + ' | "' + before + '" → "' + p.status + '"');
  return { ok: true, status: p.status };
}

/** ลบรายการติดตามใบเสร็จ (admin) — p: { id, timestamp, vendor } */
function apiDeleteReceipt_(token, p) {
  const me = authAdmin_(token);
  if (!me) return forbidden_('ลบรายการใบเสร็จ');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  let values = [];
  try {
    const t = receiptRow_(p);
    if (t.error) return t.error;
    values = t.values;
    t.sheet.deleteRow(t.row);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  invalidateData_();
  writeLog_(me.email, 'DELETE_RECEIPT', values.join(' | '));
  return { ok: true };
}
