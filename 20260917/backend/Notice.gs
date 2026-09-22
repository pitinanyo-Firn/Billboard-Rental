/**
 * Notice.gs — อีเมล "แจ้งเตือนล่วงหน้าก่อนถึงวันที่ต้องทำหนังสือแจ้งเตือน"
 *
 * อิงคอลัมน์ AF "วันที่ต้องทำหนังสือแจ้งเตือน" ของชีต TEST- Contract Rental 2026 (PB)
 *
 * dailyNoticeCheck() รันทุกวันประมาณ 08:00 น. (Time-driven trigger) — ส่งอีเมล 1 ฉบับต่อวัน เฉพาะวันที่มีรายการ:
 *   1) เหลืออีก 30 วัน ถึงวันที่ต้องทำหนังสือแจ้งเตือน   (NOTICE.OFFSETS)
 *   2) เหลืออีก 3 วัน  ถึงวันที่ต้องทำหนังสือแจ้งเตือน
 *   3) วันที่ 1 ของเดือน — สรุปรายการที่ต้องทำหนังสือในเดือนปัจจุบัน
 *   ข้าม: สัญญา Write Off และสัญญาที่ "สถานะการต่อสัญญา" = Complete / Not Renew
 *
 * ข้อมูลในอีเมล: วันที่ต้องจัดทำหนังสือต่อระยะเวลาสัญญา · Contract No. · Media Site · ชื่อคู่สัญญา · วันสิ้นสุดสัญญา
 *
 * ผู้รับ: vanidarat.si@planbmedia.co.th (NOTICE.DEFAULT_TO) — เปลี่ยน/เพิ่มได้ที่ Script Property NOTICE_EMAILS (คั่นด้วย ,)
 * ลิงก์ในอีเมล: Script Property SITE_URL (เช่น https://contract-woad.vercel.app/frontend/)
 *
 * เปิดใช้งาน: รัน installNoticeTrigger() จาก editor ครั้งเดียว (หรือเมนู ⚙️ Contract Hub)
 * ทดสอบ:      รัน testNoticeEmail() — ส่งอีเมลตัวอย่างทันที
 * หมายเหตุ:   trigger รันโค้ดที่บันทึกล่าสุดใน editor — ไม่ต้อง Deploy เวอร์ชันใหม่ก็ส่งอีเมลได้
 */

/** ตัวเลือกของคอลัมน์ "สถานะการต่อสัญญา" (dropdown ทั้งบนเว็บและในชีต — ต้องตรงกับ frontend/js/config.js) */
const RENEW_STATUSES = ['Complete', 'On Process', 'Not Renew'];
/** สถานะที่ถือว่าจบแล้ว — ไม่ต้องเตือนทำหนังสืออีก */
const RENEW_DONE = ['Complete', 'Not Renew'];
/** ความยาวสูงสุดของ "สถานะเอกสาร" */
const DOC_STATUS_MAX = 100;

const NOTICE = {
  OFFSETS:         [30, 3],               // แจ้งเตือนเมื่อเหลืออีกกี่วันถึงวันที่ต้องทำหนังสือแจ้งเตือน
  OVERDUE_EVERY:   0,                     // เลยกำหนดแล้ว เตือนซ้ำทุกกี่วัน (0 = ไม่เตือนซ้ำ)
  MONTHLY_SUMMARY: true,                  // วันที่ 1 ของเดือน ส่งสรุปรายการของเดือนปัจจุบัน
  HOUR:            8,                     // เวลาส่ง (โมงเช้า ตาม timezone ของ script)
  HANDLER:         'dailyNoticeCheck',
  DONE_WORD:       'ส่งแล้ว',
  DEFAULT_TO:      ['vanidarat.si@planbmedia.co.th']
};

/* ---------- ผู้รับ / สถานะ ---------- */

function noticeRecipients_() {
  const fromProp = prop_('NOTICE_EMAILS', '')
    .split(/[,;\s]+/).map(function (s) { return s.trim().toLowerCase(); })
    .filter(function (s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s); });
  return fromProp.length ? fromProp : NOTICE.DEFAULT_TO.slice();
}

function noticeTriggerOn_() {
  return ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === NOTICE.HANDLER; });
}

function isNoticeDone_(d) {
  return d.status === 'Write Off' || RENEW_DONE.indexOf(d.renewStatus) > -1 ||
         String(d.renewStatus || '').indexOf(NOTICE.DONE_WORD) > -1;   // รองรับค่าเดิม "ส่งแล้ว"
}

