/**
 * NewContract.gs — แท็บ "New Contract": เพิ่มสัญญาใหม่ลงชีต Contract_Master (ไม่สร้างชีตใหม่)
 *
 * ส่วนที่ 1 ข้อมูลบริษัทและเอกสาร · ส่วนที่ 2 Location / Expense Period (เพิ่มได้หลาย Location)
 * 1 Location = 1 แถว แทรกต่อท้าย "บล็อกของเดือนนั้น" (คอลัมน์ Month เช่น Oct-26) เป็นลำดับถัดไป
 *   - ลำดับ = ลำดับสุดท้ายของเดือนนั้น + 1 · ถ้าชีตนับลำดับต่อเนื่องข้ามเดือน แถวเดือนถัดไปจะถูกเลื่อนเลขให้
 *   - แถวใหม่ได้รูปแบบเซลล์/dropdown จากแถวสุดท้ายของเดือน (insertRowsAfter)
 *   - ถ้ายังไม่มีบล็อกของเดือนนั้น จะต่อท้ายชีต
 *
 * ช่องที่เขียน: Rental Year, Payment, Company, Media Type, Media Site, Epicore Code, Vendor No., Vendor name,
 *   Part Description, Part Code, Contract No., Start/End Contract (ข้อความ d/m/yyyy พ.ศ.), Period,
 *   Status Contract = Continue, Amount/Month, Amount/Year, Month, Status Payment = รอเบิก, PR, PO
 *   ค่าเช่าตามสัญญา: รายเดือน / ราย 3 เดือน → Amount/Month · รายปี → Amount/Year (Amount/Month = /12)
 *
 * รายการ "สัญญาใหม่ที่บันทึกแล้ว" อ่านจากชีต Log (Action NEW_CONTRACT) แล้วจับคู่แถวปัจจุบันใน Contract_Master
 * เพิ่ม/ลบ เฉพาะ admin · ทุกคนที่ล็อกอินดูรายการได้
 */

const NC_PAYMENTS = ['รายเดือน', 'รายปี', 'ราย 3 เดือน'];
const NC_MAX_LOCATIONS = 30;
const NC_LOG = 'NEW_CONTRACT';
const NC_TEXT_FIELDS = ['vendorNo', 'epicoreCode', 'partCode', 'contractNo', 'startDate', 'endDate', 'pr', 'po'];

/** 'yyyy-MM' → 'Oct-26' (ค่าว่าง = เดือนปัจจุบัน) */
function ncMonth_(ym) {
  return monthLabel_(ym) || Utilities.formatDate(new Date(), CFG.TZ, 'MMM-yy');
}

/** ระยะสัญญาแบบในชีต "3 ปี 0 เดือน" */
function ncPeriod_(start, end) {
  const a = start.split('-').map(Number), b = end.split('-').map(Number);
  const e = new Date(b[0], b[1] - 1, b[2] + 1);
  let months = (e.getFullYear() - a[0]) * 12 + (e.getMonth() - (a[1] - 1));
  if (e.getDate() < a[2]) months--;
  months = Math.max(0, months);
  return Math.floor(months / 12) + ' ปี ' + (months % 12) + ' เดือน';
}

/** อ่านแถว NEW_CONTRACT ใน Log → [{ timestamp, by, contractNo, supplier, month, count }] ล่าสุดก่อน */
function ncLogEntries_() {
  const sh = ss_().getSheetByName(CFG.SHEET_LOG);
  if (!sh || sh.getLastRow() <= 1) return [];
  const vals = sh.getRange(2, 1, sh.getLastRow() - 1, 4).getDisplayValues();
  const out = [];
  vals.forEach(function (r) {
    if (r[2] !== NC_LOG) return;
    try {
      const d = JSON.parse(r[3]);
      if (d && d.contractNo) out.push({ timestamp: r[0], by: r[1], contractNo: d.contractNo, supplier: d.supplier,
                                        month: d.month, count: d.count || 0, sites: d.sites || [] });
    } catch (e) { /* รูปแบบเก่า (บันทึกลงชีต New_Contract) — ข้าม */ }
  });
  return out.reverse();
}

