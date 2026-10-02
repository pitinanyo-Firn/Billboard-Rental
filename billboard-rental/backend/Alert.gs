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
 * เปิดใช้งาน: รัน installAlertTrigger() จาก editor ครั้งเดียว (หรือปุ่มในแท็บครบกำหนดจ่าย)
 *   — ลบ trigger เดิมของ Billboard ERP (sendPaymentAlertEmails) ให้อัตโนมัติ กันอีเมลซ้ำ
 *   — trigger ผูกกับ deployment version ที่ติดตั้ง: deploy เวอร์ชันใหม่แล้วต้องติดตั้งซ้ำ
 * ทดสอบ: testAlertEmail() / testMonthlyEmail() — ส่งตัวอย่างให้ CFG.ADMIN_EMAIL คนเดียว
 *
 * หน้าตาอีเมล: ใช้ <table> + inline style ทั้งหมด (Gmail / Outlook ไม่รองรับ flex/grid และตัด <style> บางส่วน)
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

/* ---------- รูปแบบตัวเลข/วันที่ ---------- */

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

/* ---------- ชิ้นส่วนอีเมล (inline style) ---------- */

const MAIL = {
  FONT:  "font-family:'IBM Plex Sans Thai','Sarabun','Segoe UI',Tahoma,Arial,sans-serif;",
  BRAND: '#E4002B',
  INK:   '#0F172A',
  MUTED: '#64748B',
  LINE:  '#E2E8F0',
  SOFT:  '#F8FAFC',
  BG:    '#F1F5F9'
};

/** ป้ายสีเล็ก ๆ */
function pill_(text, bg, fg) {
  return '<span style="display:inline-block;padding:2px 9px;border-radius:999px;background:' + bg + ';color:' + fg +
         ';font-size:11px;font-weight:700;line-height:18px;white-space:nowrap">' + htmlEsc_(text) + '</span>';
}

function statusPill_(s) {
  return s === PAY_DONE ? pill_(s, '#ECFDF5', '#047857') : pill_(s || 'รอเบิก', '#FFFBEB', '#B45309');
}

/** การ์ดสรุปตัวเลขด้านบน: [[label, value, sub, color], ...] */
function statCards_(cards) {
  const w = Math.floor(100 / cards.length);
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:8px 0;margin:0 -8px">' +
    '<tr>' + cards.map(function (c) {
      return '<td width="' + w + '%" style="background:#FFFFFF;border:1px solid ' + MAIL.LINE + ';border-top:4px solid ' + c[3] +
        ';border-radius:10px;padding:12px 14px;vertical-align:top">' +
        '<div style="font-size:12px;color:' + MAIL.MUTED + ';font-weight:600">' + htmlEsc_(c[0]) + '</div>' +
        '<div style="font-size:20px;font-weight:800;color:' + MAIL.INK + ';line-height:1.35;margin-top:2px">' + htmlEsc_(c[1]) + '</div>' +
        (c[2] ? '<div style="font-size:11.5px;color:' + MAIL.MUTED + '">' + htmlEsc_(c[2]) + '</div>' : '') +
        '</td>';
    }).join('') + '</tr></table>';
}

/** หัวข้อกลุ่ม + ตาราง · cols: [[หัวคอลัมน์, align]] · rows: [[cell html...]] */
function mailTable_(title, color, note, cols, rows, totalLabel, total) {
  if (!rows.length) return '';
  const th = 'padding:9px 12px;background:' + MAIL.SOFT + ';border-bottom:1px solid ' + MAIL.LINE +
             ';font-size:11.5px;font-weight:700;color:#334155;';
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:26px 0 10px">' +
    '<tr><td style="border-left:4px solid ' + color + ';padding:2px 0 2px 10px">' +
      '<div style="font-size:16px;font-weight:800;color:' + MAIL.INK + '">' + htmlEsc_(title) + '</div>' +
      (note ? '<div style="font-size:12.5px;color:' + MAIL.MUTED + '">' + note + '</div>' : '') +
    '</td></tr></table>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ' + MAIL.LINE +
      ';border-radius:10px;border-collapse:separate;overflow:hidden;background:#FFFFFF">' +
    '<tr>' + cols.map(function (c) {
      return '<th align="' + (c[1] || 'left') + '" style="' + th + 'text-align:' + (c[1] || 'left') + '">' + htmlEsc_(c[0]) + '</th>';
    }).join('') + '</tr>' +
    rows.map(function (r, i) {
      const bg = i % 2 ? MAIL.SOFT : '#FFFFFF';
      return '<tr>' + r.map(function (cell, j) {
        return '<td align="' + (cols[j][1] || 'left') + '" style="padding:10px 12px;border-bottom:1px solid #F1F5F9;background:' + bg +
               ';font-size:13px;color:' + MAIL.INK + ';vertical-align:top;text-align:' + (cols[j][1] || 'left') + '">' + cell + '</td>';
      }).join('') + '</tr>';
    }).join('') +
    '<tr><td colspan="' + (cols.length - 1) + '" align="right" style="padding:11px 12px;background:' + MAIL.SOFT +
      ';font-size:13px;font-weight:700;color:#334155;text-align:right">' + htmlEsc_(totalLabel) + '</td>' +
      '<td align="right" style="padding:11px 12px;background:' + MAIL.SOFT + ';font-size:14px;font-weight:800;color:' + color +
      ';text-align:right;white-space:nowrap">' + fmtMoney_(total) + '</td></tr>' +
    '</table>';
}