/* ---------- เลือกรายการที่ต้องเตือนวันนี้ ---------- */

function noticeDigest_(data, today) {
  const open = data.filter(function (d) { return d.noticeDeadline && !isNoticeDone_(d); });
  const byOffset = {};
  NOTICE.OFFSETS.forEach(function (n) {
    byOffset[n] = open.filter(function (d) { return d.daysToNotice === n; })
      .sort(function (a, b) { return a.noticeDeadline < b.noticeDeadline ? -1 : 1; });
  });
  const upcoming = [].concat.apply([], NOTICE.OFFSETS.map(function (n) { return byOffset[n]; }));
  const overdue = NOTICE.OVERDUE_EVERY > 0
    ? open.filter(function (d) {
        return d.daysToNotice < 0 && d.daysToExpire !== null && d.daysToExpire >= 0 &&
               (-d.daysToNotice) % NOTICE.OVERDUE_EVERY === 0;
      }).sort(function (a, b) { return a.daysToNotice - b.daysToNotice; })
    : [];
  const monthKey = today.slice(0, 7);
  const monthly = NOTICE.MONTHLY_SUMMARY && today.slice(8, 10) === '01'
    ? data.filter(function (d) { return d.status !== 'Write Off' && d.noticeDeadline && d.noticeDeadline.slice(0, 7) === monthKey; })
          .sort(function (a, b) { return a.noticeDeadline < b.noticeDeadline ? -1 : 1; })
    : [];
  return { byOffset: byOffset, upcoming: upcoming, overdue: overdue, monthly: monthly };
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

/** ตารางในอีเมล — คอลัมน์ตามที่กำหนด */
function noticeTable_(title, color, rows) {
  if (!rows.length) return '';
  const th = 'style="text-align:left;padding:8px 10px;background:#F8FAFC;border-bottom:1px solid #E2E8F0;font-size:12px;color:#334155"';
  const td = 'style="padding:8px 10px;border-bottom:1px solid #F1F5F9;font-size:13px;vertical-align:top"';
  return '<h3 style="margin:22px 0 8px;font-size:15px;color:' + color + '">' + htmlEsc_(title) + ' (' + rows.length + ' สัญญา)</h3>' +
    '<table style="border-collapse:collapse;width:100%;font-family:Arial,sans-serif">' +
    '<tr><th ' + th + '>วันที่ต้องจัดทำหนังสือต่อระยะเวลาสัญญา</th><th ' + th + '>Contract No.</th>' +
    '<th ' + th + '>Media Site</th><th ' + th + '>ชื่อคู่สัญญา</th><th ' + th + '>วันสิ้นสุดสัญญา</th></tr>' +
    rows.map(function (d) {
      const left = d.daysToNotice === 0 ? 'วันนี้'
        : d.daysToNotice > 0 ? 'อีก ' + d.daysToNotice + ' วัน'
        : 'เลยมา ' + (-d.daysToNotice) + ' วัน';
      return '<tr><td ' + td + '><b>' + fmtThDate_(d.noticeDeadline) + '</b><br><span style="color:' + color + ';font-size:12px">' + left + '</span></td>' +
        '<td ' + td + '><b>' + htmlEsc_(d.contractNo || '-') + '</b></td>' +
        '<td ' + td + '>' + htmlEsc_(d.mediaSite || '-') + '</td>' +
        '<td ' + td + '>' + htmlEsc_(d.counterparty || '-') + '</td>' +
        '<td ' + td + '>' + fmtThDate_(d.endDate) + '</td></tr>';
    }).join('') + '</table>';
}

function sendNoticeEmail_(to, subject, intro, sections) {
  const site = prop_('SITE_URL', '');
  const html =
    '<div style="font-family:Arial,sans-serif;color:#0F172A;max-width:860px">' +
    '<div style="font-size:18px;font-weight:bold;margin-bottom:4px">Plan B — Contract Rental Hub</div>' +
    '<div style="color:#475569;font-size:13px">' + htmlEsc_(intro) + '</div>' +
    sections.join('') +
    (site ? '<p style="margin-top:22px"><a href="' + htmlEsc_(site) + '" style="background:#E4002B;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-size:13px">เปิดระบบ Contract Rental Hub</a></p>' : '') +
    '<p style="color:#94A3B8;font-size:11px;margin-top:22px">อีเมลอัตโนมัติจากระบบ — ข้อมูลจากคอลัมน์ "วันที่ต้องทำหนังสือแจ้งเตือน" ' +
    'เปลี่ยน "สถานะการต่อสัญญา" เป็น Complete หรือ Not Renew (บนเว็บแท็บหนังสือแจ้งเตือน หรือในชีต) เพื่อหยุดการเตือน</p></div>';
  MailApp.sendEmail({ to: to.join(','), subject: subject, htmlBody: html, name: 'Contract Rental Hub' });
}

/* ---------- Trigger รายวัน ---------- */

/** รันอัตโนมัติทุกวัน — ห้ามเปลี่ยนชื่อ (ผูกกับ trigger) */
function dailyNoticeCheck() {
  invalidateData_();                                           // อ่านชีตล่าสุด
  const today = todayISO_();
  const dg = noticeDigest_(readContracts_(), today);
  const total = dg.upcoming.length + dg.overdue.length + dg.monthly.length;
  if (!total) return 'ไม่มีรายการต้องเตือนวันนี้';

  const to = noticeRecipients_();
  const parts = [];
  const sections = [];
  if (dg.overdue.length) {
    parts.push('เลยกำหนด ' + dg.overdue.length);
    sections.push(noticeTable_('เลยวันที่ต้องทำหนังสือแจ้งเตือนแล้ว', '#DC2626', dg.overdue));
  }
  NOTICE.OFFSETS.slice().sort(function (a, b) { return a - b; }).forEach(function (n) {
    const rows = dg.byOffset[n];
    if (!rows.length) return;
    parts.push('อีก ' + n + ' วัน ' + rows.length);
    sections.push(noticeTable_('เหลืออีก ' + n + ' วัน ถึงวันที่ต้องทำหนังสือแจ้งเตือน', n <= 7 ? '#DC2626' : '#D97706', rows));
  });
  if (dg.monthly.length) {
    parts.push('สรุปเดือนนี้ ' + dg.monthly.length);
    sections.push(noticeTable_('สรุปรายการที่ต้องทำหนังสือแจ้งเตือนเดือนนี้', '#2563EB', dg.monthly));
  }

  sendNoticeEmail_(to,
    '[แจ้งเตือนล่วงหน้า] ใกล้ถึงวันที่ต้องทำหนังสือแจ้งเตือนต่อสัญญา — ' + parts.join(' · ') + ' สัญญา',
    'รายการสัญญาที่ใกล้ถึงวันที่ต้องทำหนังสือแจ้งเตือน ตรวจสอบ ณ วันที่ ' + fmtThDate_(today),
    sections);
  writeLog_('system', 'NOTICE_EMAIL', parts.join(', ') + ' → ' + to.join(','));
  return 'ส่งแล้ว: ' + parts.join(', ') + ' → ' + to.join(', ');
}

/**
 * ทดสอบ: ส่งอีเมลตัวอย่างทันที (ไม่ต้องรอให้ตรงวัน)
 * แสดงสัญญาที่มีวันที่ต้องทำหนังสือแจ้งเตือนในเดือนปัจจุบัน และภายใน 30 วันข้างหน้า
 */
function testNoticeEmail() {
  invalidateData_();
  const today = todayISO_();
  const until = addDays_(today, Math.max.apply(null, NOTICE.OFFSETS));
  const month = today.slice(0, 7);
  const rows = readContracts_()
    .filter(function (d) {
      return d.noticeDeadline && !isNoticeDone_(d) &&
             (d.noticeDeadline.slice(0, 7) === month || (d.noticeDeadline >= today && d.noticeDeadline <= until));
    })
    .sort(function (a, b) { return a.noticeDeadline < b.noticeDeadline ? -1 : 1; });
  const to = noticeRecipients_();
  sendNoticeEmail_(to,
    '[ทดสอบ] แจ้งเตือนล่วงหน้า — วันที่ต้องทำหนังสือแจ้งเตือน (' + rows.length + ' สัญญา)',
    'อีเมลทดสอบ — รายการที่ถึงกำหนดในเดือนนี้และภายใน ' + Math.max.apply(null, NOTICE.OFFSETS) + ' วันข้างหน้า ณ วันที่ ' + fmtThDate_(today) +
      ' (อีเมลจริงจะส่งเฉพาะวันที่เหลืออีก ' + NOTICE.OFFSETS.join(' / ') + ' วัน)',
    [rows.length ? noticeTable_('รายการที่ใกล้ถึงวันที่ต้องทำหนังสือแจ้งเตือน', '#D97706', rows)
                 : '<p style="margin-top:18px">ไม่มีสัญญาที่ถึงกำหนดในช่วงนี้</p>']);
  writeLog_('system', 'NOTICE_EMAIL', 'test:' + rows.length + ' → ' + to.join(','));
  Logger.log('ส่งอีเมลทดสอบ ' + rows.length + ' สัญญา → ' + to.join(', '));
}

/** เปิดการเตือนอัตโนมัติ — รันจาก editor ครั้งเดียว */
function installNoticeTrigger() {
  removeNoticeTrigger();
  ScriptApp.getProjectTriggers().forEach(function (t) {           // กันอีเมลซ้ำกับไฟล์เดี่ยว EmailReminder.gs
    if (t.getHandlerFunction() === 'reminderDailyCheck') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger(NOTICE.HANDLER).timeBased().everyDays(1).atHour(NOTICE.HOUR).create();
  Logger.log('เปิดการเตือนทางอีเมลแล้ว — ตรวจทุกวันประมาณ ' + NOTICE.HOUR + ':00 น. · เตือนเมื่อเหลือ ' +
             NOTICE.OFFSETS.join(' / ') + ' วัน · ผู้รับ: ' + noticeRecipients_().join(', '));
}

/** ปิดการเตือนอัตโนมัติ */
function removeNoticeTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === NOTICE.HANDLER) ScriptApp.deleteTrigger(t);
  });
}

