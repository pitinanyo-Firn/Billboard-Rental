/**
 * Setup.gs — ติดตั้งระบบ / เมนูในสเปรดชีต (รันจาก Apps Script Editor)
 */

/**
 * ติดตั้งครั้งแรก: ตรวจแท็บ Contract_Master + สร้างชีต Payment_History / Receipt_Tracking / New_Location / Users / Log
 * + บัญชี admin เริ่มต้น CFG.ADMIN_USER / CFG.ADMIN_PASSWORD — เปลี่ยนทันทีหลังล็อกอินครั้งแรก
 * ถ้ามีผู้ใช้อยู่แล้ว จะไม่รีเซ็ตรหัส admin ซ้ำ
 */
function setupSystem() {
  const src = findDataSheet_();
  Logger.log('แท็บข้อมูลค่าเช่า: "' + src.sheet.getName() + '" (header แถว ' + src.headerRow + ')');
  const missing = COLUMNS.map(function (c) { return c[0]; })
    .filter(function (f) { return src.map[f] === undefined; });
  if (missing.length) Logger.log('คอลัมน์ที่ไม่พบ (จะแสดงเป็นค่าว่าง): ' + missing.join(', '));

  ensureSheet_(CFG.SHEET_PAYMENT, PAYMENT_HEADER);
  ensureSheet_(CFG.SHEET_RECEIPT, RECEIPT_HEADER);
  ensureSheet_(CFG.SHEET_LOCATION, LOCATION_HEADER);
  applyStatusDropdowns();

  const users = ensureUserSheet_();
  getSheet_(CFG.SHEET_LOG);
  if (users.getLastRow() <= 1) {
    addUser(CFG.ADMIN_USER, CFG.ADMIN_PASSWORD, CFG.ADMIN_NAME, 'admin');
    Logger.log('สร้างผู้ดูแลระบบ ' + CFG.ADMIN_USER + ' / ' + CFG.ADMIN_PASSWORD + ' แล้ว (เปลี่ยนรหัสทันทีหลังเข้าสู่ระบบ)');
  }

  invalidateData_();
  const data = readRentals_();
  Logger.log('อ่านรายการค่าเช่าได้ ' + data.length + ' รายการ · มีปัญหาข้อมูล ' +
             data.filter(function (d) { return d.issues.length; }).length + ' รายการ (ดูแท็บ "ตรวจสอบข้อมูล" บนเว็บ)');
  Logger.log('ผู้ช่วย AI: ' + (prop_('ANTHROPIC_API_KEY', '') ? 'พร้อมใช้งาน' : 'ยังไม่ได้ตั้ง ANTHROPIC_API_KEY'));
  Logger.log('อีเมลเตือน: ' + (alertTriggerOn_() ? 'เปิด' : 'ปิด (รัน installAlertTrigger เพื่อเปิด)') +
             ' · ผู้รับ: ' + alertRecipients_().join(', '));
}

/** dropdown "Status Payment" ในชีต + "สถานะใบเสร็จ" ใน Receipt_Tracking */
function applyStatusDropdowns() {
  const src = findDataSheet_();
  const sh = src.sheet;
  const n = Math.max(sh.getMaxRows() - src.headerRow, 1);
  sh.getRange(src.headerRow + 1, src.map.payStatus + 1, n, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(PAY_STATUSES, true).setAllowInvalid(true).build());

  const rc = ss_().getSheetByName(CFG.SHEET_RECEIPT);
  if (rc) {
    rc.getRange(2, 5, Math.max(rc.getMaxRows() - 1, 1), 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(RECEIPT_STATUSES, true).setAllowInvalid(true).build());
  }
}

/** เมนูในสเปรดชีต (ทำงานเมื่อ script ผูกกับชีต) */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('⚙️ Billboard Rental')
    .addItem('ติดตั้งระบบครั้งแรก', 'setupSystem')
    .addItem('ล้าง Cache ข้อมูล', 'menuClearCache')
    .addItem('ตั้ง Dropdown สถานะในชีต', 'applyStatusDropdowns')
    .addSeparator()
    .addItem('ดูรายการข้อมูลที่แก้อัตโนมัติได้', 'previewDataFixes')
    .addItem('แก้ข้อมูลอัตโนมัติ (วันที่ / คำสะกด / ช่องว่าง)', 'applyDataFixes')
    .addSeparator()
    .addItem('เปิดการเตือนทางอีเมล (ทุกวัน)', 'installAlertTrigger')
    .addItem('ปิดการเตือนทางอีเมล', 'removeAlertTrigger')
    .addItem('ตรวจและส่งอีเมลเตือนตอนนี้', 'dailyAlertCheck')
    .addItem('ส่งอีเมลทดสอบ', 'testAlertEmail')
    .addToUi();
}

function menuClearCache() {
  invalidateData_();
  SpreadsheetApp.getUi().alert('ล้าง Cache เรียบร้อย');
}
