/**
 * AIInsight.gs — AI วิเคราะห์ความเสี่ยงประจำวัน (Workflow อัตโนมัติที่มี AI อยู่ในขั้นตอน)
 *
 * ทำงานเองทุกวันพร้อม trigger 08:00 (dailyAlertCheck) — ไม่ต้องมีคนกด:
 *   1. อ่านชีต Contract_Master · Payment_History · Receipt_Tracking · Accrued
 *   2. สรุปเป็น snapshot ขนาดเล็ก (insightSnapshot_) + ปิดชื่อคู่ค้า/ทำเลเป็นรหัส (insightMask_)
 *   3. ส่งให้ AI วิเคราะห์ ตอบกลับเป็น JSON — ใช้ Gemini (ฟรี) ถ้ามี GEMINI_API_KEY, ไม่งั้น Claude
 *   4. ตรวจคำตอบ 5 ชั้น:
 *        ① รูปแบบ JSON + ระดับความเสี่ยง (validateInsight_)
 *        ② ตัดเลขที่สัญญาที่ไม่มีในข้อมูลจริงทิ้ง
 *        ③ AI ตัวที่ 2 ตรวจซ้ำเทียบข้อมูลจริง — ตัดข้อที่ผิด ปรับระดับ เพิ่มที่ขาด (insightReview_)
 *        ④ เทียบกับสรุปตามกฎ — ความเสี่ยงสูงที่ AI ไม่รายงาน ระบบเพิ่มให้เอง (insightVerify_)
 *        ⑤ ตรวจยอดเงินที่ AI อ้างว่ามีอยู่ในข้อมูลจริง
 *   5. บันทึกชีต AI_Insights (พร้อมผลตรวจ) + Log → แสดงบน Dashboard
 *   6. มีความเสี่ยงระดับสูง → ส่งอีเมลสรุปให้ผู้ดูแลเอง
 *
 * ถ้ายังไม่ตั้งคีย์ AI / AI ตอบผิดรูปแบบ / เรียก AI ไม่สำเร็จ
 * → ใช้สรุปตามกฎ (ruleInsight_) แทน และระบุสถานะ RULES / INVALID / ERROR ให้เห็นชัด ระบบไม่หยุด
 */

const INSIGHT = {
  SHEET: 'AI_Insights',
  HEADER: ['Timestamp', 'Trigger', 'Status', 'Provider', 'Model', 'Summary', 'Risks (JSON)', 'Actions',
           'Checks (JSON)', 'Note', 'Tokens in/out', 'Duration (ms)', 'Email', 'Snapshot (JSON)'],
  WIDTHS: [130, 70, 70, 80, 150, 380, 380, 300, 260, 260, 90, 90, 200, 300],
  TOP: 12,              // จำนวนรายการสูงสุดต่อหมวดที่ส่งให้ AI
  MAX_TOKENS: 6000,
  LEVELS: ['high', 'medium', 'low']
};

const INSIGHT_PROMPT = [
  'คุณคือนักวิเคราะห์การเงินฝ่ายบริหารค่าเช่าป้ายโฆษณาของ Plan B Media',
  'หน้าที่: อ่าน snapshot ข้อมูลประจำวัน (JSON) แล้วสรุปความเสี่ยงและสิ่งที่ทีมต้องทำวันนี้',
  '',
  'กฎ:',
  '- ใช้เฉพาะข้อมูลใน snapshot ห้ามเดาหรือแต่งตัวเลข/เลขที่สัญญาที่ไม่มีในข้อมูล',
  '- ภาษาไทย กระชับ ยอดเงินคั่นหลักพัน ทศนิยม 2 ตำแหน่ง วันที่ dd/MM/yyyy',
  '- ระดับความเสี่ยง: high = ต้องทำวันนี้ (เลยกำหนดจ่าย, ครบกำหนดภายใน 3 วัน, Accrued ใกล้/เลยวันส่งบัญชีแต่ยังไม่ครบ)',
  '  medium = ควรทำภายในสัปดาห์ (ครบกำหนดภายใน 7 วัน, ยอดจ่ายจริงไม่ตรงยอดที่ต้องจ่าย, สัญญาหมดใน 30 วัน, ข้อมูลผิดพลาดระดับสำคัญ)',
  '  low = ติดตาม (สัญญาหมดใน 90 วัน, ใบเสร็จค้าง, ข้อมูลผิดพลาดเล็กน้อย)',
  '- เรียงความเสี่ยงจากสำคัญมากไปน้อย ไม่เกิน 8 ข้อ รวมเรื่องเดียวกันเป็นข้อเดียว',
  '- refs = เลขที่สัญญา (contractNo) ที่เกี่ยวข้อง คัดลอกจาก snapshot ตรงตัว (ไม่มีให้ใส่ [])',
  '- ชื่อคู่ค้าและทำเลใน snapshot เป็นรหัส (เช่น V01, S01) ให้เขียนรหัสนั้นตรงตัว ห้ามเดาชื่อจริง',
  '- ยอดเงินที่เขียนต้องคัดลอกจาก snapshot (amount / total / expected / actual / diff) ห้ามคำนวณใหม่',
  '',
  'ตอบเป็น JSON object อย่างเดียว ไม่มีข้อความอื่น ไม่ใช้ ``` ครอบ รูปแบบ:',
  '{"summary": ["สรุปภาพรวม 3-5 ข้อ"],',
  ' "risks": [{"level": "high|medium|low", "title": "หัวข้อสั้น", "detail": "รายละเอียด + ยอดเงิน", "refs": ["เลขที่สัญญา"]}],',
  ' "actions": ["สิ่งที่ควรทำวันนี้ เรียงตามลำดับความสำคัญ ไม่เกิน 5 ข้อ"]}'
].join('\n');

/* ---------- 1) snapshot ข้อมูล ---------- */

