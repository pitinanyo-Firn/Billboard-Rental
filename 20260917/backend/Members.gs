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
