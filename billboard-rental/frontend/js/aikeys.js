/* ============================================================
   PLAN B — BILLBOARD RENTAL HUB  |  js/aikeys.js
   ปุ่ม 🔑 API Key (admin) — ใส่/ลบ/ทดสอบคีย์ AI และเลือกผู้ให้บริการ
   คีย์ถูกส่งไปเก็บใน Script Properties ฝั่ง backend · หน้าเว็บไม่เคยได้คีย์กลับมา (เห็นแค่ 4 ตัวท้าย)
   ============================================================ */

const AIKeys = {

  init() {
    $('btnAIKeys').addEventListener('click', () => this.openPanel());
  },

  async openPanel() {
    const r = await apiGuarded('getAISettings');
    if (r) this.draw(r);
  },

  opt(name, value, list) {
    const label = { auto: 'อัตโนมัติ', gemini: 'Gemini (ฟรี)', claude: 'Claude', off: 'ปิด' };
    return `<select id="ak_${name}" class="st-select">${list.map(v =>
      `<option value="${v}" ${v === value ? 'selected' : ''}>${label[v]}</option>`).join('')}</select>`;
  },

  keyField(n, k, link) {
    return `<div class="ak-key">
      <div class="ak-key-head"><b>${esc(k.label)} API Key</b>
        ${k.set ? `<span class="badge b-ok">ตั้งค่าแล้ว ${esc(k.hint)}</span>` : '<span class="badge b-off">ยังไม่ได้ตั้ง</span>'}
        <div class="spacer"></div>
        ${k.set ? `<button type="button" class="btn btn-ghost btn-sm" data-test="${n}">ทดสอบ</button>
                   <button type="button" class="btn btn-ghost btn-sm" data-clear="${n}">ลบคีย์</button>` : ''}
      </div>
      <input id="ak_${n}Key" type="password" autocomplete="off" spellcheck="false"
             placeholder="${k.set ? 'เว้นว่าง = ใช้คีย์เดิม · วางคีย์ใหม่เพื่อเปลี่ยน' : 'วาง API Key ที่นี่'}">
      <div class="cell-mute">${link}</div>
    </div>`;
  },

  draw(s) {
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
            <div class="card-head"><h2>API Key</h2></div>
            ${this.keyField('gemini', s.keys.gemini, 'ฟรี — สร้างที่ <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> · Free Tier: Google อาจนำข้อมูลไปพัฒนาโมเดล (ระบบปิดชื่อคู่ค้าก่อนส่งในการวิเคราะห์ประจำวัน)')}
            ${this.keyField('claude', s.keys.claude, 'มีค่าใช้จ่าย — สร้างที่ <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com</a> · ไม่นำข้อมูลไปเทรน · ใช้ตรวจซ้ำและตรวจเอกสารได้แม่นที่สุด')}
          </div>
          <div class="card">
            <div class="card-head"><h2>ใช้ AI ตัวไหนทำอะไร</h2></div>
            <div class="ak-grid">
              <label>วิเคราะห์ความเสี่ยงประจำวัน${this.opt('AI_PROVIDER', c.AI_PROVIDER, ['auto', 'gemini', 'claude'])}</label>
              <label>AI ตรวจซ้ำ (ตัวที่ 2)${this.opt('REVIEW_PROVIDER', c.REVIEW_PROVIDER, ['auto', 'gemini', 'claude', 'off'])}</label>
              <label>AI ตรวจเอกสารในไฟล์แนบ${this.opt('DOC_AI_PROVIDER', c.DOC_AI_PROVIDER, ['auto', 'gemini', 'claude'])}</label>
              <label>รุ่น Gemini (วิเคราะห์)<input id="ak_GEMINI_MODEL" class="st-input" value="${esc(s.models.GEMINI_MODEL)}"></label>
              <label>รุ่น AI ตรวจซ้ำ (เว้นว่าง = ค่าเริ่มต้น)<input id="ak_REVIEW_MODEL" class="st-input" value="${esc(s.models.REVIEW_MODEL)}"></label>
            </div>
            <div class="cell-mute" style="margin-top:8px">อัตโนมัติ: วิเคราะห์ใช้ Gemini ก่อน · ตรวจซ้ำและตรวจเอกสารใช้ Claude ถ้ามีคีย์ ไม่งั้นใช้ Gemini</div>
            <div class="ak-active">ตอนนี้ใช้จริง — วิเคราะห์: <b>${esc(s.active.insight || 'สรุปตามกฎ (ไม่มีคีย์)')}</b> ·
              ตรวจซ้ำ: <b>${esc(s.active.review || 'ปิด')}</b> · ตรวจเอกสาร: <b>${esc(s.active.doc || 'ปิด')}</b></div>
            <div class="edit-actions">
              <div class="spacer"></div>
              <button type="button" class="btn btn-ghost" id="btnAkCancel">ปิด</button>
              <button type="button" class="btn btn-primary" id="btnAkSave" style="width:auto;padding:12px 28px">💾 บันทึก</button>
            </div>
          </div>
        </div>
      </div>
    </div>`;
    const close = () => { $('drawerHost').innerHTML = ''; };
    $('btnCloseDetail').addEventListener('click', close);
    $('btnAkCancel').addEventListener('click', close);
    $('drawerMask').addEventListener('click', e => { if (e.target.id === 'drawerMask') close(); });
    $('btnAkSave').addEventListener('click', () => this.save([]));
    document.querySelectorAll('[data-clear]').forEach(b => b.addEventListener('click', () => {
      if (confirm(`ลบ API Key ของ ${s.keys[b.dataset.clear].label}? ฟีเจอร์ที่ใช้คีย์นี้จะหยุดใช้ AI`)) this.save([b.dataset.clear]);
    }));
    document.querySelectorAll('[data-test]').forEach(b => b.addEventListener('click', () => this.test(b.dataset.test, b)));
  },

  async save(clear) {
    const v = id => $('ak_' + id).value.trim();
    const body = { clear, geminiKey: v('geminiKey'), claudeKey: v('claudeKey'),
      AI_PROVIDER: v('AI_PROVIDER'), REVIEW_PROVIDER: v('REVIEW_PROVIDER'), DOC_AI_PROVIDER: v('DOC_AI_PROVIDER'),
      GEMINI_MODEL: v('GEMINI_MODEL'), REVIEW_MODEL: v('REVIEW_MODEL') };
    $('btnAkSave').disabled = true;
    const r = await apiGuarded('saveAISettings', body);
    if (!r) { if ($('btnAkSave')) $('btnAkSave').disabled = false; return; }
    toast(r.changed ? 'บันทึกการตั้งค่า AI แล้ว' : 'ไม่มีการเปลี่ยนแปลง');
    this.draw(r);
    Store.data && (Store.data.aiOn = !!r.active.insight);
  },

  async test(n, btn) {
    btn.disabled = true;
    btn.textContent = 'กำลังทดสอบ…';
    const r = await api('testAIKey', { provider: n });
    btn.disabled = false;
    btn.textContent = 'ทดสอบ';
    toast(r.ok ? `✓ ใช้งานได้ · ${r.model} · ${r.ms} ms` : (r.message || 'ทดสอบไม่สำเร็จ'));
  }
};
