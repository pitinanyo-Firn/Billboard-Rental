/**
 * NewContract.gs — แท็บ "New Contract": บันทึกสัญญาใหม่ลงชีต New_Contract
 *
 * ส่วนที่ 1 ข้อมูลบริษัทและเอกสาร · ส่วนที่ 2 Location / Expense Period (เพิ่มได้หลาย Location)
 * 1 Location = 1 แถวในชีต (ข้อมูลส่วนที่ 1 ซ้ำทุกแถว) · แถวที่บันทึกพร้อมกันมี Timestamp + Contract No. เดียวกัน
 *
 * ชีต New_Contract:
 *   Timestamp | Company | Supplier | Vendor No. | PR Number | PO Number | Start Contract | End Contract |
 *   Contract No. | Payment | บันทึกโดย | Media Type | Media Site | Epicore Code | Part Code | Part Description | Contractual Rent
 *
 * - วันที่เขียนเป็นข้อความ d/m/yyyy พ.ศ. ให้ตรงกับคอลัมน์ Start/End Contract ใน Contract_Master
 * - เพิ่ม/ลบ เฉพาะ admin · ทุกคนที่ล็อกอินดูรายการได้ · บันทึกทุกครั้งลงชีต Log
 */

const NC_SHEET = 'New_Contract';
const NC_HEADER = ['Timestamp', 'Company', 'Supplier', 'Vendor No.', 'PR Number', 'PO Number',
                   'Start Contract', 'End Contract', 'Contract No.', 'Payment', 'บันทึกโดย',
                   'Media Type', 'Media Site', 'Epicore Code', 'Part Code', 'Part Description', 'Contractual Rent'];
const NC_PAYMENTS = ['รายเดือน', 'รายปี', 'ราย 3 เดือน'];
const NC_MAX_LOCATIONS = 30;

/** ชีต + หัวคอลัมน์ (ชีตเดิมที่มี 11 คอลัมน์จะถูกเติมหัวคอลัมน์ Location ให้) */
function ncSheet_() {
  const sh = ensureSheet_(NC_SHEET, NC_HEADER);
  const cur = sh.getRange(1, 1, 1, NC_HEADER.length).getDisplayValues()[0];
  if (cur.join('|') !== NC_HEADER.join('|')) sh.getRange(1, 1, 1, NC_HEADER.length).setValues([NC_HEADER]);
  sh.getRange(1, 1, 1, NC_HEADER.length).setFontWeight('bold').setBackground('#E4002B').setFontColor('#FFFFFF');
  return sh;
}

/** รายการสัญญาใหม่ — รวมแถวที่บันทึกพร้อมกัน (Timestamp + Contract No.) เป็น 1 สัญญา */
function readNewContracts_() {
  const sh = ss_().getSheetByName(NC_SHEET);
  if (!sh || sh.getLastRow() <= 1) return [];
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, NC_HEADER.length).getDisplayValues();
  const map = {}, order = [];
  rows.forEach(function (r, i) {
    if (!clean_(r[1]) && !clean_(r[8])) return;
    const key = r[0] + '|' + clean_(r[8]);
    if (!map[key]) {
      map[key] = {
        id: 'N' + (i + 2), timestamp: r[0], company: clean_(r[1]), supplier: clean_(r[2]), vendorNo: clean_(r[3]),
        pr: clean_(r[4]), po: clean_(r[5]), startText: clean_(r[6]), endText: clean_(r[7]),
        startDate: toISODate_(r[6]), endDate: toISODate_(r[7]), contractNo: clean_(r[8]), payment: clean_(r[9]),
        by: clean_(r[10]), locations: [], totalRent: 0
      };
      order.push(key);
    }
    const c = map[key];
    if (clean_(r[11]) || clean_(r[12]) || clean_(r[16])) {
      const rent = toNumber_(r[16]);
      c.locations.push({ mediaType: clean_(r[11]), mediaSite: clean_(r[12]), epicoreCode: clean_(r[13]),
                         partCode: clean_(r[14]), partDesc: clean_(r[15]), rent: rent });
      c.totalRent += rent;
    }
  });
  return order.map(function (k) { return map[k]; }).reverse();      // ล่าสุดก่อน
}

function apiNewContracts_(token) {
  auth_(token);
  ncSheet_();                                   // สร้าง/อัปเดตหัวคอลัมน์ในชีตตั้งแต่เปิดหน้าครั้งแรก
  return { ok: true, list: readNewContracts_(), payments: NC_PAYMENTS };
}

/**
 * p: { company, supplier, vendorNo, pr, po, startDate, endDate, contractNo, payment, force,
 *      locations: [{ mediaType, mediaSite, epicoreCode, partCode, partDesc, rent }] }  — วันที่ 'yyyy-MM-dd'
 */
