/**
 * Attach.gs — ไฟล์แนบรายรายการ (Google Drive) + AI ตรวจเอกสารเทียบข้อมูลในชีต
 *
 * ไฟล์แนบ:
 *   - 1 รายการ = 1 แถวของ Contract_Master (สัญญา + ผู้รับเงิน + ทำเล + รอบเดือน) → key จาก attKey_()
 *   - ไฟล์เก็บในโฟลเดอร์ Drive ของเจ้าของสคริปต์ (ATTACH_FOLDER_ID สร้างให้อัตโนมัติ)
 *     ดัชนีอยู่ในชีต Attachments — หน้าเว็บเห็นไฟล์ใหม่ผ่านระบบซิงค์ (dataFingerprint_)
 *   - ดู / ดาวน์โหลดผ่าน API (ผู้ใช้ไม่ต้องมีสิทธิ์ Drive) · เพิ่ม / ลบ / ตรวจด้วย AI เฉพาะ admin
 *   - ลบ = ย้ายไฟล์ไปถังขยะ Drive (กู้คืนได้ 30 วัน) + ลบแถวดัชนี
 *
 * AI ตรวจเอกสาร (รูปภาพ / PDF):
 *   1. AI อ่านเอกสาร → ดึงข้อมูลเป็น JSON (ผู้รับเงิน, เลขที่เอกสาร, PR, PO, ยอดก่อน VAT, รอบเดือน …)
 *   2. โค้ดเทียบกับข้อมูลในชีตทีละช่องเอง (ไม่ให้ AI ตัดสินว่าตรงหรือไม่) → ตรง / ไม่ตรง / ไม่พบในเอกสาร
 *   3. บันทึกผลในชีต Attachments + Log
 *   ผู้ให้บริการ: DOC_AI_PROVIDER = auto (Claude ถ้ามีคีย์ — ไม่นำข้อมูลไปเทรน, ไม่งั้น Gemini ฟรี) | claude | gemini
 */

const ATTACH = {
  SHEET: 'Attachments',
  HEADER: ['Timestamp', 'Key', 'Contract No.', 'Vendor', 'Media Site', 'Month', 'File name', 'MIME', 'Size (bytes)',
           'Drive File ID', 'Uploaded by', 'AI Status', 'AI Result (JSON)', 'AI Checked'],
  WIDTHS: [130, 220, 110, 200, 160, 70, 220, 120, 90, 230, 160, 90, 380, 130],
  MAX_BYTES: 10 * 1024 * 1024,
  FOLDER_PROP: 'ATTACH_FOLDER_ID',
  FOLDER_NAME: 'Billboard Rental Hub — ไฟล์แนบ',
  // ไฟล์ที่รับ: รูป, PDF, เอกสาร Office, CSV/TXT
  TYPES: /^(image\/(png|jpeg|webp|gif)|application\/pdf|text\/(plain|csv)|application\/(vnd\.openxmlformats-officedocument\.(spreadsheetml\.sheet|wordprocessingml\.document)|vnd\.ms-excel|msword))$/,
  AI_TYPES: /^(image\/(png|jpeg|webp|gif)|application\/pdf)$/
};

/** key ของรายการ (ไม่ขึ้นกับเลขแถว — แทรก/ลบแถวในชีตแล้วไฟล์ยังผูกกับรายการเดิม) */
function attKey_(d) {
  return [d.contractNo, d.vendorNo || d.vendorName, d.mediaSite, d.month]
    .map(function (s) { return clean_(s).toLowerCase(); }).join('|');
}

function ensureAttachSheet_() {
  const sh = getSheet_(ATTACH.SHEET);
  if (sh.getLastRow() === 0) {
    sh.appendRow(ATTACH.HEADER);
    sh.getRange(1, 1, 1, ATTACH.HEADER.length).setFontWeight('bold').setBackground('#E0F2FE');
    sh.setFrozenRows(1);
    ATTACH.WIDTHS.forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
  }
  return sh;
}