/* ---------- API ---------- */

function apiNoticeSettings_(token) {
  const me = auth_(token);
  const to = noticeRecipients_();
  return {
    ok: true,
    triggerOn: noticeTriggerOn_(),
    hour: NOTICE.HOUR,
    offsets: NOTICE.OFFSETS,
    overdueEvery: NOTICE.OVERDUE_EVERY,
    recipientCount: to.length,
    recipients: me.role === 'admin' ? to : [],
    monthlySummary: NOTICE.MONTHLY_SUMMARY,
    source: prop_('NOTICE_EMAILS', '') ? 'NOTICE_EMAILS' : 'default'
  };
}

/**
 * admin: แก้ "สถานะการต่อสัญญา" / "สถานะเอกสาร" จากหน้าเว็บ แล้วเขียนกลับลงชีต
 * p: { id: 'C<row>', contractNo, renewStatus?, docStatus? } — ส่งเฉพาะช่องที่ต้องการแก้
 */
function apiUpdateNoticeStatus_(token, p) {
  const me = auth_(token);
  if (me.role !== 'admin') return { ok: false, code: 'FORBIDDEN', message: 'เฉพาะ admin เท่านั้นที่แก้สถานะได้' };

  const row = parseInt(String(p.id || '').replace(/^C/, ''), 10);
  if (!row) return { ok: false, code: 'BAD_REQUEST', message: 'ไม่ระบุสัญญา' };

  const renew = p.renewStatus === undefined || p.renewStatus === null ? null : String(p.renewStatus).trim();
  if (renew !== null && renew !== '' && RENEW_STATUSES.indexOf(renew) < 0) {
    return { ok: false, code: 'INVALID_VALUE', message: 'สถานะการต่อสัญญาต้องเป็น ' + RENEW_STATUSES.join(' / ') };
  }
  const doc = p.docStatus === undefined || p.docStatus === null ? null : String(p.docStatus).replace(/\s+/g, ' ').trim();
  if (doc !== null && doc.length > DOC_STATUS_MAX) {
    return { ok: false, code: 'TOO_LONG', message: 'สถานะเอกสารยาวเกิน ' + DOC_STATUS_MAX + ' ตัวอักษร' };
  }
  if (renew === null && doc === null) return { ok: false, code: 'MISSING_FIELD', message: 'ไม่มีข้อมูลที่ต้องแก้' };

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  let contractNo = '';
  const changes = [];
  try {
    const src = findDataSheet_();
    const sh = src.sheet, map = src.map;
    if (row <= src.headerRow || row > sh.getLastRow()) return { ok: false, code: 'NOT_FOUND', message: 'ไม่พบสัญญาในชีต' };
    if ((renew !== null && map.renewStatus === undefined) || (doc !== null && map.docStatus === undefined)) {
      return { ok: false, code: 'NO_COLUMN', message: 'ชีตไม่มีคอลัมน์ "สถานะการต่อสัญญา" / "สถานะเอกสาร"' };
    }

    // กันเขียนผิดแถว: ถ้ามีคนแทรก/ลบแถวหลังจากหน้าเว็บโหลดข้อมูล เลขที่สัญญาจะไม่ตรง
    contractNo = clean_(sh.getRange(row, map.contractNo + 1).getDisplayValue());
    if (p.contractNo !== undefined && clean_(p.contractNo) !== contractNo) {
      return { ok: false, code: 'STALE', message: 'ข้อมูลในชีตมีการเปลี่ยนแปลง กรุณากด ↻ รีเฟรช แล้วลองใหม่' };
    }

    const write = function (field, value) {
      const cell = sh.getRange(row, map[field] + 1);
      const old = clean_(cell.getDisplayValue());
      if (old === value) return;
      cell.setValue(/^[=+\-@]/.test(value) ? "'" + value : value);   // กันข้อความถูกตีความเป็นสูตร
      changes.push(field + ': "' + old + '" → "' + value + '"');
    };
    if (renew !== null) write('renewStatus', renew);
    if (doc !== null) write('docStatus', doc);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }

  invalidateData_();
  if (changes.length) writeLog_(me.email, 'UPDATE_STATUS', contractNo + ' | ' + changes.join(' | '));
  return { ok: true, id: p.id, renewStatus: renew, docStatus: doc, changed: changes.length, version: dataFingerprint_() };
}

