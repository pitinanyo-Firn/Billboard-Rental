/* ============================================================
   PLAN B — BILLBOARD RENTAL HUB  |  js/aikeys.js
   ปุ่ม 🔑 API Key (admin)
     - วางคีย์ช่องเดียว → ระบบรู้เองว่าเป็น Gemini (AIza…) หรือ Claude (sk-ant-…)
     - "บันทึกและทดสอบ" (หรือกด Enter) → บันทึก → ทดสอบคีย์ทันที → ซิงค์ Dashboard อัตโนมัติ
     - ตัวเลือก AI บันทึกทันทีเมื่อเปลี่ยน (ไม่ต้องกดปุ่ม)
   ช่องคีย์ไม่ใช่ type=password — กัน Chrome เติมรหัสผ่านเข้าระบบลงช่องคีย์เอง (สาเหตุที่บันทึกไม่ได้)
   คีย์ถูกส่งไปเก็บใน Script Properties ฝั่ง backend · หน้าเว็บไม่เคยได้คีย์กลับมา (เห็นแค่ 4 ตัวท้าย)
   ============================================================ */

const AIKeys = {

  s: null,

  init() {
    $('btnAIKeys').addEventListener('click', () => this.openPanel());
  },

  async openPanel() {
    const r = await apiGuarded('getAISettings');
    if (r) this.draw(r);
  },

  clean(k) {
    return String(k || '').trim().replace(/^bearer\s+/i, '').replace(/^["'`]+|["'`]+$/g, '').replace(/\s+/g, '');
  },

  detect(k) {
    return /^AIza/.test(k) ? 'gemini' : /^sk-ant-/.test(k) ? 'claude' : '';
  },

  opt(name, value, list) {
    const label = { auto: 'อัตโนมัติ', gemini: 'Gemini (ฟรี)', claude: 'Claude', off: 'ปิด' };
    return `<select id="ak_${name}" class="st-select ak-auto" data-key="${name}">${list.map(v =>
      `<option value="${v}" ${v === value ? 'selected' : ''}>${label[v]}</option>`).join('')}</select>`;
  },

  keyRow(n, k) {
    return `<div class="ak-row">
      <b>${esc(k.label)}</b>
      ${k.set ? `<span class="badge b-ok">ตั้งค่าแล้ว ${esc(k.hint)}</span>` : '<span class="badge b-off">ยังไม่ได้ตั้ง</span>'}
      <span class="ak-test-res" id="akRes_${n}"></span>
      <div class="spacer"></div>
      ${k.set ? `<button type="button" class="btn btn-ghost btn-sm" data-test="${n}">ทดสอบ</button>
                 <button type="button" class="btn btn-ghost btn-sm" data-clear="${n}">ลบคีย์</button>` : ''}
    </div>`;
  },

  draw(s) {
    this.s = s;
    const c = s.choice;
    $('drawerHost').innerHTML = `
    <div class="drawer-mask" id="drawerMask">
      <div class="drawer">
        <div class="drawer-head">
          <div><h2>🔑 ตั้งค่า API Key และ AI</h2>
            <div class="sub">เก็บใน Script Properties ของ Apps Script (ไม่ขึ้น GitHub) · หน้าเว็บเห็นแค่ 4 ตัวท้าย · บันทึกผู้แก้ไขในชีต Log</div></div>
          <div class="spacer"></div>
          <button class="icon-btn" id="btnCloseDetail" title="ปิด">✕</button>
        </div>
        <div class="drawer-body">
          <div class="card">
            <div class="card-head"><h2>เพิ่ม / เปลี่ยน API Key</h2></div>
            <form id="akForm" autocomplete="off" class="ak-form">
              <div class="ak-input">
                <input id="akKey" name="ak-${Date.now()}" type="text" class="ak-secret" autocomplete="off"
                       autocapitalize="off" spellcheck="false" data-lpignore="true" data-1p-ignore data-form-type="other"
                       placeholder="วาง API Key ที่นี่ (Gemini: AIza… · Claude: sk-ant-…)">
                <button type="button" class="icon-btn" id="akShow" title="แสดง/ซ่อนคีย์">👁</button>
              </div>
              <div class="ak-type"><label>ชนิดคีย์ <select id="akType" class="st-select">
                <option value="">อัตโนมัติ (ดูจากคำขึ้นต้น)</option><option value="gemini">Gemini</option><option value="claude">Claude</option></select></label>
                <span class="ak-detect" id="akDetect">ระบบจะรู้เองว่าเป็นคีย์ Gemini หรือ Claude</span></div>
              <button type="submit" class="btn btn-primary" id="btnAkSave">💾 บันทึกและทดสอบ</button>
            </form>
            <div class="cell-mute" style="margin-top:8px">
              Gemini ฟรี — สร้างที่ <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a>
              (Free Tier: Google อาจนำข้อมูลไปพัฒนาโมเดล) ·
              Claude — <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com</a>
              (มีค่าใช้จ่าย ไม่นำข้อมูลไปเทรน แม่นที่สุดสำหรับตรวจซ้ำ/ตรวจเอกสาร)
            </div>
          </div>

          <div class="card">
            <div class="card-head"><h2>คีย์ที่ตั้งไว้</h2></div>
            ${this.keyRow('gemini', s.keys.gemini)}
            ${this.keyRow('claude', s.keys.claude)}
          </div>

          <div class="card">
            <div class="card-head"><h2>ใช้ AI ตัวไหนทำอะไร</h2><div class="spacer"></div>
              <span class="cell-mute">เปลี่ยนแล้วบันทึกทันที</span></div>
            <div class="ak-grid">
              <label>วิเคราะห์ความเสี่ยงประจำวัน${this.opt('AI_PROVIDER', c.AI_PROVIDER, ['auto', 'gemini', 'claude'])}</label>
              <label>AI ตรวจซ้ำ (ตัวที่ 2)${this.opt('REVIEW_PROVIDER', c.REVIEW_PROVIDER, ['auto', 'gemini', 'claude', 'off'])}</label>
              <label>AI ตรวจเอกสารในไฟล์แนบ${this.opt('DOC_AI_PROVIDER', c.DOC_AI_PROVIDER, ['auto', 'gemini', 'claude'])}</label>
              <label>รุ่น Gemini (วิเคราะห์)<input id="ak_GEMINI_MODEL" class="st-input ak-auto" data-key="GEMINI_MODEL" value="${esc(s.models.GEMINI_MODEL)}"></label>
              <label>รุ่น AI ตรวจซ้ำ (เว้นว่าง = ค่าเริ่มต้น)<input id="ak_REVIEW_MODEL" class="st-input ak-auto" data-key="REVIEW_MODEL" value="${esc(s.models.REVIEW_MODEL)}"></label>
            </div>
            <div class="ak-active">ตอนนี้ใช้จริง — วิเคราะห์: <b>${esc(s.active.insight || 'สรุปตามกฎ (ไม่มีคีย์)')}</b> ·
              ตรวจซ้ำ: <b>${esc(s.active.review || 'ปิด')}</b> · ตรวจเอกสาร: <b>${esc(s.active.doc || 'ปิด')}</b></div>
          </div>
        </div>
      </div>
    </div>`;

    const close = () => { $('drawerHost').innerHTML = ''; };
    $('btnCloseDetail').addEventListener('click', close);
    $('drawerMask').addEventListener('click', e => { if (e.target.id === 'drawerMask') close(); });
    $('akForm').addEventListener('submit', e => { e.preventDefault(); this.saveKey(); });
    $('akKey').addEventListener('input', () => this.showDetect());
    $('akType').addEventListener('change', () => this.showDetect());
    $('akShow').addEventListener('click', () => $('akKey').classList.toggle('ak-secret'));
    document.querySelectorAll('.ak-auto').forEach(el => {
      const ev = el.tagName === 'SELECT' ? 'change' : 'change';
      el.addEventListener(ev, () => this.saveSetting(el.dataset.key, el.value.trim()));
    });
    document.querySelectorAll('[data-clear]').forEach(b => b.addEventListener('click', () => {
      if (confirm(`ลบ API Key ของ ${s.keys[b.dataset.clear].label}? ฟีเจอร์ที่ใช้คีย์นี้จะหยุดใช้ AI`)) this.save({ clear: [b.dataset.clear] }, 'ลบคีย์แล้ว');
    }));
    document.querySelectorAll('[data-test]').forEach(b => b.addEventListener('click', () => this.test(b.dataset.test)));
    setTimeout(() => $('akKey') && $('akKey').focus(), 50);
  },

  showDetect() {
    const k = this.clean($('akKey').value);
    const n = this.detect(k) || $('akType').value;
    const el = $('akDetect');
    el.className = 'ak-detect' + (k && !n ? ' bad' : n ? ' ok' : '');
    el.textContent = !k ? 'ระบบจะรู้เองว่าเป็นคีย์ Gemini หรือ Claude'
      : n === 'gemini' ? '✓ ตรวจพบ: คีย์ Gemini (ฟรี)'
      : n === 'claude' ? '✓ ตรวจพบ: คีย์ Claude'
      : '⚠️ ไม่รู้จักคำขึ้นต้นของคีย์ — เลือก "ชนิดคีย์" ด้านซ้าย (Gemini ปกติขึ้นต้น AIza… · Claude ขึ้นต้น sk-ant-…)';
  },

  /** บันทึกค่าใด ๆ → วาดหน้าใหม่ → ซิงค์ Dashboard เบื้องหลัง */
  async save(body, okMsg) {
    const r = await apiGuarded('saveAISettings', body);
    if (!r) return null;
    if (okMsg) toast(r.changed ? okMsg : 'ไม่มีการเปลี่ยนแปลง');
    if ($('drawerHost').innerHTML) this.draw(r);
    if (Store.data) Store.data.aiOn = !!r.active.insight;
    App.load(false, true);          // ซิงค์อัตโนมัติ (ไม่ปิดหน้าต่างนี้)
    return r;
  },

  async saveKey() {
    const k = this.clean($('akKey').value);
    if (!k) { $('akKey').focus(); return toast('กรุณาวาง API Key ก่อน'); }
    const provider = this.detect(k) || $('akType').value;
    if (!provider) { this.showDetect(); return toast('เลือกชนิดคีย์ (Gemini / Claude) ก่อนบันทึก'); }
    $('btnAkSave').disabled = true;
    $('btnAkSave').textContent = 'กำลังบันทึก…';
    const r = await this.save({ apiKey: k, provider }, '');
    if ($('btnAkSave')) { $('btnAkSave').disabled = false; $('btnAkSave').textContent = '💾 บันทึกและทดสอบ'; }
    if (!r) return;
    toast(`บันทึกคีย์ ${r.keys[r.savedKey].label} แล้ว — กำลังทดสอบ…`);
    this.test(r.savedKey);
  },

  async saveSetting(key, value) {
    await this.save({ [key]: value }, 'บันทึกการตั้งค่าแล้ว');
  },

  async test(n) {
    const out = $('akRes_' + n);
    if (out) { out.className = 'ak-test-res'; out.textContent = 'กำลังทดสอบ…'; }
    const r = await api('testAIKey', { provider: n });
    const el = $('akRes_' + n);
    if (el) {
      el.className = 'ak-test-res ' + (r.ok ? 'ok' : 'bad');
      el.textContent = r.ok ? `✓ ใช้งานได้ · ${r.model}` : `✕ ${r.message || 'ทดสอบไม่สำเร็จ'}`;
    }
    toast(r.ok ? `✓ คีย์ใช้งานได้ · ${r.model}` : (r.message || 'ทดสอบไม่สำเร็จ'));
  }
};
