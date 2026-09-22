/**
 * ============================================================
 *  EmailReminder.gs — อีเมล "แจ้งเตือนล่วงหน้าก่อนถึงวันที่ต้องทำหนังสือแจ้งเตือน"
 *  ไฟล์เดี่ยว ใช้งานได้ทันที ไม่ต้องพึ่งไฟล์อื่นในระบบ
 * ============================================================
 *  การทำงาน
 *    - ทุกวันประมาณ 08:00 น. อ่านคอลัมน์ AF "วันที่ต้องทำหนังสือแจ้งเตือน"
 *      ของชีต "TEST- Contract Rental 2026 (PB)"
 *    - ถ้าสัญญาใดเหลืออีก 30 วัน หรือ 3 วัน จะถึงวันนั้น → ส่งอีเมลถึง vanidarat.si@planbmedia.co.th
 *    - วันที่ 1 ของเดือน ส่งสรุปรายการที่ถึงกำหนดในเดือนปัจจุบัน
 *    - ข้อมูลในอีเมล: วันที่ต้องจัดทำหนังสือต่อระยะเวลาสัญญา, Contract No., Media Site, ชื่อคู่สัญญา, วันสิ้นสุดสัญญา
 *    - ข้ามสัญญา Write Off และสัญญาที่ "สถานะการต่อสัญญา" = Complete / Not Renew
 *
 *  ติดตั้ง (ครั้งเดียว)
 *    1. Apps Script → ปุ่ม + ข้างคำว่า "ไฟล์" → สคริปต์ → ตั้งชื่อ EmailReminder → วางไฟล์นี้ทั้งไฟล์ → Ctrl+S
 *    2. เลือกฟังก์ชัน reminderInstall → เรียกใช้ → อนุญาตสิทธิ์ (อ่านชีต + ส่งอีเมล)
 *    3. เลือกฟังก์ชัน reminderTest → เรียกใช้ → ตรวจกล่องอีเมล (ได้อีเมล [ทดสอบ])
 *    ไม่ต้อง Deploy — trigger รันโค้ดที่บันทึกไว้ใน editor โดยตรง
 *
 *  ปิด: เรียกใช้ reminderRemove
 *  หมายเหตุ: ถ้าในโปรเจกต์เดียวกันเปิด installNoticeTrigger (ระบบหลัก) ไว้ด้วย
 *           reminderInstall จะปิดตัวนั้นให้อัตโนมัติ กันอีเมลซ้ำ
 * ============================================================
 */

const ER = {
  SPREADSHEET_ID: '11VOe1_OWevonHJc73rKVeDIYJKzzieWxuaXrjvwPDUU',
  SHEET_NAME:     'TEST- Contract Rental 2026 (PB)',
  TO:             'vanidarat.si@planbmedia.co.th',   // หลายคน คั่นด้วย ,
  DAYS_BEFORE:    [30, 3],                           // เตือนเมื่อเหลืออีกกี่วัน
  MONTHLY:        true,                              // วันที่ 1 ส่งสรุปเดือนปัจจุบัน
  HOUR:           8,
  TZ:             'Asia/Bangkok',
  HANDLER:        'reminderDailyCheck',

  // หาคอลัมน์จากชื่อหัวคอลัมน์ (ไม่สนช่องว่าง/ตัวพิมพ์) — ถ้าไม่เจอใช้ตำแหน่งสำรอง (1 = A)
  COLS: {
    notice:       { names: ['วันที่ต้องทำหนังสือแจ้งเตือน'], fallback: 32 },   // AF
    contractNo:   { names: ['Contract No.', 'Contract No'],  fallback: 8 },    // H
    mediaSite:    { names: ['Media Site'],                   fallback: 6 },    // F
    counterparty: { names: ['คู่สัญญา'],                     fallback: 10 },   // J
    endDate:      { names: ['สิ้นสุดสัญญา'],                 fallback: 14 },   // N
    status:       { names: ['Contract Status'],              fallback: 11 },   // K
    renewStatus:  { names: ['สถานะการต่อสัญญา'],             fallback: 0 }     // 0 = ไม่บังคับ
  },
  SKIP_STATUS: ['Write Off'],
  SKIP_RENEW:  ['Complete', 'Not Renew']
};