/** แถวใน Contract_Master ของสัญญาที่เพิ่มผ่านแท็บนี้ */
function ncRows_(data, e) {
  const k = (e.contractNo + '|' + e.supplier + '|' + e.month).toLowerCase();
  return data.filter(function (d) { return (d.contractNo + '|' + d.vendorName + '|' + d.month).toLowerCase() === k; });
}

function readNewContracts_() {
  const data = readRentals_();
  const seen = {};
  const out = [];
  ncLogEntries_().forEach(function (e) {
    const key = (e.contractNo + '|' + e.supplier + '|' + e.month).toLowerCase();
    if (seen[key]) return;
    seen[key] = true;
    const rows = ncRows_(data, e);
    if (!rows.length) return;                                    // ถูกลบจากชีตไปแล้ว
    const f = rows[0];
    out.push({
      id: key, timestamp: e.timestamp, by: e.by, month: e.month, contractNo: f.contractNo,
      company: f.company, supplier: f.vendorName, vendorNo: f.vendorNo, pr: f.pr, po: f.po,
      startDate: f.startDate, endDate: f.endDate, startText: f.startDateText, endText: f.endDateText,
      payment: f.payment, rowNos: rows.map(function (d) { return d.no; }),
      locations: rows.map(function (d) {
        return { no: d.no, row: d._row, mediaType: d.mediaType, mediaSite: d.mediaSite, epicoreCode: d.epicoreCode,
                 partCode: d.partCode, partDesc: d.partDesc,
                 rent: d.freq === 'yearly' && d.amountYear ? d.amountYear : d.amountMonth };
      }),
      totalRent: rows.reduce(function (s, d) { return s + (d.freq === 'yearly' && d.amountYear ? d.amountYear : d.amountMonth); }, 0)
    });
  });
  return out;
}

function apiNewContracts_(token) {
  auth_(token);
  return { ok: true, list: readNewContracts_(), payments: NC_PAYMENTS, month: ncMonth_('') };
}

/**
 * ตำแหน่งที่จะแทรก: แถวสุดท้ายของเดือน month
 * คืน { anchor (แถวสุดท้ายของเดือน หรือ 0), lastNo, after (แถวข้อมูลสุดท้ายของชีต), continuous }
 */
function ncAnchor_(sh, src, month) {
  const map = src.map, first = src.headerRow + 1, last = sh.getLastRow();
  if (last < first) return { anchor: 0, lastNo: 0, after: src.headerRow, continuous: false };
  const n = last - first + 1;
  const months = sh.getRange(first, map.month + 1, n, 1).getDisplayValues();
  const nos = map.no === undefined ? null : sh.getRange(first, map.no + 1, n, 1).getValues();
  const keyCol = sh.getRange(first, map.contractNo + 1, n, 1).getDisplayValues();
  let anchor = 0, after = src.headerRow, maxNo = 0;
  for (let i = 0; i < n; i++) {
    const no = nos ? Number(nos[i][0]) : NaN;
    if (isFinite(no) && no > maxNo) maxNo = no;
    if (clean_(keyCol[i][0]) || clean_(months[i][0])) after = first + i;
    if (clean_(months[i][0]) === month) anchor = first + i;
  }
  if (!anchor) return { anchor: 0, lastNo: maxNo, after: after, continuous: false };
  const idx = anchor - first;
  const lastNo = nos ? Number(nos[idx][0]) || 0 : 0;
  const nextNo = nos && idx + 1 < n ? Number(nos[idx + 1][0]) : NaN;
  return { anchor: anchor, lastNo: lastNo, after: after, continuous: nextNo === lastNo + 1 };
}

/** เลื่อนเลขลำดับของแถว fromRow..ท้ายชีต ไป delta (เฉพาะเซลล์ที่เป็นตัวเลข ไม่แตะสูตร) */
function ncShiftNos_(sh, col, fromRow, delta) {
  const last = sh.getLastRow();
  if (fromRow > last) return;
  const rg = sh.getRange(fromRow, col, last - fromRow + 1, 1);
  const vals = rg.getValues(), forms = rg.getFormulas();
  if (forms.some(function (f) { return f[0]; })) return;
  rg.setValues(vals.map(function (v) {
    return [typeof v[0] === 'number' || (v[0] !== '' && isFinite(Number(v[0]))) ? Number(v[0]) + delta : v[0]];
  }));
}

