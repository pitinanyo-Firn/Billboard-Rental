/**
 * Members.gs — จัดการผู้ใช้ (แท็บ "สมาชิก" เฉพาะ admin + ฟังก์ชันรันจาก editor)
 *
 * ชีต Users: Email | Salt | PasswordHash | Name | Role | Active | Position | Phone | Department | PhotoUrl
 *   - Email ใส่เป็นอีเมล หรือชื่อผู้ใช้ก็ได้ (เช่น admin-rental)
 *   - รหัสผ่านเก็บเป็น SHA-256 + salt ไม่เก็บรหัสจริง — รีเซ็ตได้ แต่ดูรหัสเดิมไม่ได้
 *   - กันพลาด: ลบ/ปิดบัญชีตัวเอง หรือลบ admin คนสุดท้ายไม่ได้
 */

const USER_HEADER = ['Email', 'Salt', 'PasswordHash', 'Name', 'Role', 'Active', 'Position', 'Phone', 'Department', 'PhotoUrl'];
const ROLES = ['admin', 'viewer'];

/** อีเมล หรือชื่อผู้ใช้ (ตัวอักษร ตัวเลข . _ - อย่างน้อย 3 ตัว) */
function validUserId_(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) || /^[a-z0-9._-]{3,50}$/.test(s);
}

function isTrue_(v) {
  return v === true || String(v).toLowerCase() === 'true';
}

/** แถวทั้งหมดในชีต Users (ไม่รวม header) */
function userRows_() {
  const sh = ensureUserSheet_();
  const last = sh.getLastRow();
  return {
    sheet: sh,
    rows: last > 1 ? sh.getRange(2, 1, last - 1, USER_HEADER.length).getValues() : []
  };
}

function countAdmins_(rows) {
  return rows.filter(function (r) { return String(r[4]) === 'admin' && isTrue_(r[5]); }).length;
}

/** รายชื่อสมาชิก (admin เท่านั้น) — ไม่ส่ง salt / hash ออกไป */
function apiMembers_(token) {
  const me = authAdmin_(token);
  if (!me) return forbidden_('ดูรายชื่อสมาชิก');
  const rows = userRows_().rows;
  return {
    ok: true,
    me: String(me.email).toLowerCase(),
    members: rows.map(function (r, i) {
      return {
        id: 'U' + (i + 2),
        email: String(r[0]).trim(),
        name: String(r[3] || ''),
        role: ROLES.indexOf(String(r[4])) > -1 ? String(r[4]) : 'viewer',
        active: isTrue_(r[5]),
        position: String(r[6] || ''),
        phone: String(r[7] || ''),
        department: String(r[8] || ''),
        photoUrl: String(r[9] || '')
      };
    }).filter(function (m) { return m.email; })
  };
}

/**
 * เพิ่มสมาชิกใหม่จากหน้าเว็บ
 * ตั้งรหัสผ่านเองได้ (p.password) ถ้าไม่ระบุจะสุ่มรหัสชั่วคราวให้ 1 ครั้ง
 */
function apiAddMember_(token, p) {
  const me = authAdmin_(token);
  if (!me) return forbidden_('เพิ่มสมาชิก');

  const email = String(p.email || '').trim().toLowerCase();
  const name  = String(p.name  || '').trim();
  if (!validUserId_(email)) {
    return { ok: false, code: 'INVALID_EMAIL', message: 'ต้องเป็นอีเมล หรือชื่อผู้ใช้ (a-z 0-9 . _ - อย่างน้อย 3 ตัว)' };
  }
  if (!name) {
    return { ok: false, code: 'MISSING_FIELD', message: 'กรุณากรอกชื่อ-นามสกุล' };
  }

  const rows = userRows_().rows;
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).trim().toLowerCase() === email) {
      return { ok: false, code: 'DUPLICATE_EMAIL', message: 'มีผู้ใช้นี้ในระบบอยู่แล้ว' };
    }
  }

  const password = String(p.password || '');
  if (password && password.length < 6) {
    return { ok: false, code: 'INVALID_VALUE', message: 'รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร' };
  }

  const role         = p.role === 'admin' ? 'admin' : 'viewer';
  const active       = p.active !== false && p.active !== 'false';
  // รูปถูกย่อ+บีบอัดฝั่ง client แล้วเป็น data URI — เก็บตรง ๆ ในเซลล์ชีต เลี่ยงปัญหาลิงก์ Drive ที่ไม่เสถียร
  const photo        = (typeof p.photo === 'string' && p.photo.indexOf('data:image/') === 0 && p.photo.length <= 49000) ? p.photo : '';
  const finalPassword = password || genPassword_();

  addUser(email, finalPassword, name, role, {
    active:     active,
    position:   p.position,
    phone:      p.phone,
    department: p.department,
    photoUrl:   photo
  });

  writeLog_(me.email, 'ADD_MEMBER', 'add:' + email + ' role:' + role);
  return { ok: true, email: email, tempPassword: password ? '' : finalPassword };
}

/**
 * แก้ไขสมาชิก (admin) — p: { id: 'U<row>', email, role?, active?, name?, position?, phone?, department?, password? }
 * ตรวจอีเมลในแถวก่อนเขียน กันแก้ผิดคนเมื่อมีการแทรก/ลบแถวในชีต
 */
