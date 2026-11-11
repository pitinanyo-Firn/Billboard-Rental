/* ============================================================
   PLAN B — BILLBOARD RENTAL HUB  |  js/attach.js
   ไฟล์แนบรายรายการ (ในหน้ารายละเอียด) + AI ตรวจเอกสารเทียบข้อมูล
     ดู / ดาวน์โหลด: ทุกคน · เพิ่ม / ลบ / AI ตรวจ: admin
     เรียลไทม์: ไฟล์ใหม่จากเครื่องอื่นขึ้นเองผ่าน Sync (App.load → Attach.refresh)
   ============================================================ */

const Attach = {

  MAX: 10 * 1024 * 1024,
  ACCEPT: 'image/png,image/jpeg,image/webp,image/gif,application/pdf,.xlsx,.xls,.docx,.doc,.csv,.txt',
  AI_TYPES: /^(image\/(png|jpeg|webp|gif)|application\/pdf)$/,
  rentalId: null,
  files: [],
  docAI: null,
  open: {},            // ไฟล์ที่กางผล AI ไว้

  /** key ของรายการ — ต้องตรงกับ attKey_() ใน backend/Attach.gs */
  keyOf(d) {
    const clean = v => { const s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); return ['-', '–', 'N/A'].includes(s) ? '' : s; };
    return [d.contractNo, d.vendorNo || d.vendorName, d.mediaSite, d.month].map(s => clean(s).toLowerCase()).join('|');
  },

  countOf(d) { return ((Store.data && Store.data.attachCounts) || {})[this.keyOf(d)] || 0; },

  /** วางการ์ดไฟล์แนบลงใน drawer ของรายการ */
  async mount(d) {
    this.rentalId = d.id;
    this.files = [];
    this.open = {};
    $('attBox').innerHTML = '<div class="cell-mute">กำลังโหลดไฟล์แนบ…</div>';
    await this.load(true);
  },

  async load(silent) {
    if (!this.rentalId || !$('attBox')) return;
    const id = this.rentalId;
    const r = await api('getAttachments', { id });
    if (id !== this.rentalId || !$('attBox')) return;           // เปลี่ยนรายการไปแล้ว
    if (!r.ok) { if (!silent) toast(r.message || 'โหลดไฟล์แนบไม่สำเร็จ'); return; }
    this.files = r.files;
    this.docAI = r.docAI;
    this.render();
  },

  /** เรียกหลังข้อมูลรอบใหม่ (Sync) — ถ้า drawer ของรายการยังเปิดอยู่ ให้ดึงรายการไฟล์ใหม่ */
  refresh() {
    if (this.rentalId && $('attBox')) this.load(true);
    else this.rentalId = null;
  },

  icon(m) {
    return m.startsWith('image/') ? '🖼️' : m === 'application/pdf' ? '📕'
      : /sheet|excel|csv/.test(m) ? '📊' : /word/.test(m) ? '📝' : '📄';
  },

  size(n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; },

  STATUS: {
    MATCH:    ['b-ok',   '✓ ข้อมูลตรงกับเอกสาร'],
    MISMATCH: ['b-crit', '✕ พบข้อมูลไม่ตรง'],
    UNCLEAR:  ['b-warn', '? ข้อมูลในเอกสารไม่พอ'],
    INVALID:  ['b-warn', 'AI ตอบผิดรูปแบบ'],
    ERROR:    ['b-warn', 'AI ตรวจไม่สำเร็จ']
  },
  RESULT: { match: ['ok', 'ตรง'], mismatch: ['bad', 'ไม่ตรง'], missing: ['mute', 'ไม่พบในเอกสาร'], nodata: ['mute', 'ไม่มีในชีต'] },

  render() {
    const admin = Store.isAdmin();
    const ai = this.docAI;
    $('attBox').innerHTML = `
      ${admin ? `<div class="att-bar">
        <label class="btn btn-ghost btn-sm att-pick">📎 เพิ่มไฟล์<input type="file" id="attInput" multiple accept="${this.ACCEPT}"></label>
        <span class="cell-mute" id="attProg">รูปภาพ / PDF / Excel / Word ไม่เกิน 10 MB ต่อไฟล์</span>
        <div class="spacer"></div>
        <span class="cell-mute">${ai ? `AI ตรวจเอกสาร: ${esc(ai.name === 'gemini' ? 'Gemini' : 'Claude')} ${esc(ai.model)}` : 'ยังไม่ได้ตั้ง API Key สำหรับ AI ตรวจเอกสาร'}</span>
      </div>
      ${ai && ai.free ? '<div class="att-warn">⚠️ ใช้ Gemini Free Tier — Google อาจนำเนื้อหาเอกสารไปพัฒนาโมเดล · ใส่ Claude API Key เพื่อใช้ Claude ตรวจเอกสารแทน</div>' : ''}` : ''}
      ${this.files.length ? `<ul class="att-list">${this.files.map(f => this.item(f, admin)).join('')}</ul>`
        : '<div class="empty">ยังไม่มีไฟล์แนบ</div>'}`;

    if ($('attInput')) $('attInput').addEventListener('change', e => this.upload([...e.target.files]));
    $('attBox').querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => this.act(b.dataset.act, b.dataset.fid)));
  },

  item(f, admin) {
    const st = this.STATUS[f.aiStatus];
    const canAI = admin && this.AI_TYPES.test(f.mime);
    return `<li class="att-item">
      <div class="att-row">
        <span class="att-ico">${this.icon(f.mime)}</span>
        <div class="att-meta"><b>${esc(f.name)}</b>
          <div class="cell-mute">${this.size(f.size)} · ${esc(f.ts)} · ${esc(f.by)}</div></div>
        ${st ? `<button type="button" class="badge ${st[0]} att-st" data-act="toggle" data-fid="${f.id}" title="ดูผลการตรวจ">${st[1]}</button>` : ''}
        <div class="att-acts">
          <button type="button" class="icon-btn" data-act="view" data-fid="${f.id}" title="เปิดดู">👁</button>
          <button type="button" class="icon-btn" data-act="download" data-fid="${f.id}" title="ดาวน์โหลด">⬇</button>
          ${canAI ? `<button type="button" class="btn btn-ghost btn-sm" data-act="verify" data-fid="${f.id}" title="ให้ AI อ่านเอกสารแล้วเทียบกับข้อมูลรายการนี้">✦ AI ตรวจ</button>` : ''}
          ${admin ? `<button type="button" class="icon-btn" data-act="delete" data-fid="${f.id}" title="ลบไฟล์ (ย้ายไปถังขยะ Drive)">🗑</button>` : ''}
        </div>
      </div>
      ${f.ai && this.open[f.id] ? this.result(f) : ''}
    </li>`;
  },

  result(f) {
    const a = f.ai;
    if (!a.fields) return `<div class="att-ai"><div class="cell-mute">${esc(a.error || 'ไม่มีผล')}</div></div>`;
    return `<div class="att-ai">
      <div class="cell-mute">${esc(a.docType || 'เอกสาร')} · อ่านโดย ${esc(a.model)} · ตรวจเมื่อ ${esc(f.aiTs)} ·
        ตรง ${a.counts.match} · ไม่ตรง ${a.counts.mismatch} · ไม่พบในเอกสาร ${a.counts.missing}</div>
      <table class="compact att-cmp">
        <thead><tr><th>ช่อง</th><th>ข้อมูลในระบบ</th><th>ในเอกสาร</th><th>ผล</th></tr></thead>
        <tbody>${a.fields.map(x => { const r = this.RESULT[x.result] || ['mute', x.result]; return `<tr class="att-${r[0]}">
          <td>${esc(x.label)}</td><td>${esc(x.data)}</td><td>${esc(x.doc)}</td>
          <td><span class="att-res att-res-${r[0]}">${r[1]}</span>${x.note ? `<div class="cell-mute">${esc(x.note)}</div>` : ''}</td></tr>`; }).join('')}</tbody>
      </table>
      ${a.notes ? `<div class="cell-mute">ข้อสังเกตจาก AI: ${esc(a.notes)}</div>` : ''}
      <div class="cell-mute">AI อ่านเอกสาร — ระบบเป็นผู้เทียบข้อมูลทีละช่อง · ตรวจกับเอกสารจริงก่อนตัดสินใจ</div>
    </div>`;
  },

  find(fid) { return this.files.find(f => f.id === fid); },

  async act(act, fid) {
    const f = this.find(fid);
    if (!f) return;
    if (act === 'toggle') { this.open[fid] = !this.open[fid]; return this.render(); }
    if (act === 'view' || act === 'download') return this.fetchFile(f, act);
    if (act === 'delete') {
      if (!confirm(`ลบไฟล์ "${f.name}"?\nไฟล์จะถูกย้ายไปถังขยะของ Google Drive (กู้คืนได้ภายใน 30 วัน)`)) return;
      const r = await apiGuarded('deleteAttachment', { fid: f.id, fileId: f.fileId });
      if (!r) return;
      this.files = r.files;
      this.render();
      toast('ลบไฟล์แล้ว');
      Sync.soon();
    }
    if (act === 'verify') {
      const r = await apiGuarded('verifyAttachment', { fid: f.id, fileId: f.fileId });
      if (!r) return;
      this.files = r.files;
      const nf = this.files.find(x => x.fileId === f.fileId);
      if (nf) this.open[nf.id] = true;
      this.render();
      toast((this.STATUS[r.status] || ['', 'ตรวจเสร็จ'])[1]);
    }
  },

  async fetchFile(f, mode) {
    const r = await apiGuarded('getAttachment', { fid: f.id, fileId: f.fileId });
    if (!r) return;
    const bin = atob(r.data);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([buf], { type: r.mime }));
    if (mode === 'download' || !(r.mime.startsWith('image/') || r.mime === 'application/pdf')) {
      const a = document.createElement('a');
      a.href = url; a.download = r.name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      return;
    }
    const box = document.createElement('div');
    box.className = 'att-viewer';
    box.innerHTML = `<div class="att-viewer-bar"><b>${esc(r.name)}</b><div class="spacer"></div>
        <a class="btn btn-ghost btn-sm" href="${url}" download="${esc(r.name)}">⬇ ดาวน์โหลด</a>
        <button type="button" class="icon-btn" title="ปิด">✕</button></div>
      <div class="att-viewer-body">${r.mime === 'application/pdf'
        ? `<iframe src="${url}" title="${esc(r.name)}"></iframe>` : `<img src="${url}" alt="${esc(r.name)}">`}</div>`;
    const close = () => { box.remove(); URL.revokeObjectURL(url); };
    box.querySelector('.icon-btn').addEventListener('click', close);
    box.addEventListener('click', e => { if (e.target === box) close(); });
    document.body.appendChild(box);
  },

  readB64(file) {
    return new Promise((ok, bad) => {
      const fr = new FileReader();
      fr.onload = () => ok(String(fr.result).split(',')[1] || '');
      fr.onerror = () => bad(fr.error);
      fr.readAsDataURL(file);
    });
  },

  mimeOf(file) {
    if (file.type) return file.type;
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    return { pdf: 'application/pdf', csv: 'text/csv', txt: 'text/plain', xls: 'application/vnd.ms-excel', doc: 'application/msword',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }[ext] || '';
  },

  async upload(list) {
    if (!list.length) return;
    const id = this.rentalId;
    let done = 0;
    for (const file of list) {
      if (file.size > this.MAX) { toast(`"${file.name}" ใหญ่เกิน 10 MB`); continue; }
      $('attProg').textContent = `กำลังอัปโหลด ${done + 1}/${list.length}: ${file.name}…`;
      const opId = (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random()).toString();
      const r = await apiGuarded('uploadAttachment', { id, name: file.name, mime: this.mimeOf(file), data: await this.readB64(file), opId }, true);
      if (!r) continue;
      done++;
      if (id === this.rentalId) { this.files = r.files; this.render(); }
    }
    if (done) { toast(`แนบไฟล์แล้ว ${done} ไฟล์`); Sync.soon(); }
    if ($('attProg')) $('attProg').textContent = 'รูปภาพ / PDF / Excel / Word ไม่เกิน 10 MB ต่อไฟล์';
  }
};
