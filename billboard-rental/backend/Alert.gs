/**
 * Alert.gs — อีเมลแจ้งเตือนดิวจ่ายค่าเช่า / จ่ายเช็ค
 *
 * dailyAlertCheck() รันทุกวันประมาณ 08:00 น. (Time-driven trigger) — ส่งเฉพาะวันที่มีรายการ:
 *   1) แจ้งเตือนล่วงหน้า ครั้งที่ 1 ก่อนถึงกำหนด 7 วัน · ครั้งที่ 2 ก่อนถึงกำหนด 3 วัน   (ALERT.OFFSETS)
 *      วันที่ต้องจ่าย = "ว/ด/ป ชำระตามสัญญา" (ยังไม่เบิก) หรือ "เช็คลงวันที่" (เบิกแล้ว รอจ่ายเช็ค)
 *   2) วันที่ 1 ของทุกเดือน: สรุปงานทั้งหมดของเดือนนั้นในปีนั้น (ตามวันชำระตามสัญญา) ทั้งที่เบิกแล้วและรอเบิก
 *
 * ผู้รับ: ALERT.DEFAULT_TO — เปลี่ยน/เพิ่มได้ที่ Script Property NOTICE_EMAILS (คั่นด้วย ,)
 * เปลี่ยนจำนวนวันล่วงหน้า: Script Property ALERT_OFFSETS เช่น 7,3
 *
 * เปิดใช้งาน: รัน installAlertTrigger() จาก editor ครั้งเดียว (หรือเมนู ⚙️ Billboard Rental)
 *   — ลบ trigger เดิมของ Billboard ERP (sendPaymentAlertEmails) ให้อัตโนมัติ กันอีเมลซ้ำ
 * ทดสอบ: testAlertEmail() / testMonthlyEmail() — ส่งตัวอย่างให้ CFG.ADMIN_EMAIL คนเดียว
 */

const ALERT = {
  OFFSETS:     [7, 3],                       // ครั้งที่ 1 ล่วงหน้า 7 วัน · ครั้งที่ 2 ล่วงหน้า 3 วัน
  MONTHLY_DAY: 1,                            // วันที่ส่งสรุปประจำเดือน
  HOUR:        8,
  HANDLER:     'dailyAlertCheck',
  OLD_HANDLER: 'sendPaymentAlertEmails',     // trigger ของโค้ด Billboard ERP เดิม
  DEFAULT_TO:  ['pitinan.yo@planbmedia.co.th', 'vanidarat.si@planbmedia.co.th', 'jiraporn@planbmedia.co.th']
};

const TH_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
                   'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

function alertOffsets_() {
  const fromProp = prop_('ALERT_OFFSETS', '').split(/[,\s]+/).filter(String).map(Number)
    .filter(function (n) { return n >= 0 && n <= 60 && Math.floor(n) === n; });
  return (fromProp.length ? fromProp : ALERT.OFFSETS.slice()).sort(function (a, b) { return b - a; });
}

function validEmail_(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function alertRecipients_() {
  const fromProp = prop_('NOTICE_EMAILS', '')
    .split(/[,;\s]+/).map(function (s) { return s.trim().toLowerCase(); }).filter(validEmail_);
  return fromProp.length ? fromProp : ALERT.DEFAULT_TO.slice();
}

/** อีเมลของผู้ใช้ที่ล็อกอิน — บัญชีแบบชื่อผู้ใช้ (ไม่มี @) ส่งไปที่ CFG.ADMIN_EMAIL แทน */
function selfEmail_(me) {
  const e = String(me && me.email || '').toLowerCase();
  return validEmail_(e) ? e : CFG.ADMIN_EMAIL;
}

function alertTriggerOn_() {
  return ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === ALERT.HANDLER; });
}

/* ---------- รูปแบบ ---------- */

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

/** 'yyyy-MM' -> 'ตุลาคม 2026' */
function thMonthLabel_(ym) {
  return TH_MONTHS[+ym.slice(5, 7) - 1] + ' ' + ym.slice(0, 4);
}

function byPayDate_(a, b) { return a.payDate < b.payDate ? -1 : a.payDate > b.payDate ? 1 : 0; }