/** ผู้รับเงิน + ทำเล ในช่องเดียว */
function vendorCell_(d) {
  return '<div style="font-weight:700">' + htmlEsc_(d.vendorName || '-') + '</div>' +
         '<div style="font-size:12px;color:' + MAIL.MUTED + ';margin-top:2px">' + htmlEsc_(d.mediaSite || '-') + '</div>';
}

function contractCell_(d, extra) {
  return '<div>' + htmlEsc_(d.contractNo || '-') + '</div>' +
         '<div style="font-size:12px;color:' + MAIL.MUTED + ';margin-top:2px">' + htmlEsc_(extra || d.payment || '') + '</div>';
}

function moneyCell_(n) {
  return '<span style="font-weight:800;white-space:nowrap">' + fmtMoney_(n) + '</span>';
}

/**
 * โครงอีเมล: แถบหัวสีแบรนด์ · การ์ดสรุป · เนื้อหา · ปุ่มเปิดระบบ · footer
 * o: { title, subtitle, accent, stats: [[label, value, sub, color]], sections: [html], empty }
 */
function buildEmail_(subject, o) {
  const site = prop_('SITE_URL', '');
  const accent = o.accent || MAIL.BRAND;
  const body = (o.sections || []).filter(String).join('') ||
    '<div style="margin-top:22px;padding:26px;border:1px dashed ' + MAIL.LINE + ';border-radius:10px;text-align:center;color:' +
    MAIL.MUTED + ';font-size:14px;background:#FFFFFF">' + htmlEsc_(o.empty || 'ไม่มีรายการ') + '</div>';
  const html =
    '<div style="margin:0;padding:24px 12px;background:' + MAIL.BG + ';' + MAIL.FONT + '">' +
    '<table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:820px;margin:0 auto">' +
      // หัว
      '<tr><td style="background:' + accent + ';border-radius:14px 14px 0 0;padding:22px 26px">' +
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>' +
          '<td style="vertical-align:middle">' +
            '<span style="display:inline-block;width:34px;height:34px;line-height:34px;text-align:center;border-radius:9px;background:#FFFFFF;color:' +
              accent + ';font-weight:800;font-size:14px;vertical-align:middle">PB</span>' +
            '<span style="color:#FFFFFF;font-size:13px;font-weight:600;opacity:.9;vertical-align:middle;margin-left:10px">Billboard Rental Hub · Plan B Media</span>' +
          '</td></tr></table>' +
        '<div style="color:#FFFFFF;font-size:23px;font-weight:800;margin-top:14px;line-height:1.35">' + htmlEsc_(o.title) + '</div>' +
        '<div style="color:#FFFFFF;font-size:13.5px;opacity:.92;margin-top:4px">' + htmlEsc_(o.subtitle || '') + '</div>' +
      '</td></tr>' +
      // เนื้อหา
      '<tr><td style="background:' + MAIL.BG + ';padding:20px 18px 6px;border-left:1px solid ' + MAIL.LINE + ';border-right:1px solid ' + MAIL.LINE + '">' +
        (o.stats && o.stats.length ? statCards_(o.stats) : '') + body +
        (site ? '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0 8px"><tr><td align="center">' +
          '<a href="' + htmlEsc_(site) + '" style="display:inline-block;background:' + MAIL.BRAND + ';color:#FFFFFF;text-decoration:none;' +
          'font-weight:700;font-size:14px;padding:12px 26px;border-radius:10px">เปิดระบบ Billboard Rental Hub →</a></td></tr></table>' : '') +
      '</td></tr>' +
      // footer
      '<tr><td style="background:#FFFFFF;border:1px solid ' + MAIL.LINE + ';border-top:none;border-radius:0 0 14px 14px;padding:14px 26px;' +
        'font-size:11.5px;color:#94A3B8;line-height:1.6">' +
        'อีเมลอัตโนมัติจากระบบ Billboard Rental Hub — กรุณาตรวจสอบกระแสเงินสดและจัดเตรียมเช็คให้ทันกำหนด<br>' +
        'ยอดเงินของงวดรายปีใช้ Amount/Year · ราย 3 เดือนรวมยอดทุกเดือนในงวด · ข้อมูลจากชีต Contract_Master' +
      '</td></tr>' +
    '</table></div>';
  return { subject: subject, html: html };
}