function attachFolder_() {
  const id = prop_(ATTACH.FOLDER_PROP, '');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* โฟลเดอร์ถูกลบ — สร้างใหม่ */ }
  }
  const f = DriveApp.createFolder(ATTACH.FOLDER_NAME);
  PropertiesService.getScriptProperties().setProperty(ATTACH.FOLDER_PROP, f.getId());
  return f;
}

function attachFromRow_(r, row) {
  let ai = null;
  try { ai = r[12] ? JSON.parse(r[12]) : null; } catch (e) {}
  return {
    id: 'F' + row, ts: r[0] instanceof Date ? Utilities.formatDate(r[0], CFG.TZ, 'dd/MM/yyyy HH:mm') : String(r[0]),
    key: String(r[1]), contractNo: String(r[2]), vendor: String(r[3]), site: String(r[4]), month: String(r[5]),
    name: String(r[6]), mime: String(r[7]), size: +r[8] || 0, fileId: String(r[9]), by: String(r[10]),
    aiStatus: String(r[11] || ''), ai: ai,
    aiTs: r[13] instanceof Date ? Utilities.formatDate(r[13], CFG.TZ, 'dd/MM/yyyy HH:mm') : String(r[13] || '')
  };
}

function readAttachments_() {
  const sh = ss_().getSheetByName(ATTACH.SHEET);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, ATTACH.HEADER.length).getValues()
    .map(function (r, i) { return attachFromRow_(r, i + 2); })
    .filter(function (a) { return a.fileId; });
}

/** { key: จำนวนไฟล์ } — ใช้แสดง 📎 ในตารางทะเบียนค่าเช่า */
function attachCounts_() {
  const m = {};
  readAttachments_().forEach(function (a) { m[a.key] = (m[a.key] || 0) + 1; });
  return m;
}

function attachmentsFor_(key) {
  return readAttachments_().filter(function (a) { return a.key === key; }).reverse();   // ล่าสุดก่อน
}

function rentalById_(id) {
  return readRentals_().filter(function (d) { return d.id === id; })[0] || null;
}

/** หาแถวไฟล์จาก id 'F<row>' และตรวจว่ายังเป็นไฟล์เดิม (fileId ตรง) */
function attachTarget_(p) {
  const row = parseInt(String(p.fid || '').replace(/^F/, ''), 10);
  const sh = ss_().getSheetByName(ATTACH.SHEET);
  if (!sh || !row || row < 2 || row > sh.getLastRow()) return { error: { ok: false, code: 'NOT_FOUND', message: 'ไม่พบไฟล์แนบ' } };
  const a = attachFromRow_(sh.getRange(row, 1, 1, ATTACH.HEADER.length).getValues()[0], row);
  if (p.fileId && a.fileId !== String(p.fileId)) {
    return { error: { ok: false, code: 'STALE', message: 'รายการไฟล์เปลี่ยนไปแล้ว กรุณารีเฟรชแล้วลองใหม่' } };
  }
  return { sh: sh, row: row, a: a };
}

/* ---------- API: รายการ / อัปโหลด / ดาวน์โหลด / ลบ ---------- */

function apiAttachments_(token, p) {
  auth_(token);
  const d = rentalById_(p.id);
  if (!d) return { ok: false, code: 'NOT_FOUND', message: 'ไม่พบรายการค่าเช่า' };
  return { ok: true, key: attKey_(d), files: attachmentsFor_(attKey_(d)), docAI: docProviderInfo_() };
}

