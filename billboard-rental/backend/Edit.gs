/**
 * Edit.gs — แก้ไขข้อมูลค่าเช่าจากหน้าเว็บ แล้วเขียนกลับลง Google Sheet (admin)
 *        + แก้ข้อมูลที่ผิดรูปแบบอัตโนมัติ (แท็บ "ตรวจสอบข้อมูล" / เมนูในชีต)
 *
 * p: { id: 'R<row>', contractNo: '<เลขที่สัญญาเดิม>', fields: { field: value, ... } }
 *    ส่งมาเฉพาะช่องที่เปลี่ยน · วันที่เป็น 'yyyy-MM-dd'
 *
 * เขียนให้ตรงกับสไตล์เดิมของชีต:
 *   - วันที่เขียนเป็นข้อความ d/m/yyyy — คอลัมน์สัญญา (Start/End Contract) ใช้ พ.ศ. ที่เหลือใช้ ค.ศ. (DATE_FIELDS)
 *   - ยอดเงินเขียนเป็นตัวเลข
 *
 * กันพลาด:
 *   - ตรวจเลขที่สัญญาในแถวก่อนเขียน (ถ้ามีคนแทรก/ลบแถวในชีต จะไม่เขียนผิดแถว)
 *   - LockService กันสองคนเขียนพร้อมกัน
 *   - ข้อความที่ขึ้นต้นด้วย = + - @ ถูกเก็บเป็นข้อความ ไม่กลายเป็นสูตร
 *   - บันทึกค่าเดิม → ค่าใหม่ ทุกช่องลงชีต Log (Action UPDATE_RENTAL / FIX_DATA)
 */

const EDIT = {
  LOCKED:   ['no'],                  // ไม่ให้แก้จากหน้าเว็บ
  TEXT_MAX: 300
};

/** ISO -> 'd/m/yyyy' ตามระบบปีของคอลัมน์ */
function sheetDateText_(iso, era) {
  const p = iso.split('-');
  return (+p[2]) + '/' + (+p[1]) + '/' + (era === 'BE' ? (+p[0] + 543) : +p[0]);
}

/** แปลงค่าจากหน้าเว็บเป็นค่าที่จะเขียนลงเซลล์ — คืน { value, text } หรือ { error } */
function editValue_(field, raw) {
  const s = String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim();
  if (s === '') return { value: '' };

  if (DATE_FIELDS[field]) {
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m || !iso_(+m[1], +m[2], +m[3])) return { error: 'วันที่ไม่ถูกต้อง' };
    return { value: sheetDateText_(s, DATE_FIELDS[field]), text: true };
  }
  if (NUMBER_FIELDS.indexOf(field) > -1) {
    const n = Number(s.replace(/,/g, ''));
    if (!isFinite(n)) return { error: 'ต้องเป็นตัวเลข' };
    if (field !== 'adjust' && n < 0) return { error: 'ต้องเป็นตัวเลขไม่ติดลบ' };
    return { value: n };
  }
  if (field === 'payStatus' && PAY_STATUSES.indexOf(s) < 0) {
    return { error: 'ต้องเป็น ' + PAY_STATUSES.join(' / ') };
  }
  if (s.length > EDIT.TEXT_MAX) return { error: 'ยาวเกิน ' + EDIT.TEXT_MAX + ' ตัวอักษร' };
  return { value: /^[=+\-@]/.test(s) ? "'" + s : s };
}

/** เขียนค่าลงเซลล์ — ข้อความวันที่ตั้ง format เป็น Plain text กันชีตแปลงเป็นวันที่ตาม locale */
function writeCell_(cell, v, asText) {
  if (asText) cell.setNumberFormat('@');
  cell.setValue(v);
}