function apiAddNewContract_(token, p) {
  const me = authAdmin_(token);
  if (!me) return forbidden_('เพิ่มสัญญาใหม่');

  const f = {};
  ['company', 'supplier', 'vendorNo', 'pr', 'po', 'contractNo', 'payment'].forEach(function (k) {
    f[k] = clean_(p[k]).slice(0, 200);
  });
  const errors = {};
  if (!f.company)    errors.company = 'กรุณากรอกบริษัท';
  if (!f.supplier)   errors.supplier = 'กรุณากรอกผู้ขาย / Supplier';
  if (!f.contractNo) errors.contractNo = 'กรุณากรอก Contract No.';
  if (NC_PAYMENTS.indexOf(f.payment) < 0) errors.payment = 'กรุณาเลือก ' + NC_PAYMENTS.join(' / ');
  const iso = function (s) { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m && iso_(+m[1], +m[2], +m[3]) ? s : ''; };
  const start = iso(p.startDate), end = iso(p.endDate);
  if (!start) errors.startDate = 'กรุณาเลือกวันเริ่มสัญญา';
  if (!end)   errors.endDate = 'กรุณาเลือกวันสิ้นสุดสัญญา';
  if (start && end && end < start) errors.endDate = 'วันสิ้นสุดต้องไม่ก่อนวันเริ่มสัญญา';

  // ส่วนที่ 2: Location
  const locs = (Array.isArray(p.locations) ? p.locations : []).slice(0, NC_MAX_LOCATIONS).map(function (l, i) {
    const o = {};
    ['mediaType', 'mediaSite', 'epicoreCode', 'partCode', 'partDesc'].forEach(function (k) { o[k] = clean_(l && l[k]).slice(0, 300); });
    const rawRent = String(l && l.rent != null ? l.rent : '').replace(/,/g, '').trim();
    o.rent = rawRent === '' ? 0 : Number(rawRent);
    if (!o.mediaType) errors['loc' + i + '.mediaType'] = 'กรุณากรอก Media Type';
    if (!o.mediaSite) errors['loc' + i + '.mediaSite'] = 'กรุณากรอก Media Site';
    if (!isFinite(o.rent) || o.rent < 0) errors['loc' + i + '.rent'] = 'ค่าเช่าต้องเป็นตัวเลขไม่ติดลบ';
    return o;
  });
  if (!locs.length) errors.locations = 'กรุณาเพิ่ม Location อย่างน้อย 1 รายการ';
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
  const ts = Utilities.formatDate(new Date(), CFG.TZ, 'yyyy-MM-dd HH:mm:ss');
  const head = [ts, safe(f.company), safe(f.supplier), "'" + f.vendorNo, safe(f.pr), safe(f.po),
                "'" + sheetDateText_(start, 'BE'), "'" + sheetDateText_(end, 'BE'), safe(f.contractNo), f.payment, me.email];
  const rows = locs.map(function (l) {
    return head.concat([safe(l.mediaType), safe(l.mediaSite), "'" + l.epicoreCode, "'" + l.partCode, safe(l.partDesc), l.rent]);
  });

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = ncSheet_();
    const at = sh.getLastRow() + 1;
    // คอลัมน์รหัส/วันที่เก็บเป็นข้อความ (กันเลข 000123 หายศูนย์ และวันที่ถูกแปลงตาม locale)
    [4, 7, 8, 14, 15].forEach(function (c) { sh.getRange(at, c, rows.length, 1).setNumberFormat('@'); });
    sh.getRange(at, 1, rows.length, NC_HEADER.length).setValues(rows.map(function (r) {
      return r.map(function (v) { return typeof v === 'string' && v.charAt(0) === "'" ? v.slice(1) : v; });
    }));
    sh.getRange(at, 17, rows.length, 1).setNumberFormat('#,##0.00');
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  const total = locs.reduce(function (s, l) { return s + l.rent; }, 0);
  writeLog_(me.email, 'NEW_CONTRACT', f.contractNo + ' | ' + f.company + ' | ' + f.supplier + ' | ' + f.payment + ' | ' +
            start + ' → ' + end + ' | ' + locs.length + ' location · ' + total);
  return { ok: true, list: readNewContracts_() };
}

/** ลบสัญญา (ทุก Location ที่บันทึกพร้อมกัน) — p: { id: 'N<row แรก>', contractNo, timestamp } */
function apiDeleteNewContract_(token, p) {
  const me = authAdmin_(token);
  if (!me) return forbidden_('ลบสัญญาใหม่');
  const sh = ss_().getSheetByName(NC_SHEET);
  if (!sh || sh.getLastRow() <= 1) return { ok: false, code: 'NOT_FOUND', message: 'ไม่พบรายการ' };
  const vals = sh.getRange(2, 1, sh.getLastRow() - 1, NC_HEADER.length).getDisplayValues();
  const rows = [];
  vals.forEach(function (r, i) {
    if (r[0] === p.timestamp && clean_(r[8]) === clean_(p.contractNo)) rows.push(i + 2);
  });
  if (!rows.length) return { ok: false, code: 'STALE', message: 'ข้อมูลในชีตเปลี่ยนไปแล้ว กรุณากด ↻ รีเฟรช แล้วลองใหม่' };
  rows.reverse().forEach(function (r) { sh.deleteRow(r); });          // ลบจากล่างขึ้นบน แถวไม่เลื่อน
  writeLog_(me.email, 'DELETE_NEW_CONTRACT', p.contractNo + ' | ' + p.timestamp + ' | ' + rows.length + ' แถว');
  return { ok: true, list: readNewContracts_() };
}
