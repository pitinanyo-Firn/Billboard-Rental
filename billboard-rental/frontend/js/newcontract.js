/* ============================================================
   PLAN B — BILLBOARD RENTAL HUB  |  js/newcontract.js
   แท็บ "New Contract": ฟอร์มสร้างข้อมูลสัญญาใหม่ → ชีต New_Contract (admin) + รายการที่บันทึกแล้ว
     ส่วนที่ 1 ข้อมูลบริษัทและเอกสาร · ส่วนที่ 2 Location / Expense Period (เพิ่มได้หลาย Location)
   ============================================================ */

const NewContract = {

  list: [],
  vendorNoOf: {},     // ผู้ขาย → Vendor No. (เติมให้อัตโนมัติจากข้อมูลเดิม)
  siteInfo: {},       // Media Site → { mediaType, epicoreCode, partCode } (เติมให้อัตโนมัติ)
  seq: 0,

  init() {
    $('ncForm').addEventListener('submit', e => { e.preventDefault(); this.submit(); });
    $('btnNcReset').addEventListener('click', () => { if (confirm('ล้างข้อมูลในฟอร์มทั้งหมด?')) this.reset(); });
    $('btnNcAddLoc').addEventListener('click', () => this.addLocation(true));
    $('ncSupplier').addEventListener('change', () => {
      const no = this.vendorNoOf[$('ncSupplier').value.trim()];
      if (no && !$('ncVendorNo').value) $('ncVendorNo').value = no;
    });
    ['ncStart', 'ncEnd'].forEach(id => $(id).addEventListener('change', () => this.showPeriod()));
    this.addLocation(false);
  },

  /** เรียกหลังโหลดข้อมูลหลัก — เติมตัวเลือก + โหลดรายการ */
  async render() {
    $('ncFormCard').classList.toggle('hidden', !Store.isAdmin());
    const companies = new Set(), suppliers = new Set(), media = new Set(), sites = new Set();
    this.vendorNoOf = {};
    this.siteInfo = {};
    (Store.data.rentals || []).forEach(d => {
      if (d.company) companies.add(d.company);
      if (d.mediaType) media.add(d.mediaType);
      if (d.vendorName) { suppliers.add(d.vendorName); if (d.vendorNo) this.vendorNoOf[d.vendorName] = d.vendorNo; }
      if (d.mediaSite) {
        sites.add(d.mediaSite);
        this.siteInfo[d.mediaSite] = { mediaType: d.mediaType, epicoreCode: d.epicoreCode, partCode: d.partCode };
      }
    });
    const opts = arr => [...arr].sort().map(v => `<option value="${esc(v)}">`).join('');
    $('dlNcCompany').innerHTML = opts(companies);
    $('dlNcSupplier').innerHTML = opts(suppliers);
    $('dlNcMedia').innerHTML = opts(media);
    if (!$('dlNcSite')) $('ncForm').insertAdjacentHTML('beforeend', '<datalist id="dlNcSite"></datalist>');
    $('dlNcSite').innerHTML = opts(sites);
    const r = await api('getNewContracts', {});
    if (r.ok) { this.list = r.list; this.renderList(); }
  },

  /* ---------- ส่วนที่ 2: Location ---------- */
  addLocation(focus) {
    const n = ++this.seq;
    const box = document.createElement('div');
    box.className = 'nc-loc';
    box.dataset.loc = n;
    box.innerHTML = `
      <div class="nc-loc-head"><span class="nc-loc-no"></span><div class="spacer"></div>
        <button type="button" class="icon-btn nc-loc-del" title="ลบ Location นี้">✕</button></div>
      <div class="nc-loc-grid">
        <div class="field"><label>Media Type *</label><input data-f="mediaType" list="dlNcMedia" maxlength="300" placeholder="เช่น Uni Pole"><em class="edit-err" data-lerr="mediaType"></em></div>
        <div class="field"><label>Media Site (สถานที่) *</label><input data-f="mediaSite" list="dlNcSite" maxlength="300" placeholder="ทำเล / ชื่อป้าย"><em class="edit-err" data-lerr="mediaSite"></em></div>
        <div class="field"><label>Epicore Code</label><input data-f="epicoreCode" maxlength="300" placeholder="เช่น A02003-BKK-RCT03"></div>
        <div class="field"><label>Part Code</label><input data-f="partCode" maxlength="300" placeholder="เช่น AM-A02003-0001"></div>
        <div class="field span3"><label>Part Description</label><input data-f="partDesc" maxlength="300" placeholder="เช่น ค่าเช่าพื้นที่โฆษณา Uni Pole : ..."></div>
        <div class="field"><label>ค่าเช่าตามสัญญา (Contractual Rent)</label><input data-f="rent" type="number" min="0" step="0.01" placeholder="0.00"><em class="edit-err" data-lerr="rent"></em></div>
      </div>`;
    $('ncLocations').appendChild(box);
    box.querySelector('.nc-loc-del').addEventListener('click', () => {
      if ($('ncLocations').children.length <= 1) return toast('ต้องมีอย่างน้อย 1 Location');
      box.remove();
      this.renumber();
    });
    const site = box.querySelector('[data-f="mediaSite"]');
    site.addEventListener('change', () => {
      const info = this.siteInfo[site.value.trim()];
      if (!info) return;
      ['mediaType', 'epicoreCode', 'partCode'].forEach(k => {
        const el = box.querySelector(`[data-f="${k}"]`);
        if (!el.value && info[k]) el.value = info[k];
      });
    });
    box.querySelector('[data-f="rent"]').addEventListener('input', () => this.showTotal());
    this.renumber();
    if (focus) box.querySelector('[data-f="mediaType"]').focus();
  },

  renumber() {
    [...$('ncLocations').children].forEach((b, i) => { b.querySelector('.nc-loc-no').textContent = `Location ${i + 1}`; });
    this.showTotal();
  },

  locations() {
    return [...$('ncLocations').children].map(b => {
      const o = {};
      b.querySelectorAll('[data-f]').forEach(el => { o[el.dataset.f] = el.value.trim(); });
      return o;
    });
  },

  showTotal() {
    const locs = this.locations();
    const sum = locs.reduce((s, l) => s + (Number(l.rent) || 0), 0);
    $('ncTotal').textContent = `${locs.length} Location · ค่าเช่าตามสัญญารวม ${fmtMoney(sum) === '-' ? '0.00' : fmtMoney(sum)} บาท`;
  },

  showPeriod() {
    const s = $('ncStart').value, e = $('ncEnd').value;
    if (!s || !e || e < s) { $('ncPeriod').textContent = ''; return; }
    const a = new Date(s), b = new Date(e);
    b.setDate(b.getDate() + 1);
    let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
    if (b.getDate() < a.getDate()) months--;
    $('ncPeriod').textContent = `ระยะสัญญา ${Math.floor(months / 12)} ปี ${months % 12} เดือน`;
  },

  setErrors(errors = {}) {
    document.querySelectorAll('#ncForm [data-err]').forEach(el => { el.textContent = errors[el.dataset.err] || ''; });
    [...$('ncLocations').children].forEach((b, i) => {
      b.querySelectorAll('[data-lerr]').forEach(el => { el.textContent = errors[`loc${i}.${el.dataset.lerr}`] || ''; });
    });
  },

  showError(msg) {
    $('ncError').textContent = msg || '';
    $('ncError').classList.toggle('hidden', !msg);
  },

  reset() {
    $('ncForm').reset();
    $('ncLocations').innerHTML = '';
    this.addLocation(false);
    this.setErrors();
    this.showError('');
    $('ncPeriod').textContent = '';
  },

  async submit(force = false) {
    this.showError('');
    this.setErrors();
    const pay = document.querySelector('input[name="ncPay"]:checked');
    const body = {
      company: $('ncCompany').value, supplier: $('ncSupplier').value, vendorNo: $('ncVendorNo').value,
      pr: $('ncPr').value, po: $('ncPo').value, contractNo: $('ncContractNo').value,
      startDate: $('ncStart').value, endDate: $('ncEnd').value, payment: pay ? pay.value : '',
      locations: this.locations(), force
    };
    const btn = $('btnNcSave');
    btn.disabled = true;
    btn.textContent = 'กำลังบันทึก…';
    const r = await api('addNewContract', body);
    btn.disabled = false;
    btn.textContent = '💾 บันทึกเข้าระบบ';

    if (!r.ok) {
      if (r.code === 'SESSION_EXPIRED') { toast('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่'); setTimeout(() => Auth.logout(), 1200); return; }
      if (r.code === 'DUPLICATE' && confirm(r.message + '?')) return this.submit(true);
      if (r.errors) this.setErrors(r.errors);
      this.showError(r.message || 'บันทึกไม่สำเร็จ');
      return $('ncFormCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    toast(`บันทึกสัญญา ${body.contractNo.trim()} (${body.locations.length} Location) ลง Google Sheet แล้ว`);
    this.list = r.list;
    this.renderList();
    this.reset();
  },

  /* ---------- รายการที่บันทึกแล้ว ---------- */
  renderList() {
    $('ncCount').textContent = `${this.list.length} สัญญา`;
    const tb = $('ncBody');
    if (!this.list.length) {
      tb.innerHTML = '<tr><td colspan="9"><div class="empty">ยังไม่มีสัญญาใหม่</div></td></tr>';
      return;
    }
    const admin = Store.isAdmin();
    tb.innerHTML = this.list.map(c => `
      <tr data-id="${c.id}">
        <td class="cell-mute">${esc(c.timestamp)}<div>${esc(c.by)}</div></td>
        <td class="cell-strong">${esc(c.contractNo)}</td>
        <td>${esc(c.company)}<div class="cell-mute">${esc(c.supplier)}${c.vendorNo ? ' · ' + esc(c.vendorNo) : ''}</div></td>
        <td>${esc(c.pr || '-')}<div class="cell-mute">${esc(c.po || '-')}</div></td>
        <td>${fmtDate(c.startDate)} – ${fmtDate(c.endDate)}<div class="cell-mute">${esc(c.startText)} – ${esc(c.endText)}</div></td>
        <td>${statusBadgePay(c.payment)}</td>
        <td><div class="nc-locs">${c.locations.length ? c.locations.map(l =>
              `<div><b>${esc(l.mediaSite || '-')}</b> <span class="cell-mute">${esc(l.mediaType)}${l.rent ? ' · ' + fmtMoney(l.rent) : ''}</span></div>`).join('')
            : '<span class="cell-mute">-</span>'}</div></td>
        <td class="num cell-strong">${fmtMoney(c.totalRent)}</td>
        <td>${admin ? '<button class="icon-btn nc-del" title="ลบ">🗑</button>' : ''}</td>
      </tr>`).join('');
    tb.querySelectorAll('.nc-del').forEach(b => b.addEventListener('click', async () => {
      const c = this.list.find(x => x.id === b.closest('tr').dataset.id);
      if (!confirm(`ลบสัญญาใหม่ ${c.contractNo} (${c.supplier}) ทั้ง ${c.locations.length || 1} Location?`)) return;
      const r = await apiGuarded('deleteNewContract', { id: c.id, contractNo: c.contractNo, timestamp: c.timestamp });
      if (r) { this.list = r.list; this.renderList(); toast('ลบรายการแล้ว'); }
    }));
  }
};

function statusBadgePay(p) {
  const cls = { 'รายเดือน': 'b-info', 'รายปี': 'b-led', 'ราย 3 เดือน': 'b-warn' }[p] || 'b-off';
  return `<span class="badge ${cls}">${esc(p || '-')}</span>`;
}