/** p: { id: rental id, name, mime, data: base64, opId } — opId กันอัปโหลดซ้ำเมื่อเน็ตสะดุดแล้วส่งใหม่ */
function apiUploadAttachment_(token, p) {
  const me = authAdmin_(token);
  if (!me) return forbidden_('แนบไฟล์');
  const d = rentalById_(p.id);
  if (!d) return { ok: false, code: 'NOT_FOUND', message: 'ไม่พบรายการค่าเช่า' };
  const mime = String(p.mime || '').toLowerCase();
  if (!ATTACH.TYPES.test(mime)) return { ok: false, code: 'INVALID_VALUE', message: 'ไม่รองรับไฟล์ชนิดนี้ (รับรูปภาพ, PDF, Excel, Word, CSV, TXT)' };
  const name = clean_(p.name).replace(/[\\\/:*?"<>|]/g, '_').slice(0, 150) || 'file';
  const cache = CacheService.getScriptCache();
  const opKey = p.opId ? 'up_' + String(p.opId).slice(0, 60) : '';
  if (opKey && cache.get(opKey)) return { ok: true, duplicate: true, files: attachmentsFor_(attKey_(d)) };

  let bytes;
  try { bytes = Utilities.base64Decode(String(p.data || '')); } catch (e) {
    return { ok: false, code: 'INVALID_VALUE', message: 'ไฟล์เสียหาย อัปโหลดไม่สำเร็จ' };
  }
  if (!bytes.length) return { ok: false, code: 'MISSING_FIELD', message: 'ไฟล์ว่าง' };
  if (bytes.length > ATTACH.MAX_BYTES) return { ok: false, code: 'TOO_LARGE', message: 'ไฟล์ใหญ่เกิน 10 MB' };

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const stamp = Utilities.formatDate(new Date(), CFG.TZ, 'yyyyMMdd-HHmmss');
    const file = attachFolder_().createFile(
      Utilities.newBlob(bytes, mime, [d.contractNo || 'NoContract', d.month, stamp, name].join('_')));
    file.setDescription('Billboard Rental Hub · ' + [d.contractNo, d.vendorName, d.mediaSite, d.month].join(' · ') + ' · โดย ' + me.email);
    const sh = ensureAttachSheet_();
    sh.appendRow([new Date(), attKey_(d), d.contractNo, d.vendorName, d.mediaSite, d.month, name, mime, bytes.length,
                  file.getId(), me.email, '', '', '']);
    sh.getRange(sh.getLastRow(), 1).setNumberFormat('dd/MM/yyyy HH:mm');
    if (opKey) cache.put(opKey, '1', 600);
    invalidateData_();
    writeLog_(me.email, 'ADD_ATTACHMENT', [d.contractNo, d.vendorName, d.mediaSite, d.month].join(' · ') + ' | ' + name + ' (' + bytes.length + ' bytes)');
    return { ok: true, files: attachmentsFor_(attKey_(d)) };
  } finally {
    lock.releaseLock();
  }
}

/** เปิดดู / ดาวน์โหลด — คืนเนื้อไฟล์เป็น base64 (ทุกคนที่ล็อกอิน) */
function apiGetAttachment_(token, p) {
  auth_(token);
  const t = attachTarget_(p);
  if (t.error) return t.error;
  let blob;
  try { blob = DriveApp.getFileById(t.a.fileId).getBlob(); } catch (e) {
    return { ok: false, code: 'NOT_FOUND', message: 'ไม่พบไฟล์ใน Google Drive (อาจถูกลบไปแล้ว)' };
  }
  return { ok: true, name: t.a.name, mime: t.a.mime, data: Utilities.base64Encode(blob.getBytes()) };
}

function apiDeleteAttachment_(token, p) {
  const me = authAdmin_(token);
  if (!me) return forbidden_('ลบไฟล์แนบ');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const t = attachTarget_(p);
    if (t.error) return t.error;
    try { DriveApp.getFileById(t.a.fileId).setTrashed(true); } catch (e) { /* ไฟล์ไม่อยู่แล้ว — ลบแถวดัชนีต่อ */ }
    t.sh.deleteRow(t.row);
    invalidateData_();
    writeLog_(me.email, 'DELETE_ATTACHMENT', [t.a.contractNo, t.a.vendor, t.a.site, t.a.month].join(' · ') + ' | ' + t.a.name + ' → ถังขยะ Drive');
    return { ok: true, files: attachmentsFor_(t.a.key) };
  } finally {
    lock.releaseLock();
  }
}

/* ---------- AI ตรวจเอกสารเทียบข้อมูล ---------- */