/**
 * ใส่ dropdown ให้คอลัมน์ "สถานะการต่อสัญญา" และจำกัด "สถานะเอกสาร" ไม่เกิน 100 ตัวอักษร ในชีต
 * (setupSystem เรียกให้อัตโนมัติ · รันซ้ำได้)
 */
function applyStatusDropdowns() {
  const src = findDataSheet_();
  const sh = src.sheet, first = src.headerRow + 1;
  const n = Math.max(sh.getMaxRows() - src.headerRow, 1);
  if (src.map.renewStatus !== undefined) {
    sh.getRange(first, src.map.renewStatus + 1, n, 1).setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireValueInList(RENEW_STATUSES, true)
        .setAllowInvalid(false)
        .setHelpText('เลือก: ' + RENEW_STATUSES.join(' / '))
        .build());
  }
  if (src.map.docStatus !== undefined) {
    const a1 = sh.getRange(first, src.map.docStatus + 1).getA1Notation();
    sh.getRange(first, src.map.docStatus + 1, n, 1).setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireFormulaSatisfied('=LEN(' + a1 + ')<=' + DOC_STATUS_MAX)
        .setAllowInvalid(false)
        .setHelpText('ข้อความไม่เกิน ' + DOC_STATUS_MAX + ' ตัวอักษร')
        .build());
  }
  Logger.log('ตั้ง dropdown "สถานะการต่อสัญญา" และจำกัด "สถานะเอกสาร" ' + DOC_STATUS_MAX + ' ตัวอักษร ในแท็บ "' + sh.getName() + '" แล้ว');
}

