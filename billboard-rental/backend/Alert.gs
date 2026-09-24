/**
 * Alert.gs — อีเมลแจ้งเตือนดิวจ่ายค่าเช่า / จ่ายเช็คล่วงหน้า
 *
 * dailyAlertCheck() รันทุกวันประมาณ 08:00 น. (Time-driven trigger) — ส่งอีเมล 1 ฉบับต่อวัน เฉพาะวันที่มีรายการ:
 *   - เหลืออีก ALERT.OFFSETS วัน (ค่าเริ่มต้น 3 วัน เหมือนระบบเดิม) ถึงวันที่ต้องจ่าย
 *     วันที่ต้องจ่าย = "ว/ด/ป ชำระตามสัญญา" (ยังไม่เบิก) หรือ "เช็คลงวันที่" (เบิกแล้ว รอจ่ายเช็ค)
 *   - วันจันทร์: สรุปรายการที่เลยกำหนดแล้วแต่ยังไม่เบิก
 *
 * ผู้รับ: CFG.ADMIN_EMAIL — เปลี่ยน/เพิ่มได้ที่ Script Property NOTICE_EMAILS (คั่นด้วย ,)
 * เปลี่ยนจำนวนวันล่วงหน้า: Script Property ALERT_OFFSETS เช่น 7,3
 *
 * เปิดใช้งาน: รัน installAlertTrigger() จาก editor ครั้งเดียว (หรือเมนู ⚙️ Billboard Rental)
 *   — ลบ trigger เดิมของ Billboard ERP (sendPaymentAlertEmails) ให้อัตโนมัติ กันอีเมลซ้ำ/ error
 * ทดสอบ: รัน testAlertEmail() — ส่งอีเมลตัวอย่างทันที
 */

const ALERT = {
  OFFSETS:     [3],
  HOUR:        8,
  HANDLER:     'dailyAlertCheck',
  OLD_HANDLER: 'sendPaymentAlertEmails'      // trigger ของโค้ด Billboard ERP เดิม
};

function alertOffsets_() {
  const fromProp = prop_('ALERT_OFFSETS', '').split(/[,\s]+/).filter(String).map(Number)
    .filter(function (n) { return n >= 0 && n <= 60 && Math.floor(n) === n; });
  return fromProp.length ? fromProp : ALERT.OFFSETS.slice();
}

function alertRecipients_() {
  const fromProp = prop_('NOTICE_EMAILS', '')
    .split(/[,;\s]+/).map(function (s) { return s.trim().toLowerCase(); })
    .filter(function (s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s); });
  return fromProp.length ? fromProp : [CFG.ADMIN_EMAIL];
}

function alertTriggerOn_() {
  return ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === ALERT.HANDLER; });
}

/* ---------- อีเมล ---------- */

function fmtThDate_(iso) {
  if (!iso) return '-';
  const p = iso.split('-');
  return p[2] + '/' + p[1] + '/' + p[0];
}