function sendEmail_(to, email) {
  MailApp.sendEmail({ to: to.join(','), subject: email.subject, htmlBody: email.html, name: 'Billboard Rental Hub' });
}

/* ---------- 1) แจ้งเตือนล่วงหน้า 7 วัน / 3 วัน ---------- */

function advanceTable_(title, color, note, rows) {
  const total = rows.reduce(function (s, d) { return s + d.amount; }, 0);
  return mailTable_(title, color, note,
    [['วันที่ต้องจ่าย'], ['ผู้รับเงิน / Media Site'], ['สัญญา / การจ่าย'], ['สถานะ'], ['ยอดเงิน (บาท)', 'right']],
    rows.map(function (d) {
      const kind = d.payKind === 'cheque' ? 'เช็คลงวันที่' : 'ชำระตามสัญญา';
      const span = d.months.length > 1 ? d.payment + ' · ' + d.months[0] + ' – ' + d.months[d.months.length - 1] : d.payment;
      return [
        '<div style="font-weight:800;white-space:nowrap">' + fmtThDate_(d.payDate) + '</div>' +
          '<div style="font-size:11.5px;color:' + MAIL.MUTED + ';margin-top:3px">' + kind + '</div>',
        vendorCell_(d),
        contractCell_(d, span),
        statusPill_(d.payStatus),
        moneyCell_(d.amount)
      ];
    }), 'รวม ' + rows.length + ' รายการ', total);
}

/** อีเมลแจ้งเตือนล่วงหน้าของวันนี้ — คืน null ถ้าไม่มีรายการ */
function advanceEmail_() {
  const groups = payGroups_(readRentals_()).filter(function (g) { return g.amount && g.payAlert !== 'prior'; });
  const offsets = alertOffsets_();
  const today = todayISO_();
  const colors = ['#D97706', '#DC2626', '#7C3AED'];
  const sections = [], parts = [], stats = [];
  let all = 0, allCount = 0;
  offsets.forEach(function (n, i) {
    const rows = groups.filter(function (g) { return g.daysToPay === n; }).sort(byPayDate_);
    const sum = rows.reduce(function (s, d) { return s + d.amount; }, 0);
    const color = n <= 3 ? '#DC2626' : colors[i] || '#D97706';
    stats.push(['ครั้งที่ ' + (i + 1) + ' · อีก ' + n + ' วัน', rows.length + ' รายการ', fmtMoney_(sum) + ' บาท', color]);
    if (!rows.length) return;
    all += sum; allCount += rows.length;
    parts.push('อีก ' + n + ' วัน ' + rows.length);
    sections.push(advanceTable_('ครั้งที่ ' + (i + 1) + ' — ครบกำหนดในอีก ' + n + ' วัน', color,
      'วันที่ต้องจ่าย ' + fmtThDate_(addDays_(today, n)), rows));
  });
  if (!sections.length) return null;
  stats.push(['ยอดรวมที่ต้องเตรียม', fmtMoney_(all), allCount + ' รายการ', MAIL.INK]);
  const email = buildEmail_('⏰ [Billboard Rental] แจ้งเตือนดิวจ่ายล่วงหน้า — ' + parts.join(' · ') + ' รายการ', {
    title: 'แจ้งเตือนดิวจ่ายล่วงหน้า',
    subtitle: offsets.map(function (n, i) { return 'ครั้งที่ ' + (i + 1) + ' ก่อน ' + n + ' วัน'; }).join(' · ') +
              ' · ข้อมูล ณ วันที่ ' + fmtThDate_(today),
    stats: stats,
    sections: sections
  });
  email.summary = parts.join(', ');
  return email;
}

/* ---------- 2) สรุปประจำเดือน ---------- */