/**
 * p: { company, supplier, vendorNo, pr, po, startDate, endDate, contractNo, payment, month: 'yyyy-MM', force,
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
  if (p.month && !monthLabel_(p.month)) errors.month = 'เดือนไม่ถูกต้อง';
  const month = ncMonth_(p.month);

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

  // กันบันทึกซ้ำ: Contract No. + Vendor name เดียวกันในเดือนเดียวกัน
  const key = (f.contractNo + '|' + f.supplier).toLowerCase();
  const dup = readRentals_().filter(function (d) { return (d.contractNo + '|' + d.vendorName).toLowerCase() === key; });
  if (dup.length && !p.force) {
    const inMonth = dup.some(function (d) { return d.month === month; });
    return { ok: false, code: 'DUPLICATE',
             message: 'มีสัญญา ' + f.contractNo + ' ของ ' + f.supplier + ' อยู่แล้วใน Contract_Master' +
                      (inMonth ? ' (เดือน ' + month + ')' : '') + ' — ยืนยันเพื่อบันทึกเพิ่ม' };
  }

  const safe = function (s) { return /^[=+\-@]/.test(s) ? "'" + s : s; };
  const yearly = f.payment === 'รายปี';
  const period = ncPeriod_(start, end);
  const added = [];

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const src = findDataSheet_();
    const sh = src.sheet, map = src.map;
    const missing = ['month', 'mediaSite', 'vendorName', 'contractNo'].filter(function (k) { return map[k] === undefined; });
    if (missing.length) return { ok: false, code: 'NO_COLUMN', message: 'Contract_Master ไม่มีคอลัมน์: ' + missing.join(', ') };

    const lastCol = sh.getLastColumn();
    const pos = ncAnchor_(sh, src, month);
    let at, monthVal, yearVal, startNo;
    if (pos.anchor) {
      sh.insertRowsAfter(pos.anchor, locs.length);                 // รับรูปแบบ/dropdown จากแถวสุดท้ายของเดือน
      at = pos.anchor + 1;
      const tpl = sh.getRange(pos.anchor, 1, 1, lastCol).getValues()[0];
      monthVal = tpl[map.month];
      yearVal = map.rentalYear === undefined ? '' : tpl[map.rentalYear];
      startNo = pos.lastNo + 1;
      if (map.no !== undefined && pos.continuous) ncShiftNos_(sh, map.no + 1, at + locs.length, locs.length);
    } else {
      at = pos.after + 1;
      if (at > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), locs.length);
      monthVal = month;
      yearVal = Number('20' + month.slice(-2));
      startNo = pos.lastNo + 1;
    }

    const rows = locs.map(function (l, i) {
      const r = new Array(lastCol).fill('');
      const put = function (k, v) { if (map[k] !== undefined) r[map[k]] = v; };
      put('no', startNo + i);
      put('rentalYear', yearVal);
      put('payment', f.payment);
      put('company', safe(f.company));
      put('mediaType', safe(l.mediaType));
      put('mediaSite', safe(l.mediaSite));
      put('epicoreCode', l.epicoreCode);
      put('vendorNo', f.vendorNo);
      put('vendorName', safe(f.supplier));
      put('partDesc', safe(l.partDesc));
      put('partCode', l.partCode);
      put('contractNo', f.contractNo);
      put('startDate', sheetDateText_(start, 'BE'));
      put('endDate', sheetDateText_(end, 'BE'));
      put('period', period);
      put('contractStatus', 'Continue');
      put('amountMonth', yearly ? Math.round(l.rent / 12 * 100) / 100 : l.rent);
      put('amountYear', yearly ? l.rent : '');
      put('month', monthVal);
      put('payStatus', 'รอเบิก');
      put('pr', safe(f.pr));
      put('po', safe(f.po));
      added.push(startNo + i);
      return r;
    });

    // คอลัมน์รหัส/วันที่เก็บเป็นข้อความ (กันเลข 000123 หายศูนย์ และวันที่ถูกแปลงตาม locale)
    NC_TEXT_FIELDS.forEach(function (k) { if (map[k] !== undefined) sh.getRange(at, map[k] + 1, rows.length, 1).setNumberFormat('@'); });
    sh.getRange(at, 1, rows.length, lastCol).setValues(rows.map(function (r) {
      return r.map(function (v) { return typeof v === 'string' && v.charAt(0) === "'" ? v.slice(1) : v; });
    }));
    // คอลัมน์ที่แถวต้นแบบเป็นสูตร และฟอร์มไม่ได้กรอก (ถ้ามี) — คัดลอกสูตรลงมาให้
    const formulas = pos.anchor ? sh.getRange(pos.anchor, 1, 1, lastCol).getFormulasR1C1()[0] : [];
    formulas.forEach(function (fm, c) {
      if (fm && rows.every(function (r) { return r[c] === ''; })) sh.getRange(at, c + 1, rows.length, 1).setFormulaR1C1(fm);
    });
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }

  invalidateData_();
  const total = locs.reduce(function (s, l) { return s + l.rent; }, 0);
  writeLog_(me.email, NC_LOG, JSON.stringify({
    contractNo: f.contractNo, supplier: f.supplier, month: month, count: locs.length, nos: added,
    sites: locs.map(function (l) { return l.mediaSite; }), payment: f.payment, start: start, end: end, total: total
  }));
  return { ok: true, month: month, nos: added, list: readNewContracts_() };
}

/** ลบแถวของสัญญาที่เพิ่มผ่านแท็บนี้ออกจาก Contract_Master — p: { contractNo, supplier, month, rows: [แถวในชีต] } */
function apiDeleteNewContract_(token, p) {
  const me = authAdmin_(token);
  if (!me) return forbidden_('ลบสัญญาใหม่');
  const want = (Array.isArray(p.rows) ? p.rows : []).map(Number).filter(function (n) { return n > 0; });
  if (!want.length) return { ok: false, code: 'NOT_FOUND', message: 'ไม่พบรายการ' };

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  let removed = 0;
  try {
    const src = findDataSheet_();
    const sh = src.sheet, map = src.map;
    const k = (clean_(p.contractNo) + '|' + clean_(p.supplier) + '|' + clean_(p.month)).toLowerCase();
    // ตรวจทุกแถวก่อนลบ — ถ้ามีคนแทรก/ลบแถวในชีตระหว่างนั้น จะไม่ลบผิดแถว
    const ok = want.every(function (r) {
      if (r <= src.headerRow || r > sh.getLastRow()) return false;
      const v = sh.getRange(r, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
      return (clean_(v[map.contractNo]) + '|' + clean_(v[map.vendorName]) + '|' + clean_(v[map.month])).toLowerCase() === k;
    });
    if (!ok) return { ok: false, code: 'STALE', message: 'ข้อมูลในชีตเปลี่ยนไปแล้ว กรุณากด ↻ รีเฟรช แล้วลองใหม่' };

    want.sort(function (a, b) { return b - a; });
    const lowest = want[want.length - 1];
    const nos = map.no === undefined ? [] : want.map(function (r) { return Number(sh.getRange(r, map.no + 1).getValue()); });
    const maxNo = Math.max.apply(null, nos.concat([0]));
    want.forEach(function (r) { sh.deleteRow(r); removed++; });      // ลบจากล่างขึ้นบน แถวไม่เลื่อน
    // ถ้าลำดับนับต่อเนื่อง ให้เลื่อนเลขของแถวถัดไปกลับ
    if (map.no !== undefined && want.length === want[0] - lowest + 1) {
      const next = lowest <= sh.getLastRow() ? Number(sh.getRange(lowest, map.no + 1).getValue()) : NaN;
      if (next === maxNo + 1) ncShiftNos_(sh, map.no + 1, lowest, -removed);
    }
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  invalidateData_();
  writeLog_(me.email, 'DELETE_NEW_CONTRACT', p.contractNo + ' | ' + p.supplier + ' | ' + p.month + ' | ' + removed + ' แถว');
  return { ok: true, list: readNewContracts_() };
}
