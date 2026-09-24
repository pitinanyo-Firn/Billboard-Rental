/**
 * Api.gs — API handlers ของ Dashboard / ทะเบียนค่าเช่า / Export
 */

/** เดือน yyyy-MM ตั้งแต่เดือนนี้ไป n เดือน */
function nextMonths_(n) {
  const now = new Date();
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(Utilities.formatDate(new Date(now.getFullYear(), now.getMonth() + i, 1), CFG.TZ, 'yyyy-MM'));
  }
  return out;
}

function monthIndex_(ym) {
  return (+ym.slice(0, 4)) * 12 + (+ym.slice(5, 7)) - 1;
}

/**
 * งวดการจ่าย = แถวที่มี "วันที่ต้องจ่าย" เดียวกันของคู่สัญญา/ทำเล/สัญญาเดียวกัน
 * (ราย 3 เดือน 3 แถว และรายปี 12 แถว ใช้วันชำระเดียวกัน — รวมเป็นงวดเดียว)
 */
function payGroups_(data) {
  const map = {};
  data.forEach(function (d) {
    if (!d.payDate) return;
    const key = [d.contractNo, d.vendorNo, d.mediaSite, d.payDate, d.payKind].join('|');
    if (!map[key]) {
      map[key] = {
        id: d.id, contractNo: d.contractNo, company: d.company, vendorName: d.vendorName,
        mediaSite: d.mediaSite, mediaType: d.mediaType, payment: d.payment, rent: d.rent,
        payDate: d.payDate, payKind: d.payKind, daysToPay: d.daysToPay, payAlert: d.payAlert,
        payStatus: d.payStatus, amount: 0, months: [], rows: []
      };
    }
    const g = map[key];
    g.amount += d.installment;
    g.months.push(d.month);
    g.rows.push(d.id);
    // งวดถือว่ายังไม่เบิก ถ้ามีแถวใดยังรอเบิก
    if (d.payStatus !== PAY_DONE) { g.payStatus = d.payStatus; g.payAlert = d.payAlert; }
  });
  return Object.keys(map).map(function (k) {
    const g = map[k];
    g.amount = Math.round(g.amount * 100) / 100;
    return g;
  }).sort(function (a, b) { return a.payDate < b.payDate ? -1 : a.payDate > b.payDate ? 1 : 0; });
}

/** ค่าเช่าที่ต้องจ่ายรายเดือน 12 เดือนข้างหน้า — รวมยอดตามเดือนของวันที่ต้องจ่ายจริง */
function forecast_(data) {
  const months = nextMonths_(12);
  const sum = {};
  months.forEach(function (k) { sum[k] = 0; });
  data.forEach(function (d) {
    if (!d.installment || !d.dueDate) return;
    const k = d.dueDate.slice(0, 7);
    if (k in sum) sum[k] += d.installment;
  });
  return months.map(function (k) { return { label: k, value: Math.round(sum[k]) }; });
}

