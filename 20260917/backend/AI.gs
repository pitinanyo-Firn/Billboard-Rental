/**
 * AI.gs — ผู้ช่วย AI ตอบคำถามเกี่ยวกับสัญญา (Claude API)
 *
 * ความปลอดภัย:
 *   - API key อยู่ใน Script Properties (ANTHROPIC_API_KEY) ฝั่ง backend เท่านั้น
 *     frontend บน GitHub ไม่เคยเห็นคีย์ และไม่เคยเห็นข้อมูลสัญญาทั้งก้อน
 *   - ต้องล็อกอินก่อนถึงจะถามได้ ทุกคำถามถูกบันทึกลงชีต Log
 *
 * Apps Script ไม่มี Anthropic SDK จึงเรียก REST API ตรงผ่าน UrlFetchApp
 */

const AI_ENDPOINT = 'https://api.anthropic.com/v1/messages';

const AI_SYSTEM_PROMPT = [
  'คุณคือผู้ช่วยฝ่ายบริหารสัญญาของ Plan B Media ตอบคำถามเกี่ยวกับสัญญาเช่าพื้นที่สื่อโฆษณา',
  'โดยใช้ข้อมูลสัญญาใน JSON ที่แนบมาเท่านั้น',
  '',
  'แนวทาง:',
  '- ตอบเป็นภาษาไทย กระชับ อ้างอิงเลขที่สัญญา (contractNo) และทำเล (mediaSite) ทุกครั้งที่พูดถึงสัญญา',
  '- ถ้าข้อมูลไม่พอหรือไม่มีในชุดข้อมูล ให้บอกตรง ๆ ว่าไม่มีข้อมูล อย่าเดา',
  '- วันที่ในข้อมูลเป็นรูปแบบ yyyy-MM-dd ให้แสดงผลเป็น dd/MM/yyyy (ค.ศ.)',
  '- ใช้ "วันนี้" ตามที่ระบุท้ายข้อความระบบในการนับวัน',
  '- ตอบเป็นข้อความธรรมดา ใช้หัวข้อย่อย (- ) ได้ ไม่ต้องใช้ตาราง Markdown',
  '',
  'ความหมายของฟิลด์ที่คำนวณไว้แล้ว:',
  '- daysToExpire = จำนวนวันจากวันนี้ถึงวันสิ้นสุดสัญญา (ติดลบ = หมดอายุแล้ว)',
  '- noticeDeadline = วันที่ต้องทำหนังสือแจ้งเตือนการต่อสัญญา, daysToNotice = วันคงเหลือถึงวันนั้น',
  '- alert: critical = เลยกำหนดแจ้งต่อสัญญาแล้ว, expired = หมดอายุแล้ว, warning = หมดอายุภายใน ' +
    CFG.ALERT_DAYS + ' วัน, normal = ปกติ, closed = Write Off, unknown = ไม่มีวันสิ้นสุด',
  '- revShareCompany / revShareOwner เป็นสัดส่วน 0-1 (0.4 = 40%)',
  '- ownerAsset, opex, capex, electricity, tax1-3, maintenance, insurance = ฝ่ายที่รับผิดชอบค่าใช้จ่ายนั้น (บริษัท / คู่สัญญา)'
].join('\n');

/** ฟิลด์ที่ส่งให้ AI (ตัด _row / id / noticeSource ที่เป็นข้อมูลภายในระบบออก) */
const AI_FIELDS = [
  'contractNo', 'company', 'mediaType', 'code', 'siteCode', 'mediaSite', 'province',
  'businessModel', 'counterparty', 'status', 'costType', 'startDate', 'endDate', 'duration',
  'collateralType', 'collateralValue', 'ownerAsset', 'opex', 'capex', 'electricity',
  'tax1', 'tax2', 'tax3', 'maintenance', 'insurance', 'paymentTerm', 'paymentDue',
  'revShareCompany', 'revShareOwner', 'renewCondition', 'endCondition', 'removalPeriod',
  'accessCondition', 'renewStatus', 'docStatus',
  'daysToExpire', 'noticeDeadline', 'daysToNotice', 'alert'
];

/** ข้อมูลสัญญาแบบกระชับ (ไม่ส่งฟิลด์ว่าง) — ลำดับคงที่เพื่อให้ prompt cache ใช้ซ้ำได้ */
function contractsForAI_() {
  return JSON.stringify(readContracts_().map(function (d) {
    const o = {};
    AI_FIELDS.forEach(function (f) {
      const v = d[f];
      if (v !== '' && v !== null && v !== undefined) o[f] = v;
    });
    return o;
  }));
}