function insightRound_(n) { return Math.round((+n || 0) * 100) / 100; }

function insightSnapshot_() {
  const today = todayISO_();
  const data = readRentals_();
  const open = payGroups_(data).filter(function (g) { return !isPaid_(g.payStatus) && g.payAlert !== 'prior'; });
  const pick = function (g) {
    return { contractNo: g.contractNo, vendor: g.vendorName, site: g.mediaSite, payment: g.payment,
             payDate: g.payDate, daysToPay: g.daysToPay, amount: insightRound_(g.amount) };
  };
  const total = function (list) { return insightRound_(list.reduce(function (s, g) { return s + g.amount; }, 0)); };
  const overdue = open.filter(function (g) { return g.payAlert === 'overdue'; });
  const due3 = open.filter(function (g) { return g.daysToPay !== null && g.daysToPay >= 0 && g.daysToPay <= 3; });
  const due7 = open.filter(function (g) { return g.daysToPay !== null && g.daysToPay > 3 && g.daysToPay <= 7; });

  // สัญญาที่จะหมดภายใน EXPIRE_DAYS (นับเลขที่สัญญาไม่ซ้ำ)
  const exp = {};
  data.forEach(function (d) {
    const k = d.contractNo || d.id;
    if (d.daysToExpire === null || d.daysToExpire < 0 || d.daysToExpire > CFG.EXPIRE_DAYS || exp[k]) return;
    exp[k] = { contractNo: d.contractNo, vendor: d.vendorName, site: d.mediaSite, endDate: d.endDate, daysToExpire: d.daysToExpire };
  });
  const expiring = Object.keys(exp).map(function (k) { return exp[k]; })
    .sort(function (a, b) { return a.daysToExpire - b.daysToExpire; });

  // ยอดจ่ายจริงไม่ตรงยอดที่ต้องจ่าย (ต่างกันตั้งแต่ 1 บาท)
  const diffs = readPayments_().filter(function (p) { return p.expected && Math.abs(p.actual - p.expected) >= 1; })
    .map(function (p) {
      return { vendor: p.vendor, site: p.site, month: p.month, expected: p.expected, actual: p.actual,
               diff: insightRound_(p.actual - p.expected) };
    });

  // Accrued เดือนนี้: ค่าเช่าเดือนนี้ที่ยังไม่เบิก/จ่าย แต่ยังไม่อยู่ในชีต Accrued
  const mKey = today.slice(0, 7);
  const mLabel = accruedMonthLabel_(mKey);
  const acc = readAccrued_().filter(function (a) { return a.month === mKey; });
  const norm = function (s) { return clean_(s).toLowerCase(); };
  const missing = data.filter(function (d) {
    if (d.month !== mLabel || isPaid_(d.payStatus) || !(d.installment || d.monthlyCost)) return false;
    return !acc.some(function (a) {
      return norm(a.vendor) === norm(d.vendorName) &&
             (norm(a.siteName) === norm(d.mediaSite) || (a.siteCode && norm(a.siteCode) === norm(d.epicoreCode)));
    });
  });
  const dueDay = mKey + '-' + ('0' + ACCRUED.DAY).slice(-2);

  const issues = { high: 0, medium: 0, low: 0 };
  data.forEach(function (d) { d.issues.forEach(function (i) { if (issues[i.level] !== undefined) issues[i.level]++; }); });
  const receiptWait = readReceipts_().filter(function (r) { return r.status === RECEIPT_STATUSES[0]; });

  const top = INSIGHT.TOP;
  return {
    today: today,
    overdue: { count: overdue.length, total: total(overdue), items: overdue.slice(0, top).map(pick) },
    due3:    { count: due3.length, total: total(due3), items: due3.slice(0, top).map(pick) },
    due7:    { count: due7.length, total: total(due7), items: due7.slice(0, top).map(pick) },
    expiring: { count: expiring.length, within30: expiring.filter(function (e) { return e.daysToExpire <= 30; }).length,
                items: expiring.slice(0, top) },
    paymentDiffs: { count: diffs.length, items: diffs.slice(0, top) },
    accrued: { month: mLabel, dueDate: dueDay, daysToDue: daysBetween_(today, dueDay), items: acc.length,
               total: insightRound_(acc.reduce(function (s, a) { return s + a.amount; }, 0)),
               missingCount: missing.length,
               missing: missing.slice(0, top).map(function (d) {
                 return { contractNo: d.contractNo, vendor: d.vendorName, site: d.mediaSite,
                          amount: insightRound_(d.installment || d.monthlyCost) };
               }) },
    receiptsWaiting: receiptWait.length,
    dataIssues: issues
  };
}

/* ---------- 2) สรุปตามกฎ (ใช้เมื่อไม่มี AI) ---------- */