/* ---------- อ่านชีต ---------- */

function reminderSheet_() {
  let ss;
  try { ss = SpreadsheetApp.openById(ER.SPREADSHEET_ID); } catch (e) { ss = SpreadsheetApp.getActiveSpreadsheet(); }
  const byName = ss.getSheetByName(ER.SHEET_NAME);
  if (byName) return byName;
  // ไม่พบชื่อแท็บ → หาแท็บที่มีหัวคอลัมน์ Contract No.
  const sheets = ss.getSheets();
  for (let i = 0; i < sheets.length; i++) {
    const sh = sheets[i];
    if (!sh.getLastRow() || !sh.getLastColumn()) continue;
    const top = sh.getRange(1, 1, Math.min(5, sh.getLastRow()), sh.getLastColumn()).getDisplayValues();
    if (top.some(function (r) { return r.some(function (c) { return reminderNorm_(c) === 'contractno.'; }); })) return sh;
  }
  throw new Error('ไม่พบชีต "' + ER.SHEET_NAME + '"');
}

function reminderNorm_(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/\s+/g, '');
}

function reminderDate_(v) {
  if (!v) return null;
  if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v) ? null : Utilities.formatDate(v, ER.TZ, 'yyyy-MM-dd');
  const m = String(v).trim().match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (!m) return null;
  let y = +m[3];
  if (y < 100) y += 2000;
  if (y > 2400) y -= 543;
  return Utilities.formatDate(new Date(y, +m[2] - 1, +m[1]), ER.TZ, 'yyyy-MM-dd');
}

function reminderDays_(fromIso, toIso) {
  return Math.round((new Date(toIso) - new Date(fromIso)) / 86400000);
}

/** อ่านทุกแถว → [{ notice, daysLeft, contractNo, mediaSite, counterparty, endDate, status, renewStatus }] */
function reminderRows_(todayIso) {
  const sh = reminderSheet_();
  const lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
  const top = sh.getRange(1, 1, Math.min(5, lastRow), lastCol).getDisplayValues();

  let headerRow = 0;
  for (let r = 0; r < top.length; r++) {
    if (top[r].some(function (c) { return reminderNorm_(c) === 'contractno.'; })) { headerRow = r + 1; break; }
  }
  if (!headerRow) headerRow = 1;
  const header = top[headerRow - 1].map(reminderNorm_);

  const idx = {};
  Object.keys(ER.COLS).forEach(function (k) {
    const names = ER.COLS[k].names.map(reminderNorm_);
    let i = header.findIndex(function (h) { return names.indexOf(h) > -1; });
    if (i < 0) i = ER.COLS[k].fallback - 1;
    idx[k] = i;
  });

  if (lastRow <= headerRow) return [];
  const values = sh.getRange(headerRow + 1, 1, lastRow - headerRow, lastCol).getValues();
  const text = function (row, k) { return idx[k] < 0 ? '' : String(row[idx[k]] == null ? '' : row[idx[k]]).replace(/\s+/g, ' ').trim(); };

  const out = [];
  values.forEach(function (row) {
    const notice = reminderDate_(row[idx.notice]);
    if (!notice) return;
    out.push({
      notice:       notice,
      daysLeft:     reminderDays_(todayIso, notice),
      contractNo:   text(row, 'contractNo'),
      mediaSite:    text(row, 'mediaSite'),
      counterparty: text(row, 'counterparty'),
      endDate:      reminderDate_(row[idx.endDate]),
      status:       text(row, 'status'),
      renewStatus:  text(row, 'renewStatus')
    });
  });
  return out.filter(function (d) {
    return ER.SKIP_STATUS.indexOf(d.status) < 0 && ER.SKIP_RENEW.indexOf(d.renewStatus) < 0;
  });
}

/* ---------- อีเมล ---------- */

