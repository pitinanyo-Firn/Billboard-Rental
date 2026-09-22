/**
 * Setup.gs — ติดตั้งระบบ / เมนูในสเปรดชีต (รันจาก Apps Script Editor)
 */

/**
 * ติดตั้งครั้งแรก: ตรวจแท็บข้อมูลสัญญา + สร้างชีต Users / Log + บัญชี admin เริ่มต้น
 * รหัสผ่านเริ่มต้น: PlanB@2026  — เปลี่ยนทันทีหลังล็อกอินครั้งแรก
 * ถ้ามีผู้ใช้อยู่แล้ว จะไม่รีเซ็ตรหัส admin ซ้ำ
 */
function setupSystem() {
  const src = findDataSheet_();
  Logger.log('แท็บข้อมูลสัญญา: "' + src.sheet.getName() + '" (header แถว ' + src.headerRow + ')');
  const missing = COLUMNS.map(function (c) { return c[0]; })
    .filter(function (f) { return src.map[f] === undefined; });
  if (missing.length) Logger.log('คอลัมน์ที่ไม่พบ (จะแสดงเป็นค่าว่าง): ' + missing.join(', '));

  applyStatusDropdowns();

  const users = ensureUserSheet_();
  getSheet_(CFG.SHEET_LOG);
  if (users.getLastRow() <= 1) {
    addUser('admin@planb.co.th', 'PlanB@2026', 'Administrator', 'admin');
    Logger.log('สร้าง admin@planb.co.th / PlanB@2026 แล้ว (เปลี่ยนรหัสทันที)');
  }

  invalidateData_();
  Logger.log('อ่านสัญญาได้ ' + readContracts_().length + ' รายการ');
  Logger.log('ผู้ช่วย AI: ' + (prop_('ANTHROPIC_API_KEY', '') ? 'พร้อมใช้งาน' : 'ยังไม่ได้ตั้ง ANTHROPIC_API_KEY'));
  Logger.log('อีเมลเตือน: ' + (noticeTriggerOn_() ? 'เปิด' : 'ปิด (รัน installNoticeTrigger เพื่อเปิด)') +
             ' · ผู้รับ: ' + (noticeRecipients_().join(', ') || 'ยังไม่มี (ตั้ง NOTICE_EMAILS)'));
}

/** เมนูในสเปรดชีต (ทำงานเมื่อ script ผูกกับชีต) */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('⚙️ Contract Hub')
    .addItem('ติดตั้งระบบครั้งแรก', 'setupSystem')
    .addItem('ล้าง Cache ข้อมูล', 'menuClearCache')
    .addItem('ตั้ง Dropdown สถานะในชีต', 'applyStatusDropdowns')
    .addSeparator()
    .addItem('เปิดการเตือนทางอีเมล (ทุกวัน)', 'installNoticeTrigger')
    .addItem('ปิดการเตือนทางอีเมล', 'removeNoticeTrigger')
    .addItem('ตรวจและส่งอีเมลเตือนตอนนี้', 'dailyNoticeCheck')
    .addItem('ส่งอีเมลทดสอบ', 'testNoticeEmail')
    .addToUi();
}

function menuClearCache() {
  invalidateData_();
  SpreadsheetApp.getUi().alert('ล้าง Cache เรียบร้อย');
}
