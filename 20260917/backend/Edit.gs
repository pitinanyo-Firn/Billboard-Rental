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