const DOC_PROMPT = [
  'คุณคือผู้อ่านเอกสารการเงิน (ใบแจ้งหนี้ ใบเสร็จ ใบกำกับภาษี Memo สัญญา) ของค่าเช่าป้ายโฆษณา',
  'อ่านเอกสารที่แนบแล้วดึงข้อมูลตามที่เห็นในเอกสารจริงเท่านั้น ห้ามเดา ถ้าไม่พบให้ใส่ "" หรือ 0',
  '',
  'ตอบเป็น JSON object อย่างเดียว ไม่มีข้อความอื่น รูปแบบ:',
  '{"docType": "ใบแจ้งหนี้|ใบเสร็จ|ใบกำกับภาษี|Memo|สัญญา|อื่น ๆ",',
  ' "vendor": "ชื่อผู้รับเงิน/ผู้ออกเอกสาร", "documentNo": "เลขที่เอกสาร", "contractNo": "เลขที่สัญญา",',
  ' "pr": "เลข PR", "po": "เลข PO", "site": "ทำเล/สถานที่ติดตั้ง",',
  ' "periodMonth": "yyyy-MM ของรอบค่าเช่า (ปี ค.ศ.)", "periodText": "ข้อความรอบค่าเช่าตามเอกสาร",',
  ' "date": "yyyy-MM-dd วันที่เอกสาร (ค.ศ.)", "amountBeforeVat": 0, "vat": 0, "amountTotal": 0,',
  ' "readable": true, "notes": "ข้อสังเกตสั้น ๆ เช่น เอกสารไม่ชัด มีลายมือแก้ไข ยอดไม่ตรงกันในเอกสาร"}'
].join('\n');

/** ผู้ให้บริการ AI อ่านเอกสาร: auto → Claude (ไม่นำข้อมูลไปเทรน) ถ้ามีคีย์ ไม่งั้น Gemini */
function docProvider_() {
  const want = String(prop_('DOC_AI_PROVIDER', 'auto')).toLowerCase();
  const claude = prop_('ANTHROPIC_API_KEY', ''), gemini = prop_('GEMINI_API_KEY', '');
  const c = claude ? { name: 'claude', key: claude, model: prop_('AI_MODEL', CFG.AI_MODEL), free: false } : null;
  const g = gemini ? { name: 'gemini', key: gemini, model: prop_('DOC_MODEL', REVIEW.GEMINI_MODEL), free: true } : null;
  if (want === 'gemini') return g || c;
  if (want === 'claude') return c || g;
  return c || g;
}

function docProviderInfo_() {
  const p = docProvider_();
  return p ? { name: p.name, model: p.model, free: p.free } : null;
}

function docCallAI_(prov, mime, b64) {
  const ask = 'อ่านเอกสารนี้แล้วตอบเป็น JSON ตามรูปแบบ';
  if (prov.name === 'gemini') {
    const r = insightFetch_(GEMINI.ENDPOINT + encodeURIComponent(prov.model) + ':generateContent', { 'x-goog-api-key': prov.key }, {
      systemInstruction: { parts: [{ text: DOC_PROMPT }] },
      contents: [{ role: 'user', parts: [{ inlineData: { mimeType: mime, data: b64 } }, { text: ask }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0, maxOutputTokens: 4000 }
    });
    if (r.code !== 200) return { ok: false, error: insightHttpError_(r) };
    const cand = (r.json.candidates || [])[0] || {};
    if (!cand.content) return { ok: false, error: 'Gemini ไม่ตอบ (' + (cand.finishReason || 'ไม่มีคำตอบ') + ')' };
    const text = (cand.content.parts || []).filter(function (x) { return !x.thought; }).map(function (x) { return x.text || ''; }).join('');
    return { ok: true, model: r.json.modelVersion || prov.model, data: insightParseJSON_(text) };
  }
  const block = mime === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: mime, data: b64 } }
    : { type: 'image', source: { type: 'base64', media_type: mime, data: b64 } };
  const r = insightFetch_(AI_ENDPOINT,
    { 'x-api-key': prov.key, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'server-side-fallback-2026-07-01' },
    { model: prov.model, max_tokens: 4000, fallbacks: 'default', system: DOC_PROMPT,
      messages: [{ role: 'user', content: [block, { type: 'text', text: ask }] }] });
  if (r.code !== 200) return { ok: false, error: insightHttpError_(r) };
  if (r.json.stop_reason === 'refusal') return { ok: false, error: 'AI ปฏิเสธคำขอ' };
  const text = (r.json.content || []).filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('');
  return { ok: true, model: r.json.model || prov.model, data: insightParseJSON_(text) };
}