function reminderFmt_(iso) {
  if (!iso) return '-';
  const p = iso.split('-');
  return p[2] + '/' + p[1] + '/' + p[0];
}

function reminderEsc_(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

function reminderTable_(title, color, rows) {
  if (!rows.length) return '';
  const th = 'style="text-align:left;padding:8px 10px;background:#F8FAFC;border-bottom:1px solid #E2E8F0;font-size:12px;color:#334155"';
  const td = 'style="padding:8px 10px;border-bottom:1px solid #F1F5F9;font-size:13px;vertical-align:top"';
  return '<h3 style="margin:22px 0 8px;font-size:15px;color:' + color + '">' + reminderEsc_(title) + ' (' + rows.length + ' สัญญา)</h3>' +
    '<table style="border-collapse:collapse;width:100%;font-family:Arial,sans-serif">' +
    '<tr><th ' + th + '>วันที่ต้องจัดทำหนังสือต่อระยะเวลาสัญญา</th><th ' + th + '>Contract No.</th>' +
    '<th ' + th + '>Media Site</th><th ' + th + '>ชื่อคู่สัญญา</th><th ' + th + '>วันสิ้นสุดสัญญา</th></tr>' +
    rows.map(function (d) {
      const left = d.daysLeft === 0 ? 'วันนี้' : d.daysLeft > 0 ? 'อีก ' + d.daysLeft + ' วัน' : 'เลยมา ' + (-d.daysLeft) + ' วัน';
      return '<tr><td ' + td + '><b>' + reminderFmt_(d.notice) + '</b><br><span style="color:' + color + ';font-size:12px">' + left + '</span></td>' +
        '<td ' + td + '><b>' + reminderEsc_(d.contractNo || '-') + '</b></td>' +
        '<td ' + td + '>' + reminderEsc_(d.mediaSite || '-') + '</td>' +
        '<td ' + td + '>' + reminderEsc_(d.counterparty || '-') + '</td>' +
        '<td ' + td + '>' + reminderFmt_(d.endDate) + '</td></tr>';
    }).join('') + '</table>';
}

function reminderSend_(subject, intro, sections) {
  const html =
    '<div style="font-family:Arial,sans-serif;color:#0F172A;max-width:860px">' +
    '<div style="font-size:18px;font-weight:bold;margin-bottom:4px">Plan B — แจ้งเตือนหนังสือต่อสัญญา</div>' +
    '<div style="color:#475569;font-size:13px">' + reminderEsc_(intro) + '</div>' +
    sections.join('') +
    '<p style="color:#94A3B8;font-size:11px;margin-top:22px">อีเมลอัตโนมัติ — ข้อมูลจากคอลัมน์ AF "วันที่ต้องทำหนังสือแจ้งเตือน" ชีต ' +
    reminderEsc_(ER.SHEET_NAME) + '</p></div>';
  MailApp.sendEmail({ to: ER.TO, subject: subject, htmlBody: html, name: 'Contract Rental Hub' });
}

/* ---------- ฟังก์ชันที่เรียกใช้ ---------- */

/** รันอัตโนมัติทุกวัน (trigger) — ห้ามเปลี่ยนชื่อ */
function reminderDailyCheck() {
  const today = Utilities.formatDate(new Date(), ER.TZ, 'yyyy-MM-dd');
  const rows = reminderRows_(today).sort(function (a, b) { return a.notice < b.notice ? -1 : 1; });

  const sections = [], parts = [];
  ER.DAYS_BEFORE.slice().sort(function (a, b) { return a - b; }).forEach(function (n) {
    const due = rows.filter(function (d) { return d.daysLeft === n; });
    if (!due.length) return;
    parts.push('อีก ' + n + ' วัน ' + due.length);
    sections.push(reminderTable_('เหลืออีก ' + n + ' วัน ถึงวันที่ต้องทำหนังสือแจ้งเตือน', n <= 7 ? '#DC2626' : '#D97706', due));
  });
  if (ER.MONTHLY && today.slice(8, 10) === '01') {
    const month = rows.filter(function (d) { return d.notice.slice(0, 7) === today.slice(0, 7); });
    if (month.length) {
      parts.push('สรุปเดือนนี้ ' + month.length);
      sections.push(reminderTable_('สรุปรายการที่ต้องทำหนังสือแจ้งเตือนเดือนนี้', '#2563EB', month));
    }
  }
  if (!sections.length) { Logger.log('วันนี้ไม่มีรายการต้องแจ้งเตือน'); return 'ไม่มีรายการ'; }

  reminderSend_('[แจ้งเตือนล่วงหน้า] ใกล้ถึงวันที่ต้องทำหนังสือแจ้งเตือนต่อสัญญา — ' + parts.join(' · ') + ' สัญญา',
    'รายการสัญญาที่ใกล้ถึงวันที่ต้องทำหนังสือแจ้งเตือน ตรวจสอบ ณ วันที่ ' + reminderFmt_(today), sections);
  Logger.log('ส่งแล้ว: ' + parts.join(', ') + ' → ' + ER.TO);
  return 'ส่งแล้ว: ' + parts.join(', ');
}

/** เปิดการแจ้งเตือนอัตโนมัติทุกวัน — รันครั้งเดียว */
function reminderInstall() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    const h = t.getHandlerFunction();
    if (h === ER.HANDLER || h === 'dailyNoticeCheck') ScriptApp.deleteTrigger(t);   // กันอีเมลซ้ำกับระบบหลัก
  });
  ScriptApp.newTrigger(ER.HANDLER).timeBased().everyDays(1).atHour(ER.HOUR).inTimezone(ER.TZ).create();
  const n = reminderRows_(Utilities.formatDate(new Date(), ER.TZ, 'yyyy-MM-dd')).length;
  Logger.log('เปิดแจ้งเตือนแล้ว — ตรวจทุกวันประมาณ ' + ER.HOUR + ':00 น. · เตือนเมื่อเหลือ ' + ER.DAYS_BEFORE.join(' / ') +
             ' วัน · ผู้รับ ' + ER.TO + ' · พบสัญญาที่มีวันที่แจ้งเตือน ' + n + ' รายการ');
}