const MAIL_TH = 'style="text-align:left;padding:8px 10px;background:#F8FAFC;border-bottom:1px solid #E2E8F0;font-size:12px;color:#334155"';
const MAIL_TD = 'style="padding:8px 10px;border-bottom:1px solid #F1F5F9;font-size:13px;vertical-align:top"';

/** ตารางแจ้งเตือนล่วงหน้า (งวดจาก payGroups_) */
function alertTable_(title, color, rows) {
  if (!rows.length) return '';
  const total = rows.reduce(function (s, d) { return s + d.amount; }, 0);
  return '<h3 style="margin:22px 0 8px;font-size:15px;color:' + color + '">' + htmlEsc_(title) +
    ' (' + rows.length + ' รายการ · ' + fmtMoney_(total) + ' บาท)</h3>' +
    '<table style="border-collapse:collapse;width:100%;font-family:Arial,sans-serif">' +
    '<tr><th ' + MAIL_TH + '>วันที่ต้องจ่าย</th><th ' + MAIL_TH + '>ผู้รับเงิน (Vendor)</th><th ' + MAIL_TH + '>Media Site</th>' +
    '<th ' + MAIL_TH + '>Contract No.</th><th ' + MAIL_TH + ' align="right">ยอดเงิน (บาท)</th></tr>' +
    rows.map(function (d) {
      const left = d.daysToPay === 0 ? 'วันนี้' : d.daysToPay > 0 ? 'อีก ' + d.daysToPay + ' วัน' : 'เลยมา ' + (-d.daysToPay) + ' วัน';
      const kind = d.payKind === 'cheque' ? 'เช็คลงวันที่' : 'ชำระตามสัญญา';
      return '<tr><td ' + MAIL_TD + '><b>' + fmtThDate_(d.payDate) + '</b><br><span style="color:' + color + ';font-size:12px">' +
        left + ' · ' + kind + '</span></td>' +
        '<td ' + MAIL_TD + '><b>' + htmlEsc_(d.vendorName || '-') + '</b></td>' +
        '<td ' + MAIL_TD + '>' + htmlEsc_(d.mediaSite || '-') + '</td>' +
        '<td ' + MAIL_TD + '>' + htmlEsc_(d.contractNo || '-') + '</td>' +
        '<td ' + MAIL_TD + ' align="right"><b>' + fmtMoney_(d.amount) + '</b></td></tr>';
    }).join('') + '</table>';
}

function buildEmail_(subject, intro, sections) {
  const site = prop_('SITE_URL', '');
  const html =
    '<div style="font-family:Arial,sans-serif;color:#0F172A;max-width:900px">' +
    '<div style="font-size:18px;font-weight:bold;margin-bottom:4px">Plan B — Billboard Rental Hub</div>' +
    '<div style="color:#475569;font-size:13px">' + htmlEsc_(intro) + '</div>' +
    sections.join('') +
    (site ? '<p style="margin-top:22px"><a href="' + htmlEsc_(site) + '" style="background:#E4002B;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-size:13px">เปิดระบบ Billboard Rental Hub</a></p>' : '') +
    '<p style="color:#94A3B8;font-size:11px;margin-top:22px">อีเมลอัตโนมัติจากระบบ — กรุณาตรวจสอบกระแสเงินสดและจัดเตรียมเช็คให้ทันกำหนด</p></div>';
  return { subject: subject, html: html };
}

function sendEmail_(to, email) {
  MailApp.sendEmail({ to: to.join(','), subject: email.subject, htmlBody: email.html, name: 'Billboard Rental Hub' });
}

/* ---------- 1) แจ้งเตือนล่วงหน้า 7 วัน / 3 วัน ---------- */