/** ตัดคำทั่วไปออกก่อนเทียบชื่อบริษัท */
function docNormName_(s) {
  return clean_(s).toLowerCase()
    .replace(/บริษัท|จำกัด|\(มหาชน\)|มหาชน|ห้างหุ้นส่วน|หจก\.?|บจก\.?|co\.?,?\s*ltd\.?|company|limited|public|plc|\s|[.,()]/g, '');
}
function docNormCode_(s) { return clean_(s).toUpperCase().replace(/[\s\-\/_.]/g, ''); }

/**
 * เทียบข้อมูลที่ AI อ่านจากเอกสาร กับข้อมูลรายการในชีต — ตัดสินด้วยโค้ด
 * result: match | mismatch | missing (ไม่พบในเอกสาร) | nodata (ไม่มีในชีต)
 */
function docCompare_(x, d) {
  const out = [];
  const add = function (label, inData, inDoc, result, note) {
    out.push({ label: label, data: inData === '' || inData == null ? '-' : String(inData),
               doc: inDoc === '' || inDoc == null ? '-' : String(inDoc), result: result, note: note || '' });
  };
  const text = function (label, a, b, norm, partial) {
    if (!clean_(a)) return add(label, a, b, 'nodata');
    if (!clean_(b)) return add(label, a, b, 'missing');
    const A = norm(a), B = norm(b);
    if (!A) return add(label, a, b, 'nodata');
    if (!B) return add(label, a, b, 'missing');
    // ชื่อสั้นมาก (≤ 2 ตัว) ต้องตรงทั้งคำ — กัน "บี" ไปตรงกับชื่อยาวอื่นโดยบังเอิญ
    const ok = partial && Math.min(A.length, B.length) > 2 ? (A.indexOf(B) > -1 || B.indexOf(A) > -1) : A === B;
    add(label, a, b, ok ? 'match' : 'mismatch');
  };
  text('ผู้รับเงิน (Vendor)', d.vendorName, x.vendor, docNormName_, true);
  text('เลขที่สัญญา', d.contractNo, x.contractNo, docNormCode_, false);
  text('PR', d.pr, x.pr, docNormCode_, false);
  text('PO', d.po, x.po, docNormCode_, false);
  text('MEMO/INV No.', d.memoInv, x.documentNo, docNormCode_, false);
  text('ทำเล (Media Site)', d.mediaSite, x.site, docNormName_, true);

  // รอบเดือน: Month ของแถว (Sep-26) เทียบ periodMonth ของเอกสาร
  const mKey = accruedMonthKey_(d.month);
  const docM = /^\d{4}-\d{2}$/.test(clean_(x.periodMonth)) ? clean_(x.periodMonth) : '';
  if (!mKey) add('รอบเดือน', d.month, x.periodText || docM, 'nodata');
  else if (!docM) add('รอบเดือน', d.month, x.periodText, 'missing');
  else add('รอบเดือน', d.month, (x.periodText || docM), docM === mKey ? 'match' : 'mismatch');

  // ยอดเงิน: ยอดเดือนนี้ในชีต เทียบยอดก่อน VAT (หรือยอดรวม = ยอด × 1.07)
  const want = Math.round((+d.installment || 0) * 100) / 100;
  const before = +x.amountBeforeVat || 0, total = +x.amountTotal || 0;
  if (!want) add('ยอดเงิน (บาท)', '', fmtMoney_(before || total), 'nodata');
  else if (!before && !total) add('ยอดเงิน (บาท)', fmtMoney_(want), '', 'missing');
  else if (before && Math.abs(before - want) < 0.01) add('ยอดเงิน (บาท)', fmtMoney_(want), fmtMoney_(before) + ' (ก่อน VAT)', 'match');
  else if (total && Math.abs(total - want) < 0.01) add('ยอดเงิน (บาท)', fmtMoney_(want), fmtMoney_(total) + ' (ยอดรวม)', 'match');
  else if (total && Math.abs(total - Math.round(want * 107) / 100) < 1) add('ยอดเงิน (บาท)', fmtMoney_(want), fmtMoney_(total) + ' (รวม VAT 7%)', 'match');
  else {
    const got = before || total;
    add('ยอดเงิน (บาท)', fmtMoney_(want), fmtMoney_(got), 'mismatch', 'ต่าง ' + fmtMoney_(got - want) + ' บาท');
  }
  return out;
}