function apiUpdateMember_(token, p) {
  const me = authAdmin_(token);
  if (!me) return forbidden_('แก้ไขสมาชิก');

  const row = parseInt(String(p.id || '').replace(/^U/, ''), 10);
  const src = userRows_();
  if (!row || row < 2 || row - 2 >= src.rows.length) {
    return { ok: false, code: 'NOT_FOUND', message: 'ไม่พบสมาชิก' };
  }
  const cur = src.rows[row - 2];
  const email = String(cur[0]).trim().toLowerCase();
  if (clean_(p.email).toLowerCase() !== email) {
    return { ok: false, code: 'STALE', message: 'ข้อมูลสมาชิกเปลี่ยนไปแล้ว กรุณากด ↻ รีเฟรช แล้วลองใหม่' };
  }
  const self = email === String(me.email).toLowerCase();

  const role   = p.role === undefined ? String(cur[4]) : (p.role === 'admin' ? 'admin' : 'viewer');
  const active = p.active === undefined ? isTrue_(cur[5]) : (p.active !== false && p.active !== 'false');
  if (self && (role !== 'admin' || !active)) {
    return { ok: false, code: 'FORBIDDEN', message: 'เปลี่ยนสิทธิ์หรือปิดบัญชีของตัวเองไม่ได้' };
  }
  if ((role !== 'admin' || !active) && String(cur[4]) === 'admin' && isTrue_(cur[5]) && countAdmins_(src.rows) <= 1) {
    return { ok: false, code: 'FORBIDDEN', message: 'ต้องมี admin ที่ใช้งานอยู่อย่างน้อย 1 คน' };
  }

  const password = String(p.password || '');
  if (password && password.length < 6) {
    return { ok: false, code: 'INVALID_VALUE', message: 'รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร' };
  }

  const text = function (key, idx) {
    return p[key] === undefined ? cur[idx] : clean_(p[key]).slice(0, 200);
  };
  const name = String(text('name', 3) || '').trim();
  if (!name) return { ok: false, code: 'MISSING_FIELD', message: 'กรุณากรอกชื่อ-นามสกุล' };

  let newPassword = '';
  let salt = cur[1], hash = cur[2];
  if (password || p.resetPassword) {
    newPassword = password || genPassword_();
    salt = Utilities.getUuid().slice(0, 8);
    hash = hashPassword_(newPassword, salt);
  }

  src.sheet.getRange(row, 1, 1, USER_HEADER.length).setValues([[
    email, salt, hash, name, role, active,
    text('position', 6), text('phone', 7), text('department', 8), cur[9]
  ]]);
  SpreadsheetApp.flush();

  writeLog_(me.email, 'UPDATE_MEMBER', email + ' | role:' + role + ' active:' + active +
            (newPassword ? ' | reset password' : ''));
  return { ok: true, email: email, role: role, active: active,
           tempPassword: (password || !newPassword) ? '' : newPassword };
}

/** ลบสมาชิก (admin) — p: { id: 'U<row>', email } */
function apiDeleteMember_(token, p) {
  const me = authAdmin_(token);
  if (!me) return forbidden_('ลบสมาชิก');

  const row = parseInt(String(p.id || '').replace(/^U/, ''), 10);
  const src = userRows_();
  if (!row || row < 2 || row - 2 >= src.rows.length) {
    return { ok: false, code: 'NOT_FOUND', message: 'ไม่พบสมาชิก' };
  }
  const cur = src.rows[row - 2];
  const email = String(cur[0]).trim().toLowerCase();
  if (clean_(p.email).toLowerCase() !== email) {
    return { ok: false, code: 'STALE', message: 'ข้อมูลสมาชิกเปลี่ยนไปแล้ว กรุณากด ↻ รีเฟรช แล้วลองใหม่' };
  }
  if (email === String(me.email).toLowerCase()) {
    return { ok: false, code: 'FORBIDDEN', message: 'ลบบัญชีของตัวเองไม่ได้' };
  }
  if (String(cur[4]) === 'admin' && isTrue_(cur[5]) && countAdmins_(src.rows) <= 1) {
    return { ok: false, code: 'FORBIDDEN', message: 'ต้องมี admin ที่ใช้งานอยู่อย่างน้อย 1 คน' };
  }

  src.sheet.deleteRow(row);
  SpreadsheetApp.flush();
  writeLog_(me.email, 'DELETE_MEMBER', email + ' | ' + String(cur[3] || '') + ' | role:' + String(cur[4]));
  return { ok: true, email: email };
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

/** รันจาก editor เมื่อลืมรหัส admin: ตั้งรหัสของ CFG.ADMIN_USER กลับเป็นค่าเริ่มต้น */
function resetAdminPassword() {
  Logger.log(addUser(CFG.ADMIN_USER, CFG.ADMIN_PASSWORD, 'Administrator', 'admin'));
  Logger.log('รหัสผ่าน: ' + CFG.ADMIN_PASSWORD + ' — เปลี่ยนทันทีหลังเข้าสู่ระบบ');
}