function htmlEsc_(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

function fmtMoney_(n) {
  return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function alertTable_(title, color, rows) {
  if (!rows.length) return '';
  const th = 'style="text-align:left;padding:8px 10px;background:#F8FAFC;border-bottom:1px solid #E2E8F0;font-size:12px;color:#334155"';
  const td = 'style="padding:8px 10px;border-bottom:1px solid #F1F5F9;font-size:13px;vertical-align:top"';
  const total = rows.reduce(function (s, d) { return s + d.installment; }, 0);
  return '<h3 style="margin:22px 0 8px;font-size:15px;color:' + color + '">' + htmlEsc_(title) +
    ' (' + rows.length + ' รายการ · ' + fmtMoney_(total) + ' บาท)</h3>' +
    '<table style="border-collapse:collapse;width:100%;font-family:Arial,sans-serif">' +
    '<tr><th ' + th + '>วันที่ต้องจ่าย</th><th ' + th + '>ผู้รับเงิน (Vendor)</th><th ' + th + '>Media Site</th>' +
    '<th ' + th + '>Contract No.</th><th ' + th + ' align="right">ยอดต่องวด (บาท)</th></tr>' +
    rows.map(function (d) {
      const left = d.daysToPay === 0 ? 'วันนี้' : d.daysToPay > 0 ? 'อีก ' + d.daysToPay + ' วัน' : 'เลยมา ' + (-d.daysToPay) + ' วัน';
      const kind = d.payKind === 'cheque' ? 'เช็คลงวันที่' : 'ชำระตามสัญญา';
      return '<tr><td ' + td + '><b>' + fmtThDate_(d.payDate) + '</b><br><span style="color:' + color + ';font-size:12px">' +
        left + ' · ' + kind + '</span></td>' +
        '<td ' + td + '><b>' + htmlEsc_(d.vendorName || '-') + '</b></td>' +
        '<td ' + td + '>' + htmlEsc_(d.mediaSite || '-') + '</td>' +
        '<td ' + td + '>' + htmlEsc_(d.contractNo || '-') + '</td>' +
        '<td ' + td + ' align="right"><b>' + fmtMoney_(d.installment) + '</b></td></tr>';
    }).join('') + '</table>';
}

function sendAlertEmail_(to, subject, intro, sections) {
  const site = prop_('SITE_URL', '');
  const html =
    '<div style="font-family:Arial,sans-serif;color:#0F172A;max-width:860px">' +
    '<div style="font-size:18px;font-weight:bold;margin-bottom:4px">Plan B — Billboard Rental Hub</div>' +
    '<div style="color:#475569;font-size:13px">' + htmlEsc_(intro) + '</div>' +
    sections.join('') +
    (site ? '<p style="margin-top:22px"><a href="' + htmlEsc_(site) + '" style="background:#E4002B;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-size:13px">เปิดระบบ Billboard Rental Hub</a></p>' : '') +
    '<p style="color:#94A3B8;font-size:11px;margin-top:22px">อีเมลอัตโนมัติจากระบบ — กรุณาตรวจสอบกระแสเงินสดและจัดเตรียมเช็คให้ทันกำหนด</p></div>';
  MailApp.sendEmail({ to: to.join(','), subject: subject, htmlBody: html, name: 'Billboard Rental Hub' });
}

function byPayDate_(a, b) { return a.payDate < b.payDate ? -1 : a.payDate > b.payDate ? 1 : 0; }

/* ---------- Trigger รายวัน ---------- */

/** รันอัตโนมัติทุกวัน — ห้ามเปลี่ยนชื่อ (ผูกกับ trigger) */
function dailyAlertCheck() {
  invalidateData_();
  const data = readRentals_().filter(function (d) { return d.payDate && d.installment; });
  const offsets = alertOffsets_().sort(function (a, b) { return a - b; });
  const sections = [], parts = [];

  offsets.forEach(function (n) {
    const rows = data.filter(function (d) { return d.daysToPay === n; }).sort(byPayDate_);
    if (!rows.length) return;
    parts.push((n === 0 ? 'วันนี้ ' : 'อีก ' + n + ' วัน ') + rows.length);
    sections.push(alertTable_(n === 0 ? 'ครบกำหนดจ่ายวันนี้' : 'ครบกำหนดจ่ายในอีก ' + n + ' วัน', n <= 3 ? '#DC2626' : '#D97706', rows));
  });
  if (new Date().getDay() === 1) {                               // วันจันทร์
    const overdue = data.filter(function (d) { return d.payAlert === 'overdue'; }).sort(byPayDate_);
    if (overdue.length) {
      parts.push('เลยกำหนด ' + overdue.length);
      sections.push(alertTable_('เลยกำหนดชำระแล้ว แต่ยังไม่เบิก', '#7F1D1D', overdue));
    }
  }
  if (!sections.length) return 'ไม่มีรายการต้องเตือนวันนี้';

  const to = alertRecipients_();
  sendAlertEmail_(to, '⏰ [Billboard Rental] แจ้งเตือนดิวจ่ายค่าเช่า — ' + parts.join(' · ') + ' รายการ',
    'รายการค่าเช่าที่ใกล้ถึงกำหนดจ่าย ตรวจสอบ ณ วันที่ ' + fmtThDate_(todayISO_()), sections);
  writeLog_('system', 'ALERT_EMAIL', parts.join(', ') + ' → ' + to.join(','));
  return 'ส่งแล้ว: ' + parts.join(', ') + ' → ' + to.join(', ');
}

/** รายการภายใน DUE_SOON_DAYS วัน + เลยกำหนด (ใช้กับอีเมลทดสอบ / ส่งเองจากหน้าเว็บ) */
function alertDigestSections_() {
  const data = readRentals_().filter(function (d) { return d.payDate && d.installment; });
  const soon = data.filter(function (d) { return d.daysToPay >= 0 && d.daysToPay <= CFG.DUE_SOON_DAYS; }).sort(byPayDate_);
  const overdue = data.filter(function (d) { return d.payAlert === 'overdue'; }).sort(byPayDate_);
  return {
    count: soon.length + overdue.length,
    sections: [
      alertTable_('ครบกำหนดจ่ายภายใน ' + CFG.DUE_SOON_DAYS + ' วัน', '#D97706', soon),
      alertTable_('เลยกำหนดชำระแล้ว แต่ยังไม่เบิก', '#7F1D1D', overdue)
    ].filter(String)
  };
}

/** ทดสอบ: ส่งอีเมลตัวอย่างทันที (ไม่ต้องรอให้ตรงวัน) */
function testAlertEmail() {
  invalidateData_();
  const dg = alertDigestSections_();
  const to = alertRecipients_();
  sendAlertEmail_(to, '[ทดสอบ] Billboard Rental — รายการครบกำหนดจ่าย (' + dg.count + ' รายการ)',
    'อีเมลทดสอบ ณ วันที่ ' + fmtThDate_(todayISO_()) + ' (อีเมลจริงจะส่งเฉพาะวันที่เหลืออีก ' + alertOffsets_().join(' / ') + ' วัน)',
    dg.sections.length ? dg.sections : ['<p style="margin-top:18px">ไม่มีรายการที่ครบกำหนดในช่วงนี้</p>']);
  writeLog_('system', 'ALERT_EMAIL', 'test:' + dg.count + ' → ' + to.join(','));
  Logger.log('ส่งอีเมลทดสอบ ' + dg.count + ' รายการ → ' + to.join(', '));
}

/** เปิดการเตือนอัตโนมัติ — รันจาก editor ครั้งเดียว */
function installAlertTrigger() {
  removeAlertTrigger();
  ScriptApp.newTrigger(ALERT.HANDLER).timeBased().everyDays(1).atHour(ALERT.HOUR).create();
  Logger.log('เปิดการเตือนทางอีเมลแล้ว — ตรวจทุกวันประมาณ ' + ALERT.HOUR + ':00 น. · เตือนเมื่อเหลือ ' +
             alertOffsets_().join(' / ') + ' วัน · ผู้รับ: ' + alertRecipients_().join(', '));
}

/** ปิดการเตือน (ลบ trigger เดิมของ Billboard ERP ด้วย) */
function removeAlertTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    const h = t.getHandlerFunction();
    if (h === ALERT.HANDLER || h === ALERT.OLD_HANDLER) ScriptApp.deleteTrigger(t);
  });
}