/** admin: ให้ AI อ่านไฟล์แนบ (รูป/PDF) แล้วเทียบกับข้อมูลรายการในชีต */
function apiVerifyAttachment_(token, p) {
  const me = authAdmin_(token);
  if (!me) return forbidden_('ให้ AI ตรวจเอกสาร');
  const t = attachTarget_(p);
  if (t.error) return t.error;
  if (!ATTACH.AI_TYPES.test(t.a.mime)) return { ok: false, code: 'INVALID_VALUE', message: 'AI ตรวจได้เฉพาะรูปภาพ (PNG/JPG/WEBP/GIF) และ PDF' };
  const prov = docProvider_();
  if (!prov) return { ok: false, code: 'AI_NOT_CONFIGURED', message: 'ยังไม่ได้ตั้งค่า API Key — กดปุ่ม 🔑 API Key มุมบนขวา' };
  const d = readRentals_().filter(function (x) { return attKey_(x) === t.a.key; })[0];
  if (!d) return { ok: false, code: 'NOT_FOUND', message: 'ไม่พบรายการค่าเช่าที่ผูกกับไฟล์นี้ในชีตแล้ว' };

  let b64;
  try { b64 = Utilities.base64Encode(DriveApp.getFileById(t.a.fileId).getBlob().getBytes()); } catch (e) {
    return { ok: false, code: 'NOT_FOUND', message: 'ไม่พบไฟล์ใน Google Drive' };
  }
  const r = docCallAI_(prov, t.a.mime, b64);
  let status, result;
  if (!r.ok) {
    status = 'ERROR';
    result = { provider: prov.name, model: prov.model, error: r.error };
  } else if (!r.data || typeof r.data !== 'object') {
    status = 'INVALID';
    result = { provider: prov.name, model: r.model, error: 'AI ไม่ได้ตอบเป็น JSON ตามรูปแบบ' };
  } else {
    const fields = docCompare_(r.data, d);
    const n = function (k) { return fields.filter(function (f) { return f.result === k; }).length; };
    status = n('mismatch') ? 'MISMATCH' : r.data.readable === false || n('match') < 2 ? 'UNCLEAR' : 'MATCH';
    result = { provider: prov.name, model: r.model, free: prov.free, docType: clean_(r.data.docType).slice(0, 40),
               notes: clean_(r.data.notes).slice(0, 300), fields: fields,
               counts: { match: n('match'), mismatch: n('mismatch'), missing: n('missing') } };
  }
  t.sh.getRange(t.row, 12, 1, 3).setValues([[status, JSON.stringify(result), new Date()]]);
  t.sh.getRange(t.row, 14).setNumberFormat('dd/MM/yyyy HH:mm');
  invalidateData_();
  writeLog_(me.email, 'AI_CHECK_DOC', [t.a.contractNo, t.a.vendor, t.a.month].join(' · ') + ' | ' + t.a.name + ' → ' + status +
    (result.counts ? ' (ตรง ' + result.counts.match + ' · ไม่ตรง ' + result.counts.mismatch + ')' : ' ' + (result.error || '')));
  return { ok: true, status: status, result: result, files: attachmentsFor_(t.a.key) };
}
