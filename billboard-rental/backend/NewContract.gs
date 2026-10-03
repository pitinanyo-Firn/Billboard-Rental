/**
 * NewContract.gs — แท็บ "New Contract": บันทึกสัญญาใหม่ลงชีต New_Contract
 *
 * ชีต New_Contract:
 *   Timestamp | Company | Supplier | Vendor No. | PR Number | PO Number |
 *   Start Contract | End Contract | Contract No. | Payment | บันทึกโดย
 *
 * - วันที่เขียนเป็นข้อความ d/m/yyyy พ.ศ. ให้ตรงกับคอลัมน์ Start/End Contract ใน Contract_Master
 * - เพิ่ม/ลบ เฉพาะ admin · ทุกคนที่ล็อกอินดูรายการได้ · บันทึกทุกครั้งลงชีต Log
 */

const NC_SHEET = 'New_Contract';
const NC_HEADER = ['Timestamp', 'Company', 'Supplier', 'Vendor No.', 'PR Number', 'PO Number',
                   'Start Contract', 'End Contract', 'Contract No.', 'Payment', 'บันทึกโดย'];
const NC_PAYMENTS = ['รายเดือน', 'รายปี', 'ราย 3 เดือน'];

function ncSheet_() {
  const sh = ensureSheet_(NC_SHEET, NC_HEADER);
  sh.getRange(1, 1, 1, NC_HEADER.length).setBackground('#E4002B').setFontColor('#FFFFFF');
  return sh;
}

function readNewContracts_() {
  const sh = ss_().getSheetByName(NC_SHEET);
  if (!sh || sh.getLastRow() <= 1) return [];
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, NC_HEADER.length).getDisplayValues();
  const out = [];
  rows.forEach(function (r, i) {
    if (!clean_(r[1]) && !clean_(r[8])) return;
    out.push({
      id: 'N' + (i + 2), timestamp: r[0], company: clean_(r[1]), supplier: clean_(r[2]), vendorNo: clean_(r[3]),
      pr: clean_(r[4]), po: clean_(r[5]), startText: clean_(r[6]), endText: clean_(r[7]),
      startDate: toISODate_(r[6]), endDate: toISODate_(r[7]), contractNo: clean_(r[8]), payment: clean_(r[9]), by: clean_(r[10])
    });
  });
  return out.reverse();                       // ล่าสุดก่อน
}

function apiNewContracts_(token) {
  auth_(token);
  if (!ss_().getSheetByName(NC_SHEET)) ncSheet_();    // สร้างแท็บในชีตตั้งแต่เปิดหน้าครั้งแรก
  return { ok: true, list: readNewContracts_(), payments: NC_PAYMENTS };
}

/** p: { company, supplier, vendorNo, pr, po, startDate, endDate, contractNo, payment, force } — วันที่ 'yyyy-MM-dd' */
function apiAddNewContract_(token, p) {
  const me = authAdmin_(token);
  if (!me) return forbidden_('เพิ่มสัญญาใหม่');

  const f = {};
  ['company', 'supplier', 'vendorNo', 'pr', 'po', 'contractNo', 'payment'].forEach(function (k) {
    f[k] = clean_(p[k]).slice(0, 200);
  });
  const errors = {};
  if (!f.company)    errors.company = 'กรุณากรอกบริษัท';
  if (!f.supplier)   errors.supplier = 'กรุณากรอก Supplier';
  if (!f.contractNo) errors.contractNo = 'กรุณากรอก Contract No.';
  if (NC_PAYMENTS.indexOf(f.payment) < 0) errors.payment = 'กรุณาเลือก ' + NC_PAYMENTS.join(' / ');
  const iso = function (s) { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m && iso_(+m[1], +m[2], +m[3]) ? s : ''; };
  const start = iso(p.startDate), end = iso(p.endDate);
  if (!start) errors.startDate = 'กรุณาเลือกวันเริ่มสัญญา';
  if (!end)   errors.endDate = 'กรุณาเลือกวันสิ้นสุดสัญญา';
  if (start && end && end < start) errors.endDate = 'วันสิ้นสุดต้องไม่ก่อนวันเริ่มสัญญา';
  if (Object.keys(errors).length) return { ok: false, code: 'INVALID_VALUE', message: 'ข้อมูลบางช่องไม่ถูกต้อง', errors: errors };

  // กันบันทึกซ้ำ: Contract No. + Supplier เดียวกัน (ทั้งใน New_Contract และ Contract_Master)
  const key = (f.contractNo + '|' + f.supplier).toLowerCase();
  const dupNew = readNewContracts_().some(function (x) { return (x.contractNo + '|' + x.supplier).toLowerCase() === key; });
  const dupMaster = readRentals_().some(function (d) { return (d.contractNo + '|' + d.vendorName).toLowerCase() === key; });
  if ((dupNew || dupMaster) && !p.force) {
    return { ok: false, code: 'DUPLICATE',
             message: 'มีสัญญา ' + f.contractNo + ' ของ ' + f.supplier + ' อยู่แล้วใน' + (dupNew ? ' New_Contract' : ' Contract_Master') + ' — ยืนยันเพื่อบันทึกซ้ำ' };
  }

  const safe = function (s) { return /^[=+\-@]/.test(s) ? "'" + s : s; };
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = ncSheet_();
    sh.appendRow([
      Utilities.formatDate(new Date(), CFG.TZ, 'yyyy-MM-dd HH:mm:ss'),
      safe(f.company), safe(f.supplier), "'" + f.vendorNo, safe(f.pr), safe(f.po),
      "'" + sheetDateText_(start, 'BE'), "'" + sheetDateText_(end, 'BE'),
      safe(f.contractNo), f.payment, me.email
    ]);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  writeLog_(me.email, 'NEW_CONTRACT', f.contractNo + ' | ' + f.company + ' | ' + f.supplier + ' | ' + f.payment + ' | ' + start + ' → ' + end);
  return { ok: true, list: readNewContracts_() };
}

/** ลบรายการ (admin) — p: { id: 'N<row>', contractNo } ตรวจเลขสัญญาในแถวก่อนลบ */
function apiDeleteNewContract_(token, p) {
  const me = authAdmin_(token);
  if (!me) return forbidden_('ลบสัญญาใหม่');
  const row = parseInt(String(p.id || '').replace(/^N/, ''), 10);
  const sh = ss_().getSheetByName(NC_SHEET);
  if (!sh || !row || row < 2 || row > sh.getLastRow()) return { ok: false, code: 'NOT_FOUND', message: 'ไม่พบรายการ' };
  const vals = sh.getRange(row, 1, 1, NC_HEADER.length).getDisplayValues()[0];
  if (clean_(vals[8]) !== clean_(p.contractNo)) {
    return { ok: false, code: 'STALE', message: 'ข้อมูลในชีตเปลี่ยนไปแล้ว กรุณากด ↻ รีเฟรช แล้วลองใหม่' };
  }
  sh.deleteRow(row);
  writeLog_(me.email, 'DELETE_NEW_CONTRACT', vals.join(' | '));
  return { ok: true, list: readNewContracts_() };
}
