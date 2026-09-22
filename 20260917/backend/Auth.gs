/**
 * Auth.gs — login / session / log
 * รหัสผ่านเก็บเป็น SHA-256 + salt ในชีต Users · session เก็บใน CacheService (อายุ CFG.TOKEN_TTL_MS)
 */

/** สเปรดชีตฐานข้อมูล: Script Property SPREADSHEET_ID > CFG.SPREADSHEET_ID > ชีตที่ผูก script นี้ */
function ss_() {
  const id = prop_('SPREADSHEET_ID', CFG.SPREADSHEET_ID);
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

function getSheet_(name) {
  const ss = ss_();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function hashPassword_(plain, salt) {
  const raw = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(salt) + '::' + String(plain),
    Utilities.Charset.UTF_8
  );
  return raw.map(function (b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
}

function apiLogin_(email, password) {
  email = String(email || '').trim().toLowerCase();
  if (!email || !password) {
    return { ok: false, code: 'MISSING_FIELD', message: 'กรุณากรอกอีเมลและรหัสผ่าน' };
  }
  const rows = getSheet_(CFG.SHEET_USERS).getDataRange().getValues();
  // header: Email | Salt | PasswordHash | Name | Role | Active | Position | Phone | Department | PhotoUrl
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (String(r[0]).trim().toLowerCase() !== email) continue;

    if (r[5] !== true && String(r[5]).toLowerCase() !== 'true') {
      return { ok: false, code: 'DISABLED', message: 'บัญชีนี้ถูกปิดการใช้งาน' };
    }
    if (hashPassword_(password, r[1]) !== String(r[2])) {
      writeLog_(email, 'LOGIN', 'fail:wrong-password');
      return { ok: false, code: 'INVALID_CREDENTIAL', message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' };
    }

    const token = Utilities.getUuid();
    const profile = { email: r[0], name: r[3] || r[0], role: r[4] || 'viewer' };
    CacheService.getScriptCache().put(
      'tk_' + token, JSON.stringify(profile), Math.floor(CFG.TOKEN_TTL_MS / 1000)
    );
    writeLog_(profile.email, 'LOGIN', 'success');
    return { ok: true, token: token, profile: profile, expiresIn: CFG.TOKEN_TTL_MS };
  }
  writeLog_(email, 'LOGIN', 'fail:no-user');
  return { ok: false, code: 'INVALID_CREDENTIAL', message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' };
}

function apiLogout_(token) {
  CacheService.getScriptCache().remove('tk_' + token);
  return { ok: true };
}

/** ตรวจ token — โยน error ถ้าไม่ผ่าน (ทุก API ที่ต้อง auth เรียกตัวนี้ก่อน) */
function auth_(token) {
  const raw = CacheService.getScriptCache().get('tk_' + token);
  if (!raw) throw new Error('SESSION_EXPIRED');
  return JSON.parse(raw);
}

function apiCheckSession_(token) {
  try { return { ok: true, profile: auth_(token) }; }
  catch (e) { return { ok: false, code: 'SESSION_EXPIRED' }; }
}

function writeLog_(email, action, detail) {
  try {
    const sh = getSheet_(CFG.SHEET_LOG);
    if (sh.getLastRow() === 0) sh.appendRow(['Timestamp', 'Email', 'Action', 'Detail']);
    sh.appendRow([new Date(), email, action, detail]);
  } catch (e) { /* ไม่ให้ log ล้มพังทั้ง request */ }
}
