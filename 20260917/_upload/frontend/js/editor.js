/* ============================================================
   PLAN B — CONTRACT RENTAL HUB  |  js/editor.js
   แก้ไขข้อมูลสัญญาจากหน้าเว็บ (admin) → เขียนกลับลง Google Sheet
   ส่งเฉพาะช่องที่เปลี่ยน · แก้ในชีตแล้วหน้าเว็บอัปเดตเองผ่าน sync.js
   ============================================================ */

const Editor = {

  isOpen: false,
  contract: null,

  RESP_OPTIONS: ['บริษัท', 'คู่สัญญา', 'ไม่มี'],

  /** [ชื่อกลุ่ม, [[field, label, type], ...]]  type: text | date | number | percent | list:<key> | resp | renew | doc */
  SECTIONS: [
    ['รายละเอียดสัญญา', [
      ['contractNo',   'เลขที่สัญญา',        'text'],
      ['company',      'บริษัท',             'list:company'],
      ['mediaType',    'Media Type',         'list:mediaType'],
      ['code',         'Code ป้าย',          'text'],
      ['siteCode',     'Asset Code',         'text'],
      ['mediaSite',    'Media Site',         'text'],
      ['province',     'จังหวัด',            'list:province'],
      ['counterparty', 'คู่สัญญา',           'text'],
      ['status',       'Contract Status',    'list:status'],
      ['startDate',    'วันเริ่มต้นสัญญา',   'date'],
      ['endDate',      'วันสิ้นสุดสัญญา',    'date'],
      ['duration',     'ระยะสัญญา',          'text']
    ]],
    ['เงื่อนไขทางการเงิน', [
      ['businessModel',   'Type of Business Model',   'list:businessModel'],
      ['costType',        'Cost Type',                'list:costType'],
      ['paymentTerm',     'เงื่อนไขการชำระค่าเช่า',   'text'],
      ['paymentDue',      'กำหนดชำระ',                'text'],
      ['revShareCompany', '%Rev Share (บริษัท)',      'percent'],
      ['revShareOwner',   '%Rev Share (เจ้าของสื่อ)', 'percent'],
      ['collateralType',  'ประเภทหลักประกันสัญญา',    'list:collateralType'],
      ['collateralValue', 'มูลค่าหลักประกัน (บาท)',   'number']
    ]],
    ['ความรับผิดชอบค่าใช้จ่าย', [
      ['ownerAsset',  'Owner Asset',      'resp'],
      ['opex',        'Opex',             'resp'],
      ['capex',       'Capex',            'resp'],
      ['electricity', 'ค่าไฟฟ้า',         'resp'],
      ['tax1',        'ค่าภาษีประเภท 1',  'resp'],
      ['tax2',        'ค่าภาษีประเภท 2',  'resp'],
      ['tax3',        'ค่าภาษีประเภท 3',  'resp'],
      ['maintenance', 'ค่าซ่อมบำรุง',      'resp'],
      ['insurance',   'ค่าประกันภัย',     'resp']
    ]],
    ['เงื่อนไขการต่อ / สิ้นสุดสัญญา', [
      ['renewCondition',  'เงื่อนไขการต่อสัญญา (แจ้งล่วงหน้า วัน)', 'text'],
      ['noticeDate',      'วันที่ต้องทำหนังสือแจ้งเตือน',          'date'],
      ['endCondition',    'เงื่อนไขสิ้นสุดสัญญา',                  'text'],
      ['removalPeriod',   'ระยะเวลารื้อถอน',                       'text'],
      ['accessCondition', 'เงื่อนไขการเข้าพื้นที่',                'text'],
      ['renewStatus',     'สถานะการต่อสัญญา',                      'renew'],
      ['docStatus',       'สถานะเอกสาร',                           'doc']
    ]]
  ],

  /** ค่าตั้งต้นในฟอร์ม (string) จากข้อมูลสัญญา */
  initial(d, field, type) {
    const v = d[field];
    if (type === 'percent') return (v || v === 0) && (d.revShareCompany || d.revShareOwner) ? String(Math.round(v * 10000) / 100) : '';
    if (type === 'number')  return v ? String(v) : '';
    return v == null ? '' : String(v);
  },

  /** รายการตัวเลือก datalist จากข้อมูลที่มีอยู่ */
  listValues(key) {
    const set = new Set();
    (Store.data.contracts || []).forEach(c => { if (c[key]) set.add(c[key]); });
    return [...set].sort();
  },

  inputHtml(field, type, value) {
    const common = `name="${field}" data-orig="${esc(value)}"`;
    if (type === 'date')    return `<input type="date" ${common} value="${esc(value)}">`;
    if (type === 'number')  return `<input type="number" min="0" step="0.01" ${common} value="${esc(value)}">`;
    if (type === 'percent') return `<input type="number" min="0" max="100" step="0.01" ${common} value="${esc(value)}" placeholder="0–100">`;
    if (type === 'doc')     return `<input type="text" maxlength="${CONFIG.DOC_STATUS_MAX}" ${common} value="${esc(value)}">`;
    if (type === 'resp' || type === 'renew') {
      const opts = type === 'resp' ? this.RESP_OPTIONS : CONFIG.RENEW_STATUSES;
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
    this.contract = d;
    this.isOpen = true;
    const body = document.querySelector('#drawerHost .drawer-body');
    const head = document.querySelector('#drawerHost .drawer-head');
    if (!body) return;
    const btn = $('btnEditDetail'); if (btn) btn.classList.add('hidden');

    body.innerHTML = `
      <form id="editForm" class="edit-form" novalidate>
        <div class="edit-note">แก้แล้วกด <b>บันทึกลง Google Sheet</b> — ระบบเขียนเฉพาะช่องที่เปลี่ยน และบันทึกประวัติไว้ในชีต Log</div>
        ${this.SECTIONS.map(([title, fields]) => `
          <div class="card">
            <div class="card-head"><h2>${esc(title)}</h2></div>
            <div class="edit-grid">
              ${fields.map(([f, label, type]) => `
                <label class="edit-field" data-field="${f}">
                  <span>${esc(label)}</span>
                  ${this.inputHtml(f, type, this.initial(d, f, type))}
                  <em class="edit-err"></em>
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
    $('btnEditCancel').addEventListener('click', () => {
      if (this.dirty() && !confirm('ยกเลิกการแก้ไข?')) return;
      this.isOpen = false;
      Contracts.openDetail(d.id);
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
    const r = await api('updateContract', { id: this.contract.id, contractNo: this.contract.contractNo, fields });
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
    await App.load(false, true);                 // ดึงข้อมูลล่าสุดทั้งระบบ (ตาราง/Dashboard/หนังสือแจ้งเตือน)
    Contracts.openDetail(this.contract.id);      // เปิดรายละเอียดใหม่ด้วยค่าที่บันทึกแล้ว
  }
};
