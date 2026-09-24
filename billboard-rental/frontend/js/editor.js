/* ============================================================
   PLAN B — BILLBOARD RENTAL HUB  |  js/editor.js
   แก้ไขข้อมูลค่าเช่าจากหน้าเว็บ (admin) → เขียนกลับลง Google Sheet
   ส่งเฉพาะช่องที่เปลี่ยน · แก้ในชีตแล้วหน้าเว็บอัปเดตเองผ่าน sync.js
   ============================================================ */

const Editor = {

  isOpen: false,
  rental: null,

  /** [ชื่อกลุ่ม, [[field, label, type], ...]]  type: text | date | number | list:<key> | status */
  SECTIONS: [
    ['การจ่าย', [
      ['payment',     'Payment (รูปแบบการจ่าย)', 'list:payment'],
      ['paymentTerm', 'Payment term',           'text'],
      ['amountMonth', 'Amount/Month (บาท)',      'number'],
      ['amountYear',  'Amount/Year (บาท)',       'number'],
      ['adjust',      'Up or CN [Amount]',       'number'],
      ['month',       'Month (รอบ)',             'text'],
      ['dueDate',     'ว/ด/ป ชำระตามสัญญา',      'date'],
      ['periodStart', 'รอบการจ่าย (เริ่มต้น)',    'date'],
      ['periodEnd',   'รอบการจ่าย (สิ้นสุด)',     'date'],
      ['payStatus',   'Status Payment',          'status']
    ]],
    ['เอกสารเบิกจ่าย', [
      ['docType',    'รูปแบบ (Memo / Invoice)', 'list:docType'],
      ['sentDate',   'วันที่ส่งจัดซื้อ',          'date'],
      ['pr',         'PR',                      'text'],
      ['po',         'PO',                      'text'],
      ['memoInv',    'MEMO/INV No.',            'text'],
      ['docPeriod',  'รอบจ่ายตามเอกสาร',         'text'],
      ['chequeDate', 'เช็คลงวันที่',              'date'],
      ['ecmSent',    'Send ECM',                'date'],
      ['ecmNo',      'ECM No.',                 'text'],
      ['remark',     'Remark',                  'text']
    ]],
    ['สัญญา', [
      ['contractNo',     'Contract No.',       'text'],
      ['company',        'Company',            'list:company'],
      ['rent',           'Rent',               'list:rent'],
      ['vendorNo',       'Vendor No.',         'text'],
      ['vendorName',     'Vendor name',        'list:vendorName'],
      ['mediaType',      'Media Type',         'list:mediaType'],
      ['mediaSite',      'Media Site',         'text'],
      ['epicoreCode',    'Epicore Code',       'text'],
      ['partCode',       'Part Code',          'text'],
      ['partDesc',       'Part Description',   'text'],
      ['startDate',      'Start Contract',     'date'],
      ['endDate',        'End Contract',       'date'],
      ['period',         'Period',             'text'],
      ['contractStatus', 'Status Contract',    'list:contractStatus']
    ]]
  ],

  /** ค่าตั้งต้นในฟอร์ม (string) จากข้อมูล */
  initial(d, field, type) {
    const v = d[field];
    if (type === 'number') return v ? String(v) : '';
    return v == null ? '' : String(v);
  },

  /** รายการตัวเลือก datalist จากข้อมูลที่มีอยู่ */
  listValues(key) {
    const set = new Set();
    (Store.data.rentals || []).forEach(c => { if (c[key]) set.add(c[key]); });
    return [...set].sort();
  },

  /** orig = ค่าเดิมที่ใช้เทียบว่าแก้หรือยัง (ว่าง = บังคับเขียนใหม่ เช่น วันที่ที่รูปแบบในชีตผิด) */
  inputHtml(field, type, value, orig = value) {
    const common = `name="${field}" data-orig="${esc(orig)}"`;
    if (type === 'date')   return `<input type="date" ${common} value="${esc(value)}">`;
    if (type === 'number') return `<input type="number" step="0.01" ${common} value="${esc(value)}">`;
    if (type === 'status') {
      const opts = CONFIG.PAY_STATUSES;
      const extra = value && !opts.includes(value) ? [value] : [];
      return `<select ${common}>
        <option value="">— ไม่ระบุ —</option>
        ${extra.concat(opts).map(o => `<option value="${esc(o)}" ${o === value ? 'selected' : ''}>${esc(o)}${extra.includes(o) ? ' (ค่าเดิม)' : ''}</option>`).join('')}
      </select>`;
    }
    if (type.startsWith('list:')) {
      const key = type.slice(5);
      return `<input type="text" maxlength="300" list="dl-${key}" ${common} value="${esc(value)}">
        <datalist id="dl-${key}">${this.listValues(key).map(v => `<option value="${esc(v)}">`).join('')}</datalist>`;
    }
    return `<input type="text" maxlength="300" ${common} value="${esc(value)}">`;
  },

  open(d) {
    this.rental = d;
    this.isOpen = true;
    const body = document.querySelector('#drawerHost .drawer-body');
    const head = document.querySelector('#drawerHost .drawer-head');
    if (!body) return;
    ['btnEditDetail', 'btnPayDetail'].forEach(id => { const b = $(id); if (b) b.classList.add('hidden'); });

    // ช่องที่มีปัญหาข้อมูล — ไฮไลต์ + แสดงข้อความ
    const issueOf = {};
    d.issues.forEach(i => { issueOf[i.field] = i; });

    body.innerHTML = `
      <form id="editForm" class="edit-form" novalidate>
        <div class="edit-note">แก้แล้วกด <b>บันทึกลง Google Sheet</b> — ระบบเขียนเฉพาะช่องที่เปลี่ยน
          (วันที่เขียนเป็น ว/ด/ป: Start/End Contract เป็น พ.ศ. ช่องอื่นเป็น ค.ศ. ตามรูปแบบเดิมของชีต) และบันทึกประวัติไว้ในชีต Log</div>
        ${this.SECTIONS.map(([title, fields]) => `
          <div class="card">
            <div class="card-head"><h2>${esc(title)}</h2></div>
            <div class="edit-grid">
              ${fields.map(([f, label, type]) => `
                <label class="edit-field" data-field="${f}">
                  <span>${esc(label)}</span>
                  ${this.inputHtml(f, type, this.initial(d, f, type),
                      issueOf[f] && issueOf[f].fix && type === 'date' ? '' : this.initial(d, f, type))}
                  <em class="edit-err">${issueOf[f] ? esc(issueOf[f].msg) : ''}</em>
                </label>`).join('')}
            </div>
          </div>`).join('')}
        <div class="edit-actions">
          <span class="cell-mute" id="editChanged">ยังไม่มีการเปลี่ยนแปลง</span>
          <div class="spacer"></div>
          <button type="button" class="btn btn-ghost" id="btnEditCancel">ยกเลิก</button>
          <button type="submit" class="btn btn-primary" id="btnEditSave">บันทึกลง Google Sheet</button>
        </div>
      </form>`;
    if (head) head.scrollIntoView({ block: 'start' });

    const form = $('editForm');
    form.addEventListener('input', () => this.updateCounter());
    form.addEventListener('change', () => this.updateCounter());
    form.addEventListener('submit', e => { e.preventDefault(); this.save(); });
    this.updateCounter();          // วันที่ที่รูปแบบในชีตผิด นับเป็นช่องที่ต้องบันทึกตั้งแต่เปิดฟอร์ม
    $('btnEditCancel').addEventListener('click', () => {
      if (this.dirty() && !confirm('ยกเลิกการแก้ไข?')) return;
      this.isOpen = false;
      Rentals.openDetail(d.id);
    });
  },

  changes() {
    const out = {};
    const form = $('editForm');
    if (!form) return out;
    form.querySelectorAll('[name]').forEach(el => {
      const v = el.value.replace(/\s+/g, ' ').trim();
      if (v !== (el.dataset.orig || '').trim()) out[el.name] = v;
    });
    return out;
  },

  dirty() {
    return Object.keys(this.changes()).length > 0;
  },

  updateCounter() {
    const n = Object.keys(this.changes()).length;
    $('editChanged').textContent = n ? `แก้ไข ${n} ช่อง` : 'ยังไม่มีการเปลี่ยนแปลง';
    document.querySelectorAll('#editForm .edit-field').forEach(l => {
      const el = l.querySelector('[name]');
      l.classList.toggle('changed', el.value.replace(/\s+/g, ' ').trim() !== (el.dataset.orig || '').trim());
    });
  },

  async save() {
    const fields = this.changes();
    if (!Object.keys(fields).length) return toast('ยังไม่มีการเปลี่ยนแปลง');
    document.querySelectorAll('#editForm .edit-err').forEach(e => { e.textContent = ''; });

    const btn = $('btnEditSave');
    btn.disabled = true;
    btn.textContent = 'กำลังบันทึก…';
    const r = await api('updateRental', { id: this.rental.id, contractNo: this.rental.contractNo, fields });
    btn.disabled = false;
    btn.textContent = 'บันทึกลง Google Sheet';

    if (!r.ok) {
      if (r.code === 'SESSION_EXPIRED') { toast('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่'); setTimeout(() => Auth.logout(), 1200); return; }
      if (r.errors) {
        Object.keys(r.errors).forEach(f => {
          const l = document.querySelector(`#editForm .edit-field[data-field="${f}"] .edit-err`);
          if (l) l.textContent = r.errors[f];
        });
      }
      toast(r.message || 'บันทึกไม่สำเร็จ');
      if (r.code === 'STALE') Sync.soon(300);
      return;
    }

    this.isOpen = false;
    toast(`บันทึกลง Google Sheet แล้ว (${r.changed} ช่อง)`);
    await App.load(false, true);                 // ดึงข้อมูลล่าสุดทั้งระบบ
    Rentals.openDetail(this.rental.id);          // เปิดรายละเอียดใหม่ด้วยค่าที่บันทึกแล้ว
  }
};
