/**
 * Main.gs — HTTP entry points + router
 * เพิ่ม action ใหม่: เขียนฟังก์ชัน apiXxx_() แล้วเพิ่ม case ใน route_() ที่เดียว
 */

/** ตอบกลับเป็น JSON */
function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** ตอบกลับเป็น JSONP (fallback กรณี CORS มีปัญหา) */
function jsonp_(callback, obj) {
  if (!/^[A-Za-z_$][\w$]*$/.test(callback)) return json_({ ok: false, code: 'BAD_REQUEST' });
  return ContentService
    .createTextOutput(callback + '(' + JSON.stringify(obj) + ');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

/**
 * GET — health check + JSONP fallback
 * ตัวอย่าง: {WEBAPP_URL}?action=ping
 */
function doGet(e) {
  const p = (e && e.parameter) || {};
  const result = route_(p.action || 'ping', p);
  return p.callback ? jsonp_(p.callback, result) : json_(result);
}

/**
 * POST — ช่องทางหลัก
 * body: text/plain (เลี่ยง CORS preflight) เนื้อหาเป็น JSON
 *       { "action": "login", "email": "...", "password": "..." }
 */
function doPost(e) {
  let payload = {};
  try {
    payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, code: 'BAD_REQUEST', message: 'รูปแบบข้อมูลไม่ถูกต้อง' });
  }
  return json_(route_(payload.action, payload));
}

/** Router กลาง */
function route_(action, p) {
  try {
    switch (action) {
      case 'ping':          return { ok: true, service: 'Contract Rental Hub API', version: CFG.VERSION };
      case 'login':         return apiLogin_(p.email, p.password);
      case 'logout':        return apiLogout_(p.token);
      case 'checkSession':  return apiCheckSession_(p.token);
      case 'getDashboard':  return apiDashboard_(p.token);
      case 'getVersion':    return apiVersion_(p.token);
      case 'getContract':   return apiContract_(p.token, p.id);
      case 'getActionList': return apiActionList_(p.token);
      case 'exportCSV':     return apiExportCSV_(p.token);
      case 'clearCache':    return apiClearCache_(p.token);
      case 'addMember':     return apiAddMember_(p.token, p);
      case 'askAI':         return apiAskAI_(p.token, p);
      case 'getNoticeSettings': return apiNoticeSettings_(p.token);
      case 'sendNoticeNow':     return apiSendNoticeNow_(p.token, p);
      case 'updateNoticeStatus': return apiUpdateNoticeStatus_(p.token, p);
      case 'updateContract':     return apiUpdateContract_(p.token, p);
      default:
        return { ok: false, code: 'UNKNOWN_ACTION', message: 'ไม่รู้จักคำสั่ง: ' + action };
    }
  } catch (err) {
    if (err.message === 'SESSION_EXPIRED') {
      return { ok: false, code: 'SESSION_EXPIRED', message: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่' };
    }
    return { ok: false, code: 'SERVER_ERROR', message: err.message };
  }
}
