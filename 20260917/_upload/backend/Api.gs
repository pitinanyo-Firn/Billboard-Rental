/**
 * Api.gs — API handlers ของ Dashboard / ทะเบียนสัญญา / Export
 */

function apiDashboard_(token) {
  auth_(token);
  const data = readContracts_();
  const today = todayISO_();
  const now = new Date();

  const countBy = function (key) {
    const m = {};
    data.forEach(function (d) {
      const k = d[key] || 'ไม่ระบุ';
      m[k] = (m[k] || 0) + 1;
    });
    return Object.keys(m)
      .map(function (k) { return { label: k, value: m[k] }; })
      .sort(function (a, b) { return b.value - a.value; });
  };

  // ไทม์ไลน์หมดอายุ 12 เดือนข้างหน้า
  const timeline = {};
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    timeline[Utilities.formatDate(d, CFG.TZ, 'yyyy-MM')] = 0;
  }
  data.forEach(function (d) {
    if (!d.endDate) return;
    const k = d.endDate.slice(0, 7);
    if (k in timeline) timeline[k]++;
  });

  // สเปก Dashboard ข้อ 1: สัญญาที่จะหมดใน 12 เดือนข้างหน้า แยกตามประเภทสื่อ
  const in12m = Utilities.formatDate(new Date(now.getFullYear() + 1, now.getMonth(), now.getDate()), CFG.TZ, 'yyyy-MM-dd');
  const expiring12m = data.filter(function (d) {
    return d.status !== 'Write Off' && d.endDate && d.endDate >= today && d.endDate <= in12m;
  });
  const mediaTypes = MEDIA_TYPES.slice();
  data.forEach(function (d) {
    if (d.mediaType && mediaTypes.indexOf(d.mediaType) < 0) mediaTypes.push(d.mediaType);
  });
  const expiringByMedia = mediaTypes.map(function (t) {
    return { label: t, value: expiring12m.filter(function (d) { return d.mediaType === t; }).length };
  });

  const kpi = {
    total:       data.length,
    active:      data.filter(function (d) { return d.status === 'Active'; }).length,
    isNew:       data.filter(function (d) { return d.status === 'New'; }).length,
    writeOff:    data.filter(function (d) { return d.status === 'Write Off'; }).length,
    changeLED:   data.filter(function (d) { return d.status === 'Change to LED'; }).length,
    expiring:    data.filter(function (d) { return d.alert === 'warning' || d.alert === 'critical'; }).length,
    expired:     data.filter(function (d) { return d.alert === 'expired'; }).length,
    expiring12m: expiring12m.length,
    collateral:  data.reduce(function (s, d) { return s + d.collateralValue; }, 0)
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
      byStatus:        countBy('status'),
      byMediaType:     countBy('mediaType').slice(0, 10),
      byCompany:       countBy('company'),
      byProvince:      countBy('province').slice(0, 8),
      timeline:        Object.keys(timeline).map(function (k) { return { label: k, value: timeline[k] }; }),
      expiringByMedia: expiringByMedia
    },
    noticeSchedule: noticeSchedule_(data),
    filters: {
      company:   uniq('company'),
      mediaType: uniq('mediaType'),
      status:    uniq('status'),
      province:  uniq('province')
    },
    contracts: data,
    version: dataFingerprint_(),
    alertDays: CFG.ALERT_DAYS,
    actionDays: CFG.ACTION_DAYS,
    updatedAt: Utilities.formatDate(new Date(), CFG.TZ, 'dd/MM/yyyy HH:mm')
  };
}

/**
 * สเปก Dashboard ข้อ 2: วันที่ต้องทำหนังสือแจ้งเตือน รายเดือน
 * ตั้งแต่ ม.ค. ของปีปัจจุบัน ไป CFG.NOTICE_MONTHS เดือน (ไม่รวมสัญญา Write Off)
 */
function noticeSchedule_(data) {
  const y = new Date().getFullYear();
  const months = [];
  const byKey = {};
  for (let i = 0; i < CFG.NOTICE_MONTHS; i++) {
    const key = Utilities.formatDate(new Date(y, i, 1), CFG.TZ, 'yyyy-MM');
    byKey[key] = { month: key, count: 0, contracts: [] };
    months.push(byKey[key]);
  }
  data.forEach(function (d) {
    if (d.status === 'Write Off' || !d.noticeDeadline) return;
    const m = byKey[d.noticeDeadline.slice(0, 7)];
    if (!m) return;
    m.count++;
    m.contracts.push({
      id: d.id, contractNo: d.contractNo, mediaSite: d.mediaSite, mediaType: d.mediaType,
      counterparty: d.counterparty, endDate: d.endDate, status: d.status,
      noticeDeadline: d.noticeDeadline, daysToNotice: d.daysToNotice,
      renewStatus: d.renewStatus, docStatus: d.docStatus
    });
  });
  months.forEach(function (m) {
    m.contracts.sort(function (a, b) { return a.noticeDeadline < b.noticeDeadline ? -1 : 1; });
  });
  return months;
}

function apiContract_(token, id) {
  auth_(token);
  const item = readContracts_().filter(function (d) { return d.id === id; })[0];
  if (!item) return { ok: false, code: 'NOT_FOUND', message: 'ไม่พบสัญญา' };
  return {
    ok: true,
    contract: item,
    responsibility: RESP_FIELDS.map(function (f) {
      return { label: f[1], value: item[f[0]] || 'ไม่ระบุ' };
    })
  };
}

function apiActionList_(token) {
  auth_(token);
  const list = readContracts_()
    .filter(function (d) {
      return d.status !== 'Write Off' && d.daysToExpire !== null && d.daysToExpire <= CFG.ACTION_DAYS;
    })
    .sort(function (a, b) { return a.daysToExpire - b.daysToExpire; });
  return { ok: true, list: list };
}

function apiExportCSV_(token) {
  auth_(token);
  const cols = ['contractNo', 'company', 'mediaType', 'mediaSite', 'province',
                'counterparty', 'status', 'businessModel', 'startDate', 'endDate',
                'duration', 'collateralType', 'collateralValue', 'paymentTerm',
                'renewCondition', 'noticeDeadline', 'daysToExpire', 'renewStatus', 'docStatus'];
  const esc = function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };
  const rows = [cols.map(esc).join(',')];
  readContracts_().forEach(function (d) {
    rows.push(cols.map(function (c) { return esc(d[c]); }).join(','));
  });
  return { ok: true, csv: '﻿' + rows.join('\r\n') };   // BOM กัน Excel อ่านไทยเพี้ยน
}

function apiClearCache_(token) {
  auth_(token);
  invalidateData_();
  return { ok: true };
}