function apiUpdateRental_(token, p) {
  const me = authAdmin_(token);
  if (!me) return forbidden_('แก้ไขข้อมูล');

  const row = parseInt(String(p.id || '').replace(/^R/, ''), 10);
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
    if (r.error) errors[f] = r.error; else prepared[f] = r;
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
    if (row <= src.headerRow || row > sh.getLastRow()) return { ok: false, code: 'NOT_FOUND', message: 'ไม่พบรายการในชีต' };

    contractNo = clean_(sh.getRange(row, map.contractNo + 1).getDisplayValue());
    if (p.contractNo !== undefined && clean_(p.contractNo) !== contractNo) {
      return { ok: false, code: 'STALE', message: 'ข้อมูลในชีตมีการเปลี่ยนแปลง กรุณากด ↻ รีเฟรช แล้วลองใหม่' };
    }

    const missing = Object.keys(prepared).filter(function (f) { return map[f] === undefined; });
    if (missing.length) return { ok: false, code: 'NO_COLUMN', message: 'ชีตไม่มีคอลัมน์: ' + missing.join(', ') };

    Object.keys(prepared).forEach(function (f) {
      const cell = sh.getRange(row, map[f] + 1);
      const before = cell.getDisplayValue();
      writeCell_(cell, prepared[f].value, prepared[f].text);
      changes.push(f + ': "' + before + '" → "' + String(prepared[f].value).replace(/^'/, '') + '"');
    });
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }

  invalidateData_();
  writeLog_(me.email, 'UPDATE_RENTAL', contractNo + ' (แถว ' + row + ') | ' + changes.join(' | '));
  const fresh = readRentals_().filter(function (d) { return d.id === p.id; })[0] || null;
  return { ok: true, id: p.id, changed: changes.length, rental: fresh, version: dataFingerprint_() };
}

/* ---------- แก้ข้อมูลอัตโนมัติ (เฉพาะรายการที่แก้ได้แน่นอน) ----------
   - วันที่ที่เขียนเป็น เดือน/วัน/ปี  → วัน/เดือน/ปี (คงระบบปีเดิมของเซลล์)
   - คำสะกดผิดตาม VALUE_FIX
   - ช่องว่างเกินหัว/ท้ายข้อความ
   ปัญหาอื่น (ยอดเงินหาย, ปีน่าจะผิด ฯลฯ) ต้องให้คนตรวจแล้วแก้เองผ่านปุ่ม ✎ แก้ไข */

function collectFixes_() {
  const out = [];
  readRentals_().forEach(function (d) {
    d.issues.forEach(function (i) {
      if (i.fix) out.push({ id: d.id, row: d._row, contractNo: d.contractNo, field: i.field,
                            before: i.before, after: i.fix, msg: i.msg });
    });
  });
  return out;
}

function apiPreviewFixes_(token) {
  if (!authAdmin_(token)) return forbidden_('แก้ข้อมูลอัตโนมัติ');
  return { ok: true, fixes: collectFixes_() };
}

function apiApplyFixes_(token) {
  const me = authAdmin_(token);
  if (!me) return forbidden_('แก้ข้อมูลอัตโนมัติ');
  const r = applyFixes_(me.email);
  return { ok: true, applied: r.applied, skipped: r.skipped, version: dataFingerprint_() };
}

function applyFixes_(who) {
  invalidateData_();
  const fixes = collectFixes_();
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  const applied = [], skipped = [];
  try {
    const src = findDataSheet_();
    fixes.forEach(function (f) {
      const cell = src.sheet.getRange(f.row, src.map[f.field] + 1);
      // เขียนเฉพาะเมื่อค่าในเซลล์ยังเป็นค่าเดิมที่ตรวจพบ (กันเขียนทับค่าที่มีคนเพิ่งแก้)
      if (clean_(cell.getDisplayValue()) !== clean_(f.before)) { skipped.push(f); return; }
      writeCell_(cell, /^[=+\-@]/.test(f.after) ? "'" + f.after : f.after, !!DATE_FIELDS[f.field]);
      applied.push(f);
    });
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  invalidateData_();
  if (applied.length) {
    writeLog_(who, 'FIX_DATA', applied.map(function (f) {
      return 'แถว ' + f.row + ' ' + f.field + ': "' + f.before + '" → "' + f.after + '"';
    }).join(' | ').slice(0, 45000));
  }
  return { applied: applied, skipped: skipped };
}

/** รันจาก editor / เมนูในชีต: ดูรายการที่จะถูกแก้ (ไม่เขียนชีต) */
function previewDataFixes() {
  invalidateData_();
  const fixes = collectFixes_();
  Logger.log('พบ ' + fixes.length + ' รายการที่แก้อัตโนมัติได้');
  fixes.forEach(function (f) {
    Logger.log('แถว ' + f.row + ' [' + f.field + '] "' + f.before + '" → "' + f.after + '"  (' + f.msg + ')');
  });
  return fixes.length;
}

/** รันจาก editor / เมนูในชีต: แก้ข้อมูลจริง */
function applyDataFixes() {
  const r = applyFixes_(Session.getActiveUser().getEmail() || 'editor');
  Logger.log('แก้แล้ว ' + r.applied.length + ' รายการ · ข้าม ' + r.skipped.length + ' รายการ (ค่าในเซลล์เปลี่ยนไปแล้ว)');
  return r.applied.length;
}