/** admin: ส่งอีเมลสรุปของเดือนที่เลือกทันที (ใช้ทดสอบ หรือส่งเตือนเอง) */
function apiSendNoticeNow_(token, p) {
  const me = auth_(token);
  if (me.role !== 'admin') return { ok: false, code: 'FORBIDDEN', message: 'เฉพาะ admin เท่านั้น' };

  const month = /^\d{4}-\d{2}$/.test(String(p.month || '')) ? p.month : todayISO_().slice(0, 7);
  const rows = readContracts_()
    .filter(function (d) { return d.status !== 'Write Off' && d.noticeDeadline && d.noticeDeadline.slice(0, 7) === month; })
    .sort(function (a, b) { return a.noticeDeadline < b.noticeDeadline ? -1 : 1; });
  if (!rows.length) return { ok: false, code: 'EMPTY', message: 'เดือนนี้ไม่มีสัญญาที่ต้องทำหนังสือแจ้งเตือน' };

  const to = p.toSelf ? [String(me.email).toLowerCase()] : noticeRecipients_();
  if (!to.length) return { ok: false, code: 'NO_RECIPIENT', message: 'ยังไม่มีผู้รับ — ตั้ง Script Property NOTICE_EMAILS' };

  const label = fmtThDate_(month + '-01').slice(3);
  sendNoticeEmail_(to,
    '[Contract Hub] สรุปหนังสือแจ้งเตือนเดือน ' + label + ' — ' + rows.length + ' สัญญา',
    'ส่งโดย ' + me.email + ' จากหน้า "หนังสือแจ้งเตือน"',
    [noticeTable_('ต้องทำหนังสือแจ้งเตือนเดือน ' + label, '#2563EB', rows)]);
  writeLog_(me.email, 'NOTICE_EMAIL', 'manual:' + month + ' → ' + to.join(','));
  return { ok: true, sent: rows.length, to: to };
}