/**
 * งานทั้งหมดของเดือน ym ('yyyy-MM') ตามวันชำระตามสัญญา — ทั้งเบิกแล้ว/รอเบิก
 * รวมแถวรายเดือนที่ใช้วันชำระเดียวกันเป็นงวดเดียว (ราย 3 เดือน / รายปี — ยอดตาม cycleAmount_)
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
    addToCycle_(g, d);
    g.months.push(d.month);
    if (d.payStatus !== PAY_DONE) g.payStatus = d.payStatus || 'รอเบิก';
    if (!g.chequeDate && d.chequeDate) g.chequeDate = d.chequeDate;
    if (!g.memoInv && d.memoInv) g.memoInv = d.memoInv;
  });
  return Object.keys(map).map(function (k) { const g = map[k]; g.amount = cycleAmount_(g); return g; })
    .sort(function (a, b) { return a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : (a.vendorName < b.vendorName ? -1 : 1); });
}

function monthTable_(title, color, note, rows) {
  const total = rows.reduce(function (s, d) { return s + d.amount; }, 0);
  return mailTable_(title, color, note,
    [['ชำระตามสัญญา'], ['ผู้รับเงิน / Media Site'], ['สัญญา / การจ่าย'], ['เช็คลงวันที่ · MEMO/INV'], ['ยอดเงิน (บาท)', 'right']],
    rows.map(function (d) {
      const span = d.months.length > 1 ? d.payment + ' · ' + d.months[0] + ' – ' + d.months[d.months.length - 1] : d.payment;
      return [
        '<div style="font-weight:800;white-space:nowrap">' + fmtThDate_(d.dueDate) + '</div>' +
          '<div style="margin-top:4px">' + statusPill_(d.payStatus) + '</div>',
        vendorCell_(d),
        contractCell_(d, span),
        '<div style="white-space:nowrap">' + (d.chequeDate ? fmtThDate_(d.chequeDate) : '<span style="color:' + MAIL.MUTED + '">-</span>') + '</div>' +
          '<div style="font-size:12px;color:' + MAIL.MUTED + ';margin-top:2px">' + htmlEsc_(d.memoInv || '-') + '</div>',
        d.amount ? moneyCell_(d.amount) : '<span style="color:#B91C1C;font-size:12px;font-weight:700">ไม่มียอดในชีต</span>'
      ];
    }), 'รวม ' + rows.length + ' รายการ', total);
}

/** อีเมลสรุปงานของเดือน ym — ส่งได้แม้ไม่มีรายการ (แจ้งว่าไม่มี) */
function monthlyEmail_(ym) {
  const rows = monthGroups_(readRentals_(), ym);
  const wait = rows.filter(function (g) { return g.payStatus !== PAY_DONE; });
  const done = rows.filter(function (g) { return g.payStatus === PAY_DONE; });
  const sum = function (arr) { return arr.reduce(function (s, g) { return s + g.amount; }, 0); };
  const total = sum(rows);
  const label = thMonthLabel_(ym);
  const email = buildEmail_('📅 [Billboard Rental] สรุปงานเดือน' + label + ' — ' + rows.length + ' รายการ · ' + fmtMoney_(total) + ' บาท', {
    title: 'สรุปงานเดือน' + label,
    subtitle: 'รายการค่าเช่าที่ครบกำหนดชำระตามสัญญาในเดือน' + label + ' ทั้งหมด · ข้อมูล ณ วันที่ ' + fmtThDate_(todayISO_()),
    stats: [
      ['รายการทั้งหมด', rows.length + ' รายการ', 'ยอดรวม ' + fmtMoney_(total) + ' บาท', MAIL.INK],
      ['รอเบิก', wait.length + ' รายการ', fmtMoney_(sum(wait)) + ' บาท', '#D97706'],
      ['เบิกแล้ว', done.length + ' รายการ', fmtMoney_(sum(done)) + ' บาท', '#059669']
    ],
    sections: [
      wait.length ? monthTable_('รอเบิก', '#D97706', 'ยังไม่ได้เบิกจ่าย — เรียงตามวันชำระตามสัญญา', wait) : '',
      done.length ? monthTable_('เบิกแล้ว', '#059669', 'เบิกจ่ายแล้ว — ตรวจวันที่เช็คให้ตรงกำหนด', done) : ''
    ],
    empty: 'ไม่มีรายการที่ครบกำหนดชำระในเดือน' + label
  });
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

function noAdvanceEmail_() {
  return buildEmail_('(วันนี้ไม่มีรายการแจ้งเตือนล่วงหน้า)', {
    title: 'แจ้งเตือนดิวจ่ายล่วงหน้า',
    subtitle: 'ข้อมูล ณ วันที่ ' + fmtThDate_(todayISO_()),
    empty: 'วันนี้ไม่มีรายการที่ครบกำหนดในอีก ' + alertOffsets_().join(' / ') + ' วัน'
  });
}

/** ทดสอบ: ส่งตัวอย่างแจ้งเตือนล่วงหน้าของวันนี้ให้ CFG.ADMIN_EMAIL คนเดียว */
function testAlertEmail() {
  invalidateData_();
  sendEmail_([CFG.ADMIN_EMAIL], advanceEmail_() || noAdvanceEmail_());
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
    : (advanceEmail_() || noAdvanceEmail_());
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