function ruleInsight_(s) {
  const money = function (n) { return fmtMoney_(n) + ' บาท'; };
  const refs = function (items) { return items.slice(0, 5).map(function (x) { return x.contractNo; }).filter(String); };
  const names = function (items) { return items.slice(0, 3).map(function (x) { return x.vendor; }).join(', '); };
  const risks = [];
  // kw = คำที่ใช้ตรวจว่า AI รายงานเรื่องนี้แล้วหรือยัง (insightVerify_)
  if (s.overdue.count) risks.push({ level: 'high', title: 'เลยกำหนดจ่าย ' + s.overdue.count + ' งวด', kw: 'เลยกำหนด',
    detail: 'รวม ' + money(s.overdue.total) + ' เช่น ' + names(s.overdue.items), refs: refs(s.overdue.items) });
  if (s.due3.count) risks.push({ level: 'high', title: 'ครบกำหนดภายใน 3 วัน ' + s.due3.count + ' งวด', kw: '3 วัน',
    detail: 'รวม ' + money(s.due3.total) + ' เช่น ' + names(s.due3.items), refs: refs(s.due3.items) });
  const a = s.accrued;
  if (a.missingCount && a.daysToDue !== null && a.daysToDue <= 5) risks.push({ level: 'high', kw: 'Accrued',
    title: 'Accrued ' + a.month + ' ยังขาด ' + a.missingCount + ' รายการ',
    detail: (a.daysToDue >= 0 ? 'เหลือ ' + a.daysToDue + ' วันถึงกำหนดส่งบัญชี' : 'เลยกำหนดส่งบัญชีมา ' + (-a.daysToDue) + ' วัน') +
            ' · มีแล้ว ' + a.items + ' รายการ', refs: refs(a.missing) });
  if (s.due7.count) risks.push({ level: 'medium', title: 'ครบกำหนดภายใน 7 วัน ' + s.due7.count + ' งวด',
    detail: 'รวม ' + money(s.due7.total), refs: refs(s.due7.items) });
  if (s.paymentDiffs.count) risks.push({ level: 'medium', title: 'ยอดจ่ายจริงไม่ตรงยอดที่ต้องจ่าย ' + s.paymentDiffs.count + ' รายการ',
    detail: s.paymentDiffs.items.slice(0, 3).map(function (p) { return p.vendor + ' ' + p.month + ' ต่าง ' + fmtMoney_(p.diff); }).join(' · '),
    refs: [] });
  if (s.expiring.within30) risks.push({ level: 'medium', title: 'สัญญาหมดภายใน 30 วัน ' + s.expiring.within30 + ' สัญญา',
    detail: 'เตรียมต่อสัญญา', refs: refs(s.expiring.items) });
  else if (s.expiring.count) risks.push({ level: 'low', title: 'สัญญาหมดภายใน ' + CFG.EXPIRE_DAYS + ' วัน ' + s.expiring.count + ' สัญญา',
    detail: 'ติดตามการต่อสัญญา', refs: refs(s.expiring.items) });
  if (s.dataIssues.high) risks.push({ level: 'medium', title: 'ข้อมูลผิดพลาดระดับสำคัญ ' + s.dataIssues.high + ' จุด',
    detail: 'ดูแท็บตรวจสอบข้อมูล', refs: [] });
  if (s.receiptsWaiting) risks.push({ level: 'low', title: 'ใบเสร็จค้าง ' + s.receiptsWaiting + ' รายการ',
    detail: 'ติดตามใบเสร็จจากผู้รับเงิน', refs: [] });

  const summary = [
    'เลยกำหนด ' + s.overdue.count + ' งวด (' + money(s.overdue.total) + ') · ภายใน 3 วัน ' + s.due3.count + ' งวด · ภายใน 7 วัน ' + s.due7.count + ' งวด',
    'Accrued ' + a.month + ': มี ' + a.items + ' รายการ (' + money(a.total) + ') · ยังไม่อยู่ใน Accrued ' + a.missingCount + ' รายการ',
    'สัญญาหมดภายใน ' + CFG.EXPIRE_DAYS + ' วัน ' + s.expiring.count + ' สัญญา · ใบเสร็จค้าง ' + s.receiptsWaiting + ' รายการ'
  ];
  const actions = risks.filter(function (r) { return r.level !== 'low'; }).slice(0, 5).map(function (r) { return r.title; });
  return { summary: summary, risks: risks, actions: actions.length ? actions : ['ไม่มีงานเร่งด่วนวันนี้'] };
}

/* ---------- 3) เรียก AI (ฟรี: Gemini · หรือ Claude) + ตรวจคำตอบ ---------- */

const GEMINI = {
  ENDPOINT: 'https://generativelanguage.googleapis.com/v1beta/models/',
  MODEL: 'gemini-3.5-flash-lite'        // Free Tier — เปลี่ยนได้ที่ Script property GEMINI_MODEL
};

/** ผู้ให้บริการ AI: GEMINI_API_KEY (ฟรี) มาก่อน · AI_PROVIDER = claude บังคับใช้ Claude · ไม่มีคีย์ = null */
function aiProvider_() {
  const gemini = prop_('GEMINI_API_KEY', ''), claude = prop_('ANTHROPIC_API_KEY', '');
  const g = gemini ? { name: 'gemini', key: gemini, free: true } : null;
  const c = claude ? { name: 'claude', key: claude, free: false } : null;
  return String(prop_('AI_PROVIDER', '')).toLowerCase() === 'claude' ? (c || g) : (g || c);
}

/** ปิดชื่อคู่ค้า/ทำเลเป็นรหัส V01 / S01 ก่อนส่งออก — Free Tier ของ Gemini อาจนำข้อมูลไปพัฒนาโมเดล */
function insightMask_(snap) {
  const map = {}, back = {}, n = { V: 0, S: 0 };
  const code = function (kind, name) {
    if (!name) return name;
    const k = kind + '|' + name;
    if (!map[k]) {
      n[kind]++;
      map[k] = kind + (n[kind] < 10 ? '0' : '') + n[kind];
      back[map[k]] = name;
    }
    return map[k];
  };
  const masked = JSON.parse(JSON.stringify(snap));
  [masked.overdue.items, masked.due3.items, masked.due7.items, masked.expiring.items,
   masked.paymentDiffs.items, masked.accrued.missing].forEach(function (list) {
    list.forEach(function (x) {
      if ('vendor' in x) x.vendor = code('V', x.vendor);
      if ('site' in x) x.site = code('S', x.site);
    });
  });
  return {
    snap: masked,
    count: n.V + n.S,
    unmask: function (s) { return String(s || '').replace(/\b[VS]\d{2,3}\b/g, function (t) { return back[t] || t; }); }
  };
}

function insightParseJSON_(text) {
  const a = text.indexOf('{'), z = text.lastIndexOf('}');
  if (a < 0 || z < a) return null;
  try { return JSON.parse(text.slice(a, z + 1)); } catch (e) { return null; }
}