/** ตรวจ/ตัดประวัติแชทจาก client: role user/assistant สลับกัน เริ่มด้วย user */
function sanitizeHistory_(history) {
  if (!Array.isArray(history)) return [];
  const out = [];
  history.slice(-CFG.AI_MAX_HISTORY).forEach(function (m) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) return;
    const text = String(m.content || '').slice(0, 8000);
    if (!text) return;
    const expected = out.length % 2 === 0 ? 'user' : 'assistant';
    if (m.role === expected) out.push({ role: m.role, content: text });
  });
  if (out.length && out[out.length - 1].role === 'user') out.pop();   // ต้องจบด้วย assistant ก่อนต่อคำถามใหม่
  return out;
}

function apiAskAI_(token, p) {
  const me = auth_(token);

  const apiKey = prop_('ANTHROPIC_API_KEY', '');
  if (!apiKey) {
    return { ok: false, code: 'AI_NOT_CONFIGURED',
             message: 'ยังไม่ได้ตั้งค่า ANTHROPIC_API_KEY ใน Script Properties ของ backend' };
  }

  const question = String(p.question || '').trim();
  if (!question) return { ok: false, code: 'MISSING_FIELD', message: 'กรุณาพิมพ์คำถาม' };
  if (question.length > CFG.AI_MAX_QUESTION) {
    return { ok: false, code: 'TOO_LONG', message: 'คำถามยาวเกิน ' + CFG.AI_MAX_QUESTION + ' ตัวอักษร' };
  }

  const body = {
    model: prop_('AI_MODEL', CFG.AI_MODEL),
    max_tokens: CFG.AI_MAX_TOKENS,
    thinking: { type: 'adaptive' },
    output_config: { effort: CFG.AI_EFFORT },
    fallbacks: 'default',                      // ถ้าโมเดลปฏิเสธคำขอ ให้ API ส่งต่อโมเดลสำรองให้อัตโนมัติ
    system: [
      { type: 'text', text: AI_SYSTEM_PROMPT },
      { type: 'text', text: 'ข้อมูลสัญญาทั้งหมด (JSON):\n' + contractsForAI_(),
        cache_control: { type: 'ephemeral' } },  // cache ส่วนที่ยาวและคงที่ — คำถามถัดไปถูกลง
      { type: 'text', text: 'วันนี้: ' + todayISO_() }   // อยู่หลังจุด cache เพื่อไม่ให้ cache เสีย
    ],
    messages: sanitizeHistory_(p.history).concat([{ role: 'user', content: question }])
  };

  const res = UrlFetchApp.fetch(AI_ENDPOINT, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'server-side-fallback-2026-07-01'
    },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });

  const status = res.getResponseCode();
  let json = {};
  try { json = JSON.parse(res.getContentText()); } catch (e) {}

  if (status !== 200) {
    const detail = (json.error && json.error.message) || ('HTTP ' + status);
    writeLog_(me.email, 'ASK_AI', 'error:' + status + ' ' + detail.slice(0, 150));
    if (status === 401 || status === 403) {
      return { ok: false, code: 'AI_AUTH', message: 'API key ของ Claude ไม่ถูกต้องหรือไม่มีสิทธิ์' };
    }
    if (status === 429 || status === 529 || status >= 500) {
      return { ok: false, code: 'AI_BUSY', message: 'ระบบ AI มีผู้ใช้งานมาก กรุณาลองใหม่อีกครั้ง' };
    }
    return { ok: false, code: 'AI_ERROR', message: 'AI ตอบกลับผิดพลาด: ' + detail };
  }

  if (json.stop_reason === 'refusal') {
    writeLog_(me.email, 'ASK_AI', 'refusal');
    return { ok: false, code: 'AI_REFUSED', message: 'AI ไม่สามารถตอบคำถามนี้ได้ กรุณาปรับคำถามใหม่' };
  }

  let answer = (json.content || [])
    .filter(function (b) { return b.type === 'text'; })
    .map(function (b) { return b.text; })
    .join('')
    .trim();
  if (json.stop_reason === 'max_tokens') answer += '\n\n(คำตอบยาวเกินกำหนด ถูกตัดท้าย — ลองถามให้แคบลง)';
  if (!answer) answer = 'ไม่ได้รับคำตอบจาก AI กรุณาลองใหม่อีกครั้ง';

  const u = json.usage || {};
  writeLog_(me.email, 'ASK_AI', question.slice(0, 200) +
    ' | in:' + (u.input_tokens || 0) + ' cache:' + (u.cache_read_input_tokens || 0) + ' out:' + (u.output_tokens || 0));

  return { ok: true, answer: answer, model: json.model };
}

/** ทดสอบจาก Apps Script Editor: เลือกฟังก์ชันนี้แล้วกด Run ดูผลใน Execution log */
function testAI() {
  const token = Utilities.getUuid();
  CacheService.getScriptCache().put('tk_' + token, JSON.stringify({ email: 'editor-test', role: 'admin' }), 60);
  Logger.log(JSON.stringify(apiAskAI_(token, { question: 'มีสัญญากี่ฉบับที่จะหมดอายุภายในสิ้นปีนี้ มีอะไรบ้าง' }), null, 2));
}