function apiDashboard_(token) {
  auth_(token);
  const data = readRentals_();
  const payments = readPayments_();
  const receipts = readReceipts_();

  // 1 แถว = ค่าเช่า 1 เดือน → ผลรวม monthlyCost ของทุกแถวในชีต = ค่าเช่าทั้งปี
  const group = function (key, valFn) {
    const m = {};
    data.forEach(function (d) {
      const k = d[key] || 'ไม่ระบุ';
      m[k] = (m[k] || 0) + valFn(d);
    });
    return Object.keys(m)
      .map(function (k) { return { label: k, value: Math.round(m[k]) }; })
      .sort(function (a, b) { return b.value - a.value; });
  };
  const cost = function (d) { return d.monthlyCost; };

  // "รายการค่าเช่า" 1 รายการ = 1 คู่สัญญา/ทำเล/รูปแบบการจ่าย (สัญญาหนึ่งมีหลายแถวรายเดือน)
  const lines = {};
  data.forEach(function (d) { if (!lines[d.lineKey]) lines[d.lineKey] = d; });
  const lineList = Object.keys(lines).map(function (k) { return lines[k]; });
  const countLines = function (fn) { return lineList.filter(fn).length; };
  const groups = payGroups_(data);

  // ค่าเช่าต่อปีแยกประเภทสื่อ (แสดงครบทุกประเภทแม้เป็น 0)
  const mediaTypes = MEDIA_TYPES.slice();
  data.forEach(function (d) {
    if (d.mediaType && mediaTypes.indexOf(d.mediaType) < 0) mediaTypes.push(d.mediaType);
  });
  const costByMedia = mediaTypes.map(function (t) {
    const rows = data.filter(function (d) { return d.mediaType === t; });
    return {
      label: t,
      count: lineList.filter(function (d) { return d.mediaType === t; }).length,
      value: Math.round(rows.reduce(function (s, d) { return s + d.monthlyCost; }, 0)),
      paid:  rows.filter(function (d) { return d.payStatus === PAY_DONE; }).length,
      wait:  rows.filter(function (d) { return d.payStatus !== PAY_DONE; }).length
    };
  });

  // สัญญาหมดอายุ 12 เดือนข้างหน้า (นับเลขที่สัญญาไม่ซ้ำ)
  const months = nextMonths_(12);
  const expiry = {};
  months.forEach(function (k) { expiry[k] = {}; });
  data.forEach(function (d) {
    if (d.endDate && expiry[d.endDate.slice(0, 7)]) expiry[d.endDate.slice(0, 7)][d.contractNo || d.id] = 1;
  });

  const annual = data.reduce(function (s, d) { return s + d.monthlyCost; }, 0);
  // ค่าเช่าเดือนนี้ = ผลรวมแถวของรอบเดือนปัจจุบัน (ถ้าไม่มีรอบนี้ในชีต ใช้ค่าเฉลี่ยทั้งปี)
  const thisMonth = Utilities.formatDate(new Date(), CFG.TZ, 'MMM-yy');
  const monthRows = data.filter(function (d) { return d.month === thisMonth; });
  const monthCost = monthRows.length
    ? monthRows.reduce(function (s, d) { return s + d.monthlyCost; }, 0)
    : annual / 12;
  const kpi = {
    total:        lineList.length,                 // รายการค่าเช่า (ไม่นับซ้ำรายเดือน)
    rows:         data.length,                     // แถวในชีตทั้งหมด (1 แถว = 1 เดือน)
    contracts:    Object.keys(data.reduce(function (m, d) { m[d.contractNo || d.id] = 1; return m; }, {})).length,
    annualCost:   Math.round(annual),
    monthlyCost:  Math.round(monthCost),
    monthLabel:   monthRows.length ? thisMonth : '',
    paid:         data.filter(function (d) { return d.payStatus === PAY_DONE; }).length,
    waiting:      data.filter(function (d) { return d.payStatus !== PAY_DONE; }).length,
    overdue:      groups.filter(function (g) { return g.payAlert === 'overdue'; }).length,
    dueSoon:      groups.filter(function (g) { return g.payAlert === 'due3' || g.payAlert === 'soon'; }).length,
    dueAmount:    Math.round(groups.filter(function (g) {
                    return g.payAlert === 'overdue' || g.payAlert === 'due3' || g.payAlert === 'soon';
                  }).reduce(function (s, g) { return s + g.amount; }, 0)),
    expiring:     countLines(function (d) { return d.expireAlert === 'warning'; }),
    expired:      countLines(function (d) { return d.expireAlert === 'expired'; }),
    issues:       data.filter(function (d) { return d.issues.length; }).length,
    receiptWait:  receipts.filter(function (r) { return r.status === RECEIPT_STATUSES[0]; }).length
  };

  const uniq = function (key) {
    const set = {};
    data.forEach(function (d) { if (d[key]) set[d[key]] = 1; });
    return Object.keys(set).sort();
  };

  return {
    ok: true,
    kpi: kpi,
    charts: {
      costByMedia: costByMedia,
      byCompany:   group('company', cost),
      byRent:      group('rent', cost),
      forecast:    forecast_(data),
      expiry:      months.map(function (k) { return { label: k, value: Object.keys(expiry[k]).length }; })
    },
    filters: {
      company:   uniq('company'),
      mediaType: uniq('mediaType'),
      payment:   uniq('payment'),
      payStatus: uniq('payStatus'),
      rent:      uniq('rent')
    },
    rentals: data,
    payGroups: groups,
    payments: payments,
    receipts: receipts,
    receiptStatuses: RECEIPT_STATUSES,
    version: dataFingerprint_(),
    dueSoonDays: CFG.DUE_SOON_DAYS,
    expireDays: CFG.EXPIRE_DAYS,
    updatedAt: Utilities.formatDate(new Date(), CFG.TZ, 'dd/MM/yyyy HH:mm')
  };
}

function apiRental_(token, id) {
  auth_(token);
  const item = readRentals_().filter(function (d) { return d.id === id; })[0];
  if (!item) return { ok: false, code: 'NOT_FOUND', message: 'ไม่พบรายการค่าเช่า' };
  const same = function (x) { return x.vendor === item.vendorName && x.site === item.mediaSite; };
  const cycles = readRentals_()
    .filter(function (d) { return d.lineKey === item.lineKey; })
    .map(function (d) {
      return { id: d.id, _row: d._row, month: d.month, dueDate: d.dueDate, chequeDate: d.chequeDate,
               payStatus: d.payStatus, installment: d.installment, memoInv: d.memoInv, ecmNo: d.ecmNo,
               issues: d.issues.length };
    });
  return {
    ok: true,
    rental: item,
    cycles: cycles,
    payments: readPayments_().filter(same),
    receipts: readReceipts_().filter(same)
  };
}

function apiExportCSV_(token) {
  auth_(token);
  const cols = ['no', 'contractNo', 'company', 'mediaType', 'mediaSite', 'vendorNo', 'vendorName', 'partDesc',
                'payment', 'rent', 'startDate', 'endDate', 'amountMonth', 'amountYear', 'adjust',
                'installment', 'annualCost', 'month', 'dueDate', 'payStatus', 'pr', 'po', 'memoInv',
                'chequeDate', 'ecmNo', 'daysToPay', 'daysToExpire'];
  const esc = function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };
  const rows = [cols.concat(['issues']).map(esc).join(',')];
  readRentals_().forEach(function (d) {
    rows.push(cols.map(function (c) { return esc(d[c]); })
      .concat([esc(d.issues.map(function (i) { return i.msg; }).join(' / '))]).join(','));
  });
  return { ok: true, csv: '﻿' + rows.join('\r\n') };   // BOM กัน Excel อ่านไทยเพี้ยน
}

function apiClearCache_(token) {
  auth_(token);
  invalidateData_();
  return { ok: true };
}