function insightFetch_(url, headers, body) {
  try {
    const res = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', headers: headers,
                                         payload: JSON.stringify(body), muteHttpExceptions: true });
    let json = {};
    try { json = JSON.parse(res.getContentText()); } catch (e) {}
    return { code: res.getResponseCode(), json: json };
  } catch (e) {
    return { code: 0, json: { error: { message: 'เชื่อมต่อ AI ไม่ได้: ' + e.message } } };
  }
}

function insightHttpError_(r) {
  return 'HTTP ' + r.code + ' ' + ((r.json.error && r.json.error.message) || '').slice(0, 150);
}

/** Gemini generateContent (Free Tier) — ขอผลเป็น JSON · system/model ไม่ระบุ = ตัววิเคราะห์หลัก */
function insightCallGemini_(key, userText, system, model) {
  model = model || prop_('GEMINI_MODEL', GEMINI.MODEL);
  const r = insightFetch_(GEMINI.ENDPOINT + encodeURIComponent(model) + ':generateContent', { 'x-goog-api-key': key }, {
    systemInstruction: { parts: [{ text: system || INSIGHT_PROMPT }] },
    contents: [{ role: 'user', parts: [{ text: userText }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.2, maxOutputTokens: INSIGHT.MAX_TOKENS }
  });
  if (r.code !== 200) return { ok: false, error: insightHttpError_(r) };
  const cand = (r.json.candidates || [])[0] || {};
  if (!cand.content) {
    const why = cand.finishReason || (r.json.promptFeedback && r.json.promptFeedback.blockReason) || 'ไม่มีคำตอบ';
    return { ok: false, error: 'Gemini ไม่ตอบ (' + why + ')' };
  }
  const text = (cand.content.parts || []).filter(function (p) { return !p.thought; })
    .map(function (p) { return p.text || ''; }).join('').trim();
  const u = r.json.usageMetadata || {};
  return { ok: true, model: r.json.modelVersion || model, raw: text, data: insightParseJSON_(text),
           usage: { input: u.promptTokenCount || 0, output: u.candidatesTokenCount || 0 } };
}

/** Claude Messages API */
function insightCallClaude_(key, userText, system, model) {
  model = model || prop_('AI_MODEL', CFG.AI_MODEL);
  const r = insightFetch_(AI_ENDPOINT,
    { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'server-side-fallback-2026-07-01' },
    { model: model, max_tokens: INSIGHT.MAX_TOKENS, thinking: { type: 'adaptive' }, output_config: { effort: 'low' },
      fallbacks: 'default', system: system || INSIGHT_PROMPT, messages: [{ role: 'user', content: userText }] });
  if (r.code !== 200) return { ok: false, error: insightHttpError_(r) };
  if (r.json.stop_reason === 'refusal') return { ok: false, error: 'AI ปฏิเสธคำขอ' };
  const text = (r.json.content || []).filter(function (b) { return b.type === 'text'; })
    .map(function (b) { return b.text; }).join('').trim();
  const u = r.json.usage || {};
  return { ok: true, model: r.json.model || model, raw: text, data: insightParseJSON_(text),
           usage: { input: u.input_tokens || 0, output: u.output_tokens || 0 } };
}

/** เลขที่สัญญาทั้งหมดที่อยู่ใน snapshot — ใช้ตัดอ้างอิงที่ AI แต่งขึ้นเอง */
function insightKnownRefs_(s) {
  const set = {};
  [s.overdue.items, s.due3.items, s.due7.items, s.expiring.items, s.accrued.missing].forEach(function (list) {
    list.forEach(function (x) { if (x.contractNo) set[x.contractNo] = 1; });
  });
  return set;
}

/** ยอดเงินทั้งหมดที่อยู่ใน snapshot (รวมยอดรวมแต่ละหมวด) — ใช้ตรวจตัวเลขที่ AI อ้าง */
function insightKnownAmounts_(s) {
  const out = [];
  const add = function (v) { if (typeof v === 'number' && isFinite(v)) { out.push(insightRound_(v)); out.push(insightRound_(Math.abs(v))); } };
  ['overdue', 'due3', 'due7'].forEach(function (k) { add(s[k].total); s[k].items.forEach(function (x) { add(x.amount); }); });
  s.paymentDiffs.items.forEach(function (p) { add(p.expected); add(p.actual); add(p.diff); });
  add(s.accrued.total);
  s.accrued.missing.forEach(function (x) { add(x.amount); });
  return out;
}

/** ① ② ตรวจรูปแบบ + ตัดเลขที่สัญญาที่ไม่มีจริง → { ok, insight, dropped } หรือ { ok:false, error } */
function validateInsight_(o, snap) {
  if (!o || typeof o !== 'object') return { ok: false, error: 'AI ไม่ได้ตอบเป็น JSON' };
  const str = function (v, max) { return clean_(v).slice(0, max); };
  if (!Array.isArray(o.summary)) return { ok: false, error: 'ไม่มี summary' };
  if (!Array.isArray(o.risks)) return { ok: false, error: 'risks ไม่ใช่ array' };
  const summary = o.summary.map(function (x) { return str(x, 300); }).filter(String).slice(0, 6);
  if (!summary.length) return { ok: false, error: 'summary ว่าง' };

  const known = insightKnownRefs_(snap);
  let dropped = 0;
  const risks = [];
  for (let i = 0; i < o.risks.length && risks.length < 10; i++) {
    const r = o.risks[i] || {};
    const level = String(r.level || '').toLowerCase();
    if (INSIGHT.LEVELS.indexOf(level) < 0) return { ok: false, error: 'ระดับความเสี่ยงไม่ถูกต้อง: ' + r.level };
    const title = str(r.title, 160);
    if (!title) return { ok: false, error: 'ความเสี่ยงข้อ ' + (i + 1) + ' ไม่มีหัวข้อ' };
    const refs = (Array.isArray(r.refs) ? r.refs : []).map(function (x) { return clean_(x); }).filter(function (x) {
      if (!x) return false;
      if (known[x]) return true;
      dropped++;
      return false;
    }).slice(0, 8);
    risks.push({ level: level, title: title, detail: str(r.detail, 500), refs: refs, src: 'ai' });
  }
  const actions = (Array.isArray(o.actions) ? o.actions : []).map(function (x) { return str(x, 200); }).filter(String).slice(0, 5);
  return { ok: true, insight: { summary: summary, risks: risks, actions: actions }, dropped: dropped };
}

/**
 * ③ ④ ตรวจเทียบข้อมูลจริง แล้วคืนชื่อจริงแทนรหัส
 *   - ความเสี่ยงสูงตามกฎที่ AI ไม่รายงาน (ไม่มีเลขสัญญาร่วม และหัวข้อไม่พูดถึง) → เพิ่มให้ ติดป้าย src = 'check'
 *   - ยอดเงินในข้อความ AI ที่ไม่ตรงกับยอดใดใน snapshot → บันทึกเป็นตัวเลขที่ตรวจไม่พบ
 */
function insightVerify_(insight, snap, rules, unmask) {
  const risks = insight.risks.slice();
  const aiHigh = risks.filter(function (r) { return r.level === 'high'; });
  let added = 0;
  rules.risks.filter(function (r) { return r.level === 'high'; }).forEach(function (rr) {
    const covered = aiHigh.some(function (a) {
      return a.refs.some(function (x) { return rr.refs.indexOf(x) > -1; }) ||
             (rr.kw && (a.title + ' ' + a.detail).indexOf(rr.kw) > -1);
    });
    if (!covered) {
      risks.push({ level: rr.level, title: rr.title, detail: rr.detail, refs: rr.refs, src: 'check' });
      added++;
    }
  });
  risks.sort(function (a, b) { return INSIGHT.LEVELS.indexOf(a.level) - INSIGHT.LEVELS.indexOf(b.level); });

  const amounts = insightKnownAmounts_(snap);
  const unverified = [];
  const texts = insight.summary.concat(insight.actions);
  risks.forEach(function (r) { if (r.src === 'ai' || r.src === 'review') texts.push(r.title, r.detail); });
  texts.join(' ').replace(/\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+\.\d{2}/g, function (m) {
    const v = +m.replace(/,/g, '');
    if (v >= 100 && !amounts.some(function (k) { return Math.abs(k - v) < 0.01; }) && unverified.indexOf(m) < 0) unverified.push(m);
    return m;
  });

  return {
    insight: {
      summary: insight.summary.map(unmask),
      risks: risks.map(function (r) {
        const o = { level: r.level, title: unmask(r.title), detail: unmask(r.detail), refs: r.refs, src: r.src };
        if (r.review) o.review = r.review;
        if (r.levelFrom) o.levelFrom = r.levelFrom;
        return o;
      }),
      actions: insight.actions.map(unmask)
    },
    checks: { added: added, unverified: unverified.slice(0, 5) }
  };
}

/* ---------- 3b) AI ตัวที่ 2 ตรวจซ้ำ (Cross-check) ---------- */

const REVIEW = {
  GEMINI_MODEL: 'gemini-3.8-flash'      // รุ่นที่เก่งกว่าตัววิเคราะห์ (Free Tier เช่นกัน)
};

const REVIEW_PROMPT = [
  'คุณคือผู้ตรวจสอบ (auditor) อิสระ ตรวจผลวิเคราะห์ความเสี่ยงที่ AI อีกตัวเขียน โดยเทียบกับ snapshot ข้อมูลจริง',
  '',
  'ตรวจทีละข้อ:',
  '- summary[i] และ risks[i]: ข้อความ จำนวนงวด ยอดเงิน วันที่ เลขที่สัญญา และระดับความเสี่ยง ตรงกับ snapshot หรือไม่',
  '- ok = true เมื่อถูกต้องทั้งหมด · ok = false เมื่อมีข้อมูลผิด/แต่งขึ้น (ใส่เหตุผลสั้น ๆ ใน reason)',
  '- level = ระดับที่ถูกต้องตามเกณฑ์: high = เลยกำหนด / ครบใน 3 วัน / Accrued ใกล้วันส่งแต่ยังขาด ·',
  '  medium = ครบใน 7 วัน / ยอดจ่ายไม่ตรง / สัญญาหมดใน 30 วัน / ข้อมูลผิดระดับสำคัญ · low = อื่น ๆ',
  '- missing = ความเสี่ยงสำคัญที่มีใน snapshot แต่ผลวิเคราะห์ไม่ได้กล่าวถึง (ไม่เกิน 3 ข้อ ไม่มีให้ใส่ [])',
  '- score = ความถูกต้องโดยรวม 0-100',
  '- ใช้เฉพาะข้อมูลใน snapshot · ชื่อคู่ค้า/ทำเลเป็นรหัส (V01, S01) ให้เขียนรหัสตรงตัว · ภาษาไทย',
  '',
  'ตอบเป็น JSON object อย่างเดียว ไม่มีข้อความอื่น รูปแบบ:',
  '{"score": 0, "summary": [{"i": 0, "ok": true, "reason": ""}],',
  ' "risks": [{"i": 0, "ok": true, "level": "high|medium|low", "reason": ""}],',
  ' "missing": [{"level": "high|medium|low", "title": "", "detail": "", "refs": ["เลขที่สัญญา"]}]}'
].join('\n');

/**
 * AI ตัวตรวจซ้ำ — Script property REVIEW_PROVIDER = auto (ค่าเริ่มต้น) | claude | gemini | off
 *   auto → Claude ถ้ามี ANTHROPIC_API_KEY (ต่างค่ายกับตัววิเคราะห์ = ตรวจอิสระที่สุด)
 *          ไม่งั้น Gemini รุ่น REVIEW.GEMINI_MODEL ด้วย GEMINI_API_KEY · เปลี่ยนรุ่นได้ที่ REVIEW_MODEL
 */
function reviewProvider_() {
  const want = String(prop_('REVIEW_PROVIDER', 'auto')).toLowerCase();
  if (want === 'off') return null;
  const claude = prop_('ANTHROPIC_API_KEY', ''), gemini = prop_('GEMINI_API_KEY', '');
  const c = claude ? { name: 'claude', key: claude, model: prop_('REVIEW_MODEL', prop_('AI_MODEL', CFG.AI_MODEL)) } : null;
  const g = gemini ? { name: 'gemini', key: gemini, model: prop_('REVIEW_MODEL', REVIEW.GEMINI_MODEL) } : null;
  if (want === 'claude') return c;
  if (want === 'gemini') return g;
  return c || g;
}

/**
 * ให้ AI ตัวที่ 2 ตรวจผลของตัวแรก (ข้อความยังเป็นรหัส V01/S01) เทียบ snapshot ที่ปิดชื่อแล้ว
 *   - ข้อที่ผู้ตรวจบอกว่าผิด → ตัดออก · ระดับไม่ตรงเกณฑ์ → ปรับตามผู้ตรวจ · ที่ขาด → เพิ่ม (ตรวจเลขสัญญาซ้ำ)
 *   - ผู้ตรวจล้มเหลว → คืนผลเดิม พร้อม review.status = ERROR / INVALID (workflow ไม่หยุด)
 */
function insightReview_(insight, maskedSnap, snap) {
  const rp = reviewProvider_();
  if (!rp) return { insight: insight, review: { status: 'OFF' } };
  const text = 'snapshot ข้อมูลจริง (JSON):\n' + JSON.stringify(maskedSnap) +
    '\n\nผลวิเคราะห์ที่ต้องตรวจ (JSON):\n' + JSON.stringify({
      summary: insight.summary,
      risks: insight.risks.map(function (r) { return { level: r.level, title: r.title, detail: r.detail, refs: r.refs }; })
    });
  const r = rp.name === 'gemini' ? insightCallGemini_(rp.key, text, REVIEW_PROMPT, rp.model)
                                 : insightCallClaude_(rp.key, text, REVIEW_PROMPT, rp.model);
  const base = { provider: rp.name, model: rp.model };
  if (!r.ok) return { insight: insight, review: Object.assign(base, { status: 'ERROR', note: r.error }) };
  base.model = r.model;
  base.tokens = r.usage.input + ' / ' + r.usage.output;
  const o = r.data;
  if (!o || typeof o !== 'object' || !Array.isArray(o.risks)) {
    return { insight: insight, review: Object.assign(base, { status: 'INVALID', note: 'ผู้ตรวจไม่ได้ตอบเป็น JSON ตามรูปแบบ' }) };
  }
  const byIndex = function (arr) {
    const m = {};
    (Array.isArray(arr) ? arr : []).forEach(function (x) { if (x && typeof x.i === 'number') m[x.i] = x; });
    return m;
  };
  const rv = byIndex(o.risks), sv = byIndex(o.summary);

  let rejected = 0, levelFixed = 0;
  const reasons = [], risks = [];
  insight.risks.forEach(function (risk, i) {
    const x = rv[i];
    if (x && x.ok === false) {
      rejected++;
      reasons.push(risk.title + ' — ' + clean_(x.reason).slice(0, 120));
      return;
    }
    const out = Object.assign({}, risk, { review: x ? 'ok' : 'unchecked' });
    const lv = x ? String(x.level || '').toLowerCase() : '';
    if (lv && INSIGHT.LEVELS.indexOf(lv) > -1 && lv !== risk.level) { out.levelFrom = risk.level; out.level = lv; levelFixed++; }
    risks.push(out);
  });

  let summary = insight.summary.filter(function (s, i) { return !(sv[i] && sv[i].ok === false); });
  const summaryRejected = insight.summary.length - summary.length;
  insight.summary.forEach(function (s, i) {
    if (sv[i] && sv[i].ok === false) reasons.push('สรุป: ' + s.slice(0, 60) + ' — ' + clean_(sv[i].reason).slice(0, 120));
  });
  if (!summary.length) summary = ['ผู้ตรวจ AI ไม่ยืนยันสรุปภาพรวม — ดูรายการความเสี่ยงด้านล่าง'];

  const known = insightKnownRefs_(snap);
  let added = 0;
  (Array.isArray(o.missing) ? o.missing : []).slice(0, 3).forEach(function (m) {
    const lv = String((m && m.level) || '').toLowerCase();
    const title = clean_(m && m.title).slice(0, 160);
    if (INSIGHT.LEVELS.indexOf(lv) < 0 || !title) return;
    const refs = (Array.isArray(m.refs) ? m.refs : []).map(function (x) { return clean_(x); })
      .filter(function (x) { return known[x]; }).slice(0, 8);
    risks.push({ level: lv, title: title, detail: clean_(m.detail).slice(0, 500), refs: refs, src: 'review', review: 'added' });
    added++;
  });

  return {
    insight: { summary: summary, risks: risks, actions: insight.actions },
    review: Object.assign(base, {
      status: 'OK', score: Math.max(0, Math.min(100, Math.round(+o.score || 0))),
      rejected: rejected, summaryRejected: summaryRejected, levelFixed: levelFixed, added: added, reasons: reasons.slice(0, 6)
    })
  };
}

/** ผลการตรวจซ้ำโดย AI ตัวที่ 2 เป็นข้อความสั้น */
function insightReviewNote_(rv) {
  if (!rv || rv.status === 'OFF') return 'ยังไม่ได้เปิด AI ตรวจซ้ำ';
  if (rv.status !== 'OK') return 'AI ตรวจซ้ำไม่สำเร็จ (' + rv.status + '): ' + (rv.note || '');
  return 'AI ตรวจซ้ำ ' + rv.model + ' คะแนน ' + rv.score + '/100 · ตัดข้อที่ผิด ' + (rv.rejected + rv.summaryRejected) +
         ' · ปรับระดับ ' + rv.levelFixed + ' · เพิ่มที่ขาด ' + rv.added;
}

/** ข้อความสรุปผลการตรวจ (แสดงบนการ์ด / ชีต / Log) */
function insightCheckNote_(c) {
  return [
    'ตรวจรูปแบบผ่าน',
    c.masked ? 'ปิดชื่อคู่ค้า/ทำเลก่อนส่ง ' + c.masked + ' รายการ' : '',
    c.refsDropped ? 'ตัดเลขสัญญาที่ไม่มีจริง ' + c.refsDropped : 'เลขสัญญาตรงข้อมูล',
    insightReviewNote_(c.review),
    c.added ? 'ระบบเพิ่มความเสี่ยงสูงที่ AI ไม่รายงาน ' + c.added : 'ครอบคลุมความเสี่ยงสูงครบ',
    c.unverified.length ? 'ตัวเลขที่ตรวจไม่พบในข้อมูล: ' + c.unverified.join(', ') : 'ยอดเงินตรงข้อมูล'
  ].filter(String).join(' · ');
}

/* ---------- 4) บันทึก / อ่าน / ส่งอีเมล ---------- */

function ensureInsightSheet_() {
  const sh = getSheet_(INSIGHT.SHEET);
  if (sh.getLastRow() === 0) {
    sh.appendRow(INSIGHT.HEADER);
    sh.getRange(1, 1, 1, INSIGHT.HEADER.length).setFontWeight('bold').setBackground('#EDE9FE');
    sh.setFrozenRows(1);
    INSIGHT.WIDTHS.forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
  }
  return sh;
}

function insightFromRow_(r) {
  const parse = function (s, d) { try { return JSON.parse(s); } catch (e) { return d; } };
  const ts = r[0] instanceof Date ? Utilities.formatDate(r[0], CFG.TZ, 'dd/MM/yyyy HH:mm') : String(r[0]);
  return {
    ts: ts, trigger: String(r[1]), status: String(r[2]), provider: String(r[3]), model: String(r[4]),
    summary: String(r[5] || '').split('\n').filter(String),
    risks: parse(r[6], []), actions: String(r[7] || '').split('\n').filter(String),
    checks: parse(r[8], null), note: String(r[9] || ''), tokens: String(r[10] || ''), ms: +r[11] || 0,
    emailed: String(r[12] || '')
  };
}

/** ผลวิเคราะห์ล่าสุด (null ถ้ายังไม่เคยรัน) */
function latestInsight_() {
  const sh = ss_().getSheetByName(INSIGHT.SHEET);
  if (!sh || sh.getLastRow() < 2) return null;
  return insightFromRow_(sh.getRange(sh.getLastRow(), 1, 1, INSIGHT.HEADER.length).getValues()[0]);
}

function insightRecipients_() {
  const list = String(prop_('INSIGHT_EMAILS', CFG.ADMIN_EMAIL)).split(',').map(function (s) { return s.trim(); }).filter(validEmail_);
  return list.length ? list : [CFG.ADMIN_EMAIL];
}

function insightEmail_(it) {
  const color = { high: '#DC2626', medium: '#D97706', low: '#64748B' };
  const label = { high: 'สูง', medium: 'กลาง', low: 'ต่ำ' };
  const li = function (items) {
    return '<ul style="margin:6px 0 0;padding-left:20px;font-size:14px;line-height:1.7;color:' + MSTYLE.INK + '">' +
      items.map(function (s) { return '<li>' + htmlEsc_(s) + '</li>'; }).join('') + '</ul>';
  };
  const box = function (title, inner) {
    return '<div style="margin-top:18px;background:#FFFFFF;border:1px solid ' + MSTYLE.LINE + ';border-radius:10px;padding:14px 18px">' +
      '<div style="font-size:15px;font-weight:800;color:' + MSTYLE.INK + '">' + htmlEsc_(title) + '</div>' + inner + '</div>';
  };
  const risks = it.risks.map(function (r) {
    return '<div style="margin-top:10px;padding-left:10px;border-left:4px solid ' + color[r.level] + '">' +
      pill_(label[r.level], color[r.level], '#FFFFFF') + ' <b style="font-size:14px">' + htmlEsc_(r.title) + '</b>' +
      '<div style="font-size:13px;color:' + MSTYLE.MUTED + ';margin-top:2px">' + htmlEsc_(r.detail) +
      (r.refs.length ? ' · สัญญา ' + htmlEsc_(r.refs.join(', ')) : '') + '</div></div>';
  }).join('');
  const high = it.risks.filter(function (r) { return r.level === 'high'; }).length;
  const who = it.status === 'AI' ? '✦ AI สรุปความเสี่ยง' : 'สรุปความเสี่ยง (ตามกฎของระบบ)';
  return buildEmail_('[Billboard] ' + who + 'วันนี้ — ระดับสูง ' + high + ' เรื่อง', {
    title: who + 'ประจำวัน',
    subtitle: 'ข้อมูล ณ ' + it.ts + ' · ' + (it.status === 'AI'
      ? 'วิเคราะห์โดย ' + it.model + (it.provider === 'gemini' ? ' (ฟรี)' : '') +
        (it.checks && it.checks.review && it.checks.review.status === 'OK'
          ? ' · ตรวจซ้ำโดย ' + it.checks.review.model + ' (' + it.checks.review.score + '/100)' : '') + ' · ผ่านการตรวจของระบบ'
      : 'สรุปตามกฎของระบบ (' + it.status + ')'),
    accent: '#6D28D9',
    sections: [box('ภาพรวม', li(it.summary)), box('ความเสี่ยง', risks), box('สิ่งที่ควรทำวันนี้', li(it.actions))]
  });
}

/**
 * รันการวิเคราะห์ 1 รอบ · trigger: 'auto' (จาก trigger รายวัน) | อีเมลผู้กดรันเอง
 * ส่งอีเมลเฉพาะรอบอัตโนมัติที่มีความเสี่ยงระดับสูง
 */
function runAIInsight_(trigger) {
  const t0 = Date.now();
  const snap = insightSnapshot_();
  const rules = ruleInsight_(snap);
  const prov = aiProvider_();
  let insight = null, status = 'RULES', model = 'rules', tokens = '', checks = null;
  let note = 'ยังไม่ได้ตั้ง GEMINI_API_KEY (ฟรี) หรือ ANTHROPIC_API_KEY — ใช้สรุปตามกฎ';
  if (prov) {
    const m = insightMask_(snap);
    const text = 'snapshot ข้อมูล ณ วันที่ ' + snap.today + ' (JSON):\n' + JSON.stringify(m.snap);
    const r = prov.name === 'gemini' ? insightCallGemini_(prov.key, text) : insightCallClaude_(prov.key, text);
    if (r.ok) {
      tokens = r.usage.input + ' / ' + r.usage.output;
      model = r.model;
      const v = validateInsight_(r.data, snap);
      if (v.ok) {
        const rv = insightReview_(v.insight, m.snap, snap);           // AI ตัวที่ 2 ตรวจซ้ำ
        if (rv.review.reasons) rv.review.reasons = rv.review.reasons.map(m.unmask);
        const c = insightVerify_(rv.insight, snap, rules, m.unmask);
        insight = c.insight;
        checks = { format: true, masked: m.count, refsDropped: v.dropped, review: rv.review,
                   added: c.checks.added, unverified: c.checks.unverified };
        status = 'AI';
        note = insightCheckNote_(checks);
      } else {
        status = 'INVALID'; note = 'คำตอบ AI ไม่ผ่านการตรวจ: ' + v.error + ' — ใช้สรุปตามกฎแทน';
      }
    } else {
      status = 'ERROR'; note = 'เรียก AI ไม่สำเร็จ: ' + r.error + ' — ใช้สรุปตามกฎแทน';
    }
  }
  if (!insight) {
    insight = rules;
    model = 'rules';
  }

  const it = {
    ts: Utilities.formatDate(new Date(), CFG.TZ, 'dd/MM/yyyy HH:mm'), trigger: trigger === 'auto' ? 'auto' : 'manual',
    status: status, provider: prov ? prov.name : '', model: model,
    summary: insight.summary, actions: insight.actions, checks: checks,
    risks: insight.risks.map(function (r) {
      const o = { level: r.level, title: r.title, detail: r.detail, refs: r.refs, src: r.src || (status === 'AI' ? 'ai' : 'rules') };
      if (r.review) o.review = r.review;
      if (r.levelFrom) o.levelFrom = r.levelFrom;
      return o;
    }),
    note: note, tokens: tokens, ms: Date.now() - t0, emailed: ''
  };
  if (it.trigger === 'auto' && it.risks.some(function (r) { return r.level === 'high'; })) {
    const to = insightRecipients_();
    try { sendEmail_(to, insightEmail_(it)); it.emailed = to.join(', '); }
    catch (e) { it.note += ' · ส่งอีเมลไม่สำเร็จ: ' + e.message; }
  }

  const sh = ensureInsightSheet_();
  sh.appendRow([new Date(), it.trigger, it.status, it.provider || '-', it.model, it.summary.join('\n'),
                JSON.stringify(it.risks), it.actions.join('\n'), checks ? JSON.stringify(checks) : '', it.note,
                it.tokens, it.ms, it.emailed, JSON.stringify(snap).slice(0, 45000)]);
  sh.getRange(sh.getLastRow(), 1).setNumberFormat('dd/MM/yyyy HH:mm');
  writeLog_(it.trigger === 'auto' ? 'system' : trigger, 'AI_INSIGHT', it.status + ' · ' + it.model +
    (checks ? ' · ' + insightReviewNote_(checks.review) + ' · เพิ่มโดยกฎ ' + checks.added +
              ' · ตัวเลขตรวจไม่พบ ' + checks.unverified.length : '') + ' · ความเสี่ยง ' +
    it.risks.length + ' (สูง ' + it.risks.filter(function (r) { return r.level === 'high'; }).length + ')' +
    (it.emailed ? ' · อีเมล → ' + it.emailed : '') + ' · ' + it.ms + ' ms');
  return it;
}

/** เรียกจาก dailyAlertCheck — ห้ามทำให้การแจ้งเตือนหลักล้ม */
function dailyAIInsight_() {
  try { return runAIInsight_('auto'); }
  catch (e) { writeLog_('system', 'AI_INSIGHT', 'error: ' + e.message); return null; }
}

/* ---------- 5) API ---------- */

function apiAIInsight_(token) {
  auth_(token);
  return { ok: true, insight: latestInsight_(), aiOn: !!aiProvider_() };
}

function apiRunAIInsight_(token) {
  const me = authAdmin_(token);
  if (!me) return forbidden_('สั่งวิเคราะห์ AI');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return { ok: false, code: 'BUSY', message: 'กำลังวิเคราะห์อยู่ กรุณารอสักครู่' };
  try {
    return { ok: true, insight: runAIInsight_(me.email), aiOn: !!aiProvider_() };
  } finally {
    lock.releaseLock();
  }
}

/** ทดสอบจาก Apps Script Editor: รันวิเคราะห์ 1 รอบ (ไม่ส่งอีเมล) แล้วดูผลใน Execution log + ชีต AI_Insights */
function testAIInsight() {
  Logger.log(JSON.stringify(runAIInsight_('editor-test'), null, 2));
}