/** อีเมลแจ้งเตือนล่วงหน้าของวันนี้ — คืน null ถ้าไม่มีรายการ */
function advanceEmail_() {
  const groups = payGroups_(readRentals_()).filter(function (g) { return g.amount && g.payAlert !== 'prior'; });
  const offsets = alertOffsets_();
  const sections = [], parts = [];
  offsets.forEach(function (n, i) {
    const rows = groups.filter(function (g) { return g.daysToPay === n; }).sort(byPayDate_);
    if (!rows.length) return;
    const round = offsets.length > 1 ? 'ครั้งที่ ' + (i + 1) + ' · ' : '';
    parts.push('อีก ' + n + ' วัน ' + rows.length);
    sections.push(alertTable_(round + 'ครบกำหนดจ่ายในอีก ' + n + ' วัน (' + fmtThDate_(addDays_(todayISO_(), n)) + ')',
                              n <= 3 ? '#DC2626' : '#D97706', rows));
  });
  if (!sections.length) return null;
  const email = buildEmail_('⏰ [Billboard Rental] แจ้งเตือนดิวจ่ายล่วงหน้า — ' + parts.join(' · ') + ' รายการ',
    'แจ้งเตือนล่วงหน้า ' + offsets.map(function (n, i) { return 'ครั้งที่ ' + (i + 1) + ' ก่อน ' + n + ' วัน'; }).join(' / ') +
    ' · ตรวจสอบ ณ วันที่ ' + fmtThDate_(todayISO_()), sections);
  email.summary = parts.join(', ');
  return email;
}

/* ---------- 2) สรุปประจำเดือน ---------- */

/**
 * งานทั้งหมดของเดือน ym ('yyyy-MM') ตามวันชำระตามสัญญา — ทั้งเบิกแล้ว/รอเบิก
 * รวมแถวรายเดือนที่ใช้วันชำระเดียวกันเป็นงวดเดียว (ราย 3 เดือน / รายปี)
 */
function monthGroups_(data, ym) {
  const map = {};
  data.forEach(function (d) {
    if (!d.dueDate || d.dueDate.slice(0, 7) !== ym) return;
    const key = [d.contractNo, d.vendorNo, d.mediaSite, d.dueDate].join('|');
    if (!map[key]) {
      map[key] = { id: d.id, contractNo: d.contractNo, vendorName: d.vendorName, mediaSite: d.mediaSite,
                   mediaType: d.mediaType, payment: d.payment, dueDate: d.dueDate, chequeDate: d.chequeDate,
                   memoInv: d.memoInv, payStatus: d.payStatus, amount: 0, months: [] };
    }
    const g = map[key];
    g.amount += d.installment;
    g.months.push(d.month);
    if (d.payStatus !== PAY_DONE) g.payStatus = d.payStatus || 'รอเบิก';
    if (!g.chequeDate && d.chequeDate) g.chequeDate = d.chequeDate;
    if (!g.memoInv && d.memoInv) g.memoInv = d.memoInv;
  });
  return Object.keys(map).map(function (k) { return map[k]; })
    .sort(function (a, b) { return a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : (a.vendorName < b.vendorName ? -1 : 1); });
}

function monthTable_(title, color, rows) {
  if (!rows.length) return '';
  const total = rows.reduce(function (s, d) { return s + d.amount; }, 0);
  return '<h3 style="margin:22px 0 8px;font-size:15px;color:' + color + '">' + htmlEsc_(title) +
    ' (' + rows.length + ' รายการ · ' + fmtMoney_(total) + ' บาท)</h3>' +
    '<table style="border-collapse:collapse;width:100%;font-family:Arial,sans-serif">' +
    '<tr><th ' + MAIL_TH + '>ชำระตามสัญญา</th><th ' + MAIL_TH + '>ผู้รับเงิน (Vendor)</th><th ' + MAIL_TH + '>Media Site</th>' +
    '<th ' + MAIL_TH + '>Contract No. / การจ่าย</th><th ' + MAIL_TH + '>เช็คลงวันที่ / MEMO-INV</th>' +
    '<th ' + MAIL_TH + ' align="right">ยอดเงิน (บาท)</th></tr>' +
    rows.map(function (d) {
      const span = d.months.length > 1 ? ' (' + d.months[0] + ' – ' + d.months[d.months.length - 1] + ')' : '';
      return '<tr><td ' + MAIL_TD + '><b>' + fmtThDate_(d.dueDate) + '</b></td>' +
        '<td ' + MAIL_TD + '><b>' + htmlEsc_(d.vendorName || '-') + '</b></td>' +
        '<td ' + MAIL_TD + '>' + htmlEsc_(d.mediaSite || '-') + '</td>' +
        '<td ' + MAIL_TD + '>' + htmlEsc_(d.contractNo || '-') + '<br><span style="color:#64748B;font-size:12px">' +
          htmlEsc_(d.payment + span) + '</span></td>' +
        '<td ' + MAIL_TD + '>' + (d.chequeDate ? fmtThDate_(d.chequeDate) : '-') + '<br><span style="color:#64748B;font-size:12px">' +
          htmlEsc_(d.memoInv || '-') + '</span></td>' +
        '<td ' + MAIL_TD + ' align="right"><b>' + fmtMoney_(d.amount) + '</b></td></tr>';
    }).join('') + '</table>';
}

