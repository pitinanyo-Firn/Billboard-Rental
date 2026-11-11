/**
 * AISettings.gs — ตั้งค่า API Key / ผู้ให้บริการ AI จากหน้าเว็บ (ปุ่ม 🔑 API Key · เฉพาะ admin)
 *
 * ความปลอดภัย:
 *   - คีย์เก็บใน Script Properties ฝั่ง backend เท่านั้น — หน้าเว็บส่งคีย์มาได้ แต่ไม่เคยได้คีย์กลับไป
 *     (แสดงแค่ 4 ตัวท้าย) · Log บันทึกเฉพาะว่าใครเปลี่ยน + 4 ตัวท้าย
 *   - ช่องว่าง = ไม่เปลี่ยนคีย์เดิม · ลบคีย์ด้วยปุ่มลบ (clear)
 */

const AI_KEYS = {
  gemini: { prop: 'GEMINI_API_KEY',    label: 'Gemini (ฟรี)', test: /^[A-Za-z0-9_\-]{20,200}$/ },
  claude: { prop: 'ANTHROPIC_API_KEY', label: 'Claude',      test: /^[A-Za-z0-9_\-]{20,300}$/ }
};

const AI_CHOICES = {
  AI_PROVIDER:     ['auto', 'gemini', 'claude'],
  REVIEW_PROVIDER: ['auto', 'gemini', 'claude', 'off'],
  DOC_AI_PROVIDER: ['auto', 'gemini', 'claude']
};

function keyHint_(k) { return k ? '••••' + String(k).slice(-4) : ''; }

function aiSettingsView_() {
  const props = PropertiesService.getScriptProperties();
  const keys = {};
  Object.keys(AI_KEYS).forEach(function (n) {
    const v = props.getProperty(AI_KEYS[n].prop) || '';
    keys[n] = { set: !!v, hint: keyHint_(v), label: AI_KEYS[n].label };
  });
  const choice = {};
  Object.keys(AI_CHOICES).forEach(function (k) { choice[k] = props.getProperty(k) || 'auto'; });
  const ins = aiProvider_(), rv = reviewProvider_(), doc = docProvider_();
  return {
    keys: keys, choice: choice,
    models: { GEMINI_MODEL: prop_('GEMINI_MODEL', GEMINI.MODEL), REVIEW_MODEL: props.getProperty('REVIEW_MODEL') || '',
              AI_MODEL: prop_('AI_MODEL', CFG.AI_MODEL) },
    active: {   // ตอนนี้ใช้ตัวไหนจริง (ตามคีย์ที่มี)
      insight: ins ? ins.name : '', review: rv ? rv.name + ' · ' + rv.model : '', doc: doc ? doc.name + ' · ' + doc.model : ''
    }
  };
}

function apiAISettings_(token) {
  const me = authAdmin_(token);
  if (!me) return forbidden_('ดูการตั้งค่า AI');
  return Object.assign({ ok: true }, aiSettingsView_());
}

/**
 * p: { geminiKey?, claudeKey?, clear: ['gemini'|'claude'], AI_PROVIDER?, REVIEW_PROVIDER?, DOC_AI_PROVIDER?,
 *      GEMINI_MODEL?, REVIEW_MODEL? }
 */
function apiSaveAISettings_(token, p) {
  const me = authAdmin_(token);
  if (!me) return forbidden_('ตั้งค่า AI');
  const props = PropertiesService.getScriptProperties();
  const changes = [];

  const clear = Array.isArray(p.clear) ? p.clear : [];
  for (const n in AI_KEYS) {
    const val = String(p[n + 'Key'] || '').trim();
    if (val) {
      if (!AI_KEYS[n].test.test(val)) {
        return { ok: false, code: 'INVALID_VALUE', message: 'รูปแบบ API Key ของ ' + AI_KEYS[n].label + ' ไม่ถูกต้อง (ห้ามมีช่องว่าง)' };
      }
      props.setProperty(AI_KEYS[n].prop, val);
      changes.push(AI_KEYS[n].label + ' = ' + keyHint_(val));
    } else if (clear.indexOf(n) > -1 && props.getProperty(AI_KEYS[n].prop)) {
      props.deleteProperty(AI_KEYS[n].prop);
      changes.push('ลบคีย์ ' + AI_KEYS[n].label);
    }
  }
  Object.keys(AI_CHOICES).forEach(function (k) {
    if (p[k] === undefined) return;
    const v = String(p[k]).toLowerCase();
    if (AI_CHOICES[k].indexOf(v) < 0) return;
    const cur = props.getProperty(k) || 'auto';
    if (v === cur) return;
    if (v === 'auto') props.deleteProperty(k); else props.setProperty(k, v);
    changes.push(k + ' = ' + v);
  });
  ['GEMINI_MODEL', 'REVIEW_MODEL'].forEach(function (k) {
    if (p[k] === undefined) return;
    const v = clean_(p[k]).slice(0, 80);
    if (v && !/^[a-z0-9.\-]+$/i.test(v)) return;
    if ((props.getProperty(k) || '') === v) return;
    if (v) props.setProperty(k, v); else props.deleteProperty(k);
    changes.push(k + ' = ' + (v || '(ค่าเริ่มต้น)'));
  });

  if (changes.length) writeLog_(me.email, 'AI_SETTINGS', changes.join(' · '));
  return Object.assign({ ok: true, changed: changes.length }, aiSettingsView_());
}

/** ทดสอบคีย์: ส่งคำขอสั้น ๆ ไปยังผู้ให้บริการ */
function apiTestAIKey_(token, p) {
  const me = authAdmin_(token);
  if (!me) return forbidden_('ทดสอบ API Key');
  const n = String(p.provider || '');
  if (!AI_KEYS[n]) return { ok: false, code: 'INVALID_VALUE', message: 'ไม่รู้จักผู้ให้บริการ' };
  const key = prop_(AI_KEYS[n].prop, '');
  if (!key) return { ok: false, code: 'AI_NOT_CONFIGURED', message: 'ยังไม่ได้ใส่ API Key ของ ' + AI_KEYS[n].label };
  const t0 = Date.now();
  const text = 'ตอบเป็น JSON {"ok": true} เท่านั้น';
  const r = n === 'gemini'
    ? insightCallGemini_(key, text, 'ตอบเป็น JSON อย่างเดียว')
    : insightCallClaude_(key, text, 'ตอบเป็น JSON อย่างเดียว');
  writeLog_(me.email, 'AI_KEY_TEST', AI_KEYS[n].label + ' ' + keyHint_(key) + ' → ' + (r.ok ? 'OK ' + r.model : r.error));
  if (!r.ok) return { ok: false, code: 'AI_TEST_FAILED', message: AI_KEYS[n].label + ': ' + r.error };
  return { ok: true, provider: n, model: r.model, ms: Date.now() - t0 };
}