/* ---------- API ---------- */

function apiAlertSettings_(token) {
  const me = auth_(token);
  const to = alertRecipients_();
  return {
    ok: true,
    triggerOn: alertTriggerOn_(),
    hour: ALERT.HOUR,
    offsets: alertOffsets_(),
    recipientCount: to.length,
    recipients: me.role === 'admin' ? to : []
  };
}

/** admin ส่งสรุปรายการครบกำหนดทันที — p.toSelf = ส่งให้ตัวเองเท่านั้น */
function apiSendAlertNow_(token, p) {
  const me = authAdmin_(token);
  if (!me) return forbidden_('ส่งอีเมลแจ้งเตือน');
  invalidateData_();
  const dg = alertDigestSections_();
  const to = p.toSelf ? [String(me.email).toLowerCase()] : alertRecipients_();
  sendAlertEmail_(to, '⏰ [Billboard Rental] สรุปรายการครบกำหนดจ่าย (' + dg.count + ' รายการ)',
    'ส่งโดย ' + me.email + ' ณ วันที่ ' + fmtThDate_(todayISO_()),
    dg.sections.length ? dg.sections : ['<p style="margin-top:18px">ไม่มีรายการที่ครบกำหนดในช่วงนี้</p>']);
  writeLog_(me.email, 'ALERT_EMAIL', 'manual:' + dg.count + ' → ' + to.join(','));
  return { ok: true, sent: dg.count, to: to };
}