/** อีเมลสรุปงานของเดือน ym — ส่งได้แม้ไม่มีรายการ (แจ้งว่าไม่มี) */
function monthlyEmail_(ym) {
  const rows = monthGroups_(readRentals_(), ym);
  const wait = rows.filter(function (g) { return g.payStatus !== PAY_DONE; });
  const done = rows.filter(function (g) { return g.payStatus === PAY_DONE; });
  const total = rows.reduce(function (s, g) { return s + g.amount; }, 0);
  const label = thMonthLabel_(ym);
  const sections = rows.length
    ? [monthTable_('รอเบิก', '#D97706', wait), monthTable_('เบิกแล้ว', '#059669', done)].filter(String)
    : ['<p style="margin-top:18px">ไม่มีรายการที่ครบกำหนดชำระในเดือน ' + htmlEsc_(label) + '</p>'];
  const email = buildEmail_('📅 [Billboard Rental] สรุปงานเดือน' + label + ' — ' + rows.length + ' รายการ · ' + fmtMoney_(total) + ' บาท',
    'รายการค่าเช่าที่ครบกำหนดชำระตามสัญญาในเดือน' + label + ' ทั้งหมด (รอเบิก ' + wait.length + ' · เบิกแล้ว ' + done.length + ')' +
    ' · ข้อมูล ณ วันที่ ' + fmtThDate_(todayISO_()), sections);
  email.count = rows.length;
  email.summary = 'สรุปเดือน ' + ym + ' ' + rows.length + ' รายการ';
  return email;
}

/* ---------- Trigger รายวัน ---------- */

/** รันอัตโนมัติทุกวัน — ห้ามเปลี่ยนชื่อ (ผูกกับ trigger) */
function dailyAlertCheck() {
  invalidateData_();
  const to = alertRecipients_();
  const done = [];

  const adv = advanceEmail_();
  if (adv) {
    sendEmail_(to, adv);
    done.push(adv.summary);
  }
  const today = todayISO_();
  if (+today.slice(8, 10) === ALERT.MONTHLY_DAY) {
    const mon = monthlyEmail_(today.slice(0, 7));
    sendEmail_(to, mon);
    done.push(mon.summary);
  }

  if (!done.length) return 'ไม่มีรายการต้องเตือนวันนี้';
  writeLog_('system', 'ALERT_EMAIL', done.join(' | ') + ' → ' + to.join(','));
  return 'ส่งแล้ว: ' + done.join(' | ') + ' → ' + to.join(', ');
}

/** ทดสอบ: ส่งตัวอย่างแจ้งเตือนล่วงหน้าของวันนี้ให้ CFG.ADMIN_EMAIL คนเดียว */
function testAlertEmail() {
  invalidateData_();
  const adv = advanceEmail_() ||
    buildEmail_('[ทดสอบ] Billboard Rental — แจ้งเตือนล่วงหน้า', 'วันนี้ไม่มีรายการที่ครบกำหนดในอีก ' +
                alertOffsets_().join(' / ') + ' วัน', ['<p style="margin-top:18px">ไม่มีรายการ</p>']);
  sendEmail_([CFG.ADMIN_EMAIL], adv);
  Logger.log('ส่งอีเมลทดสอบ → ' + CFG.ADMIN_EMAIL);
}