/** ปิดการแจ้งเตือนอัตโนมัติ */
function reminderRemove() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === ER.HANDLER) ScriptApp.deleteTrigger(t);
  });
  Logger.log('ปิดแจ้งเตือนแล้ว');
}

/** ส่งอีเมลทดสอบทันที — รายการที่ถึงกำหนดในเดือนนี้ และภายใน 30 วันข้างหน้า */
function reminderTest() {
  const today = Utilities.formatDate(new Date(), ER.TZ, 'yyyy-MM-dd');
  const max = Math.max.apply(null, ER.DAYS_BEFORE);
  const rows = reminderRows_(today)
    .filter(function (d) { return d.notice.slice(0, 7) === today.slice(0, 7) || (d.daysLeft >= 0 && d.daysLeft <= max); })
    .sort(function (a, b) { return a.notice < b.notice ? -1 : 1; });
  reminderSend_('[ทดสอบ] แจ้งเตือนล่วงหน้า — วันที่ต้องทำหนังสือแจ้งเตือน (' + rows.length + ' สัญญา)',
    'อีเมลทดสอบ ณ วันที่ ' + reminderFmt_(today) + ' — รายการในเดือนนี้และภายใน ' + max + ' วันข้างหน้า ' +
    '(อีเมลจริงส่งเฉพาะวันที่เหลืออีก ' + ER.DAYS_BEFORE.join(' / ') + ' วัน)',
    [rows.length ? reminderTable_('รายการที่ใกล้ถึงวันที่ต้องทำหนังสือแจ้งเตือน', '#D97706', rows)
                 : '<p style="margin-top:18px">ไม่มีสัญญาที่ถึงกำหนดในช่วงนี้</p>']);
  Logger.log('ส่งอีเมลทดสอบ ' + rows.length + ' สัญญา → ' + ER.TO);
}
