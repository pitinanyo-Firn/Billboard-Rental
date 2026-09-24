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
 * ประมาณการค่าเช่าที่ต้องจ่าย 12 เดือนข้างหน้า (ตามความถี่การจ่าย จนถึงวันสิ้นสุดสัญญา)
 *   รายเดือน → ทุกเดือน · ราย 3 เดือน → ทุก 3 เดือนนับจากเดือนที่ชำระตามสัญญา · รายปี → เดือนเดียวกับวันชำระตามสัญญาของทุกปี
 */
function forecast_(data) {
  const months = nextMonths_(12);
  const sum = {};
  months.forEach(function (k) { sum[k] = 0; });
  data.forEach(function (d) {
    if (!d.installment) return;
    const end = d.endDate ? d.endDate.slice(0, 7) : '9999-12';
    const anchor = d.dueDate ? monthIndex_(d.dueDate.slice(0, 7)) : null;
    months.forEach(function (k) {
      if (k > end) return;
      const i = monthIndex_(k);
      if (d.freq === 'monthly' ||
          (d.freq === 'quarterly' && anchor !== null && ((i - anchor) % 3 + 3) % 3 === 0) ||
          (d.freq === 'yearly' && anchor !== null && (i - anchor) % 12 === 0)) {
        sum[k] += d.installment;
      }
    });
  });
  return months.map(function (k) { return { label: k, value: Math.round(sum[k]) }; });
}

function apiDashboard_(token) {
  auth_(token);
  const data = readRentals_();
  const payments = readPayments_();
  const receipts = readReceipts_();

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
  const count = function () { return 1; };
  const cost = function (d) { return d.annualCost; };

  // ค่าเช่าต่อปีแยกประเภทสื่อ (แสดงครบทุกประเภทแม้เป็น 0)
  const mediaTypes = MEDIA_TYPES.slice();
  data.forEach(function (d) {
    if (d.mediaType && mediaTypes.indexOf(d.mediaType) < 0) mediaTypes.push(d.mediaType);
  });
  const costByMedia = mediaTypes.map(function (t) {
    const rows = data.filter(function (d) { return d.mediaType === t; });
    return {
      label: t,
      count: rows.length,
      value: Math.round(rows.reduce(function (s, d) { return s + d.annualCost; }, 0)),
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

  const annual = data.reduce(function (s, d) { return s + d.annualCost; }, 0);
  const kpi = {
    total:        data.length,
    contracts:    Object.keys(data.reduce(function (m, d) { m[d.contractNo || d.id] = 1; return m; }, {})).length,
    annualCost:   Math.round(annual),
    monthlyCost:  Math.round(annual / 12),
    paid:         data.filter(function (d) { return d.payStatus === PAY_DONE; }).length,
    waiting:      data.filter(function (d) { return d.payStatus !== PAY_DONE; }).length,
    overdue:      data.filter(function (d) { return d.payAlert === 'overdue'; }).length,
    dueSoon:      data.filter(function (d) { return d.payAlert === 'due3' || d.payAlert === 'soon'; }).length,
    expiring:     data.filter(function (d) { return d.expireAlert === 'warning'; }).length,
    expired:      data.filter(function (d) { return d.expireAlert === 'expired'; }).length,
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
      byPayment:   group('payment', count),
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
  return {
    ok: true,
    rental: item,
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