/** ทดสอบ: ส่งสรุปเดือนนี้ให้ CFG.ADMIN_EMAIL คนเดียว */
function testMonthlyEmail() {
  invalidateData_();
  const mon = monthlyEmail_(todayISO_().slice(0, 7));
  sendEmail_([CFG.ADMIN_EMAIL], mon);
  Logger.log('ส่งสรุปเดือนทดสอบ (' + mon.count + ' รายการ) → ' + CFG.ADMIN_EMAIL);
}

/** เปิดการเตือนอัตโนมัติ — รันจาก editor ครั้งเดียว */
function installAlertTrigger() {
  removeAlertTrigger();
  ScriptApp.newTrigger(ALERT.HANDLER).timeBased().everyDays(1).atHour(ALERT.HOUR).create();
  Logger.log('เปิดการเตือนทางอีเมลแล้ว — ตรวจทุกวันประมาณ ' + ALERT.HOUR + ':00 น. · เตือนล่วงหน้า ' +
             alertOffsets_().join(' / ') + ' วัน · สรุปประจำเดือนทุกวันที่ ' + ALERT.MONTHLY_DAY +
             ' · ผู้รับ: ' + alertRecipients_().join(', '));
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
  const triggers = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
  return {
    ok: true,
    triggerOn: triggers.indexOf(ALERT.HANDLER) > -1,
    oldTrigger: triggers.indexOf(ALERT.OLD_HANDLER) > -1,
    hour: ALERT.HOUR,
    offsets: alertOffsets_(),
    monthlyDay: ALERT.MONTHLY_DAY,
    recipientCount: to.length,
    recipients: me.role === 'admin' ? to : []
  };
}

/** admin เปิดการเตือนอัตโนมัติจากหน้าเว็บ (ลบ trigger เดิมของ Billboard ERP ให้ด้วย) */
function apiInstallAlerts_(token) {
  const me = authAdmin_(token);
  if (!me) return forbidden_('ตั้งค่าการแจ้งเตือน');
  installAlertTrigger();
  writeLog_(me.email, 'ALERT_TRIGGER', 'install · offsets ' + alertOffsets_().join('/') + ' · monthly day ' + ALERT.MONTHLY_DAY);
  return apiAlertSettings_(token);
}

/** ดูตัวอย่างอีเมลโดยไม่ส่ง — p.type: 'advance' | 'monthly', p.month: 'yyyy-MM' */
function apiPreviewEmail_(token, p) {
  if (!authAdmin_(token)) return forbidden_('ดูตัวอย่างอีเมล');
  invalidateData_();
  const email = p.type === 'monthly'
    ? monthlyEmail_(/^\d{4}-\d{2}$/.test(p.month || '') ? p.month : todayISO_().slice(0, 7))
    : (advanceEmail_() || buildEmail_('(วันนี้ไม่มีรายการแจ้งเตือนล่วงหน้า)',
        'ไม่มีรายการที่ครบกำหนดในอีก ' + alertOffsets_().join(' / ') + ' วัน', []));
  return { ok: true, subject: email.subject, html: email.html, to: alertRecipients_() };
}

/**
 * admin ส่งอีเมลทันที
 *   p.type 'monthly' + p.month = สรุปงานของเดือนนั้น · อื่น ๆ = แจ้งเตือนล่วงหน้าของวันนี้
 *   p.toSelf = ส่งให้ตัวเองเท่านั้น
 */
function apiSendAlertNow_(token, p) {
  const me = authAdmin_(token);
  if (!me) return forbidden_('ส่งอีเมลแจ้งเตือน');
  invalidateData_();
  const to = p.toSelf ? [selfEmail_(me)] : alertRecipients_();
  let email;
  if (p.type === 'monthly') {
    email = monthlyEmail_(/^\d{4}-\d{2}$/.test(p.month || '') ? p.month : todayISO_().slice(0, 7));
  } else {
    email = advanceEmail_();
    if (!email) return { ok: false, code: 'NO_ITEMS', message: 'วันนี้ไม่มีรายการที่ครบกำหนดในอีก ' + alertOffsets_().join(' / ') + ' วัน' };
  }
  sendEmail_(to, email);
  writeLog_(me.email, 'ALERT_EMAIL', 'manual:' + (email.summary || email.subject) + ' → ' + to.join(','));
  return { ok: true, subject: email.subject, to: to };
}
