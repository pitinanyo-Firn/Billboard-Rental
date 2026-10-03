/* ============================================================
   PLAN B — BILLBOARD RENTAL HUB  |  js/newcontract.js
   แท็บ "New Contract": ฟอร์มเพิ่มสัญญาใหม่ → ชีต New_Contract (admin) + รายการที่บันทึกแล้ว
   ============================================================ */

const NewContract = {

  list: [],
  vendorNoOf: {},     // Supplier → Vendor No. (เติมให้อัตโนมัติจากข้อมูลเดิม)

  init() {
    $('ncForm').addEventListener('submit', e => { e.preventDefault(); this.submit(); });
    $('btnNcReset').addEventListener('click', () => this.reset());
    $('ncSupplier').addEventListener('change', () => {
      const no = this.vendorNoOf[$('ncSupplier').value.trim()];
      if (no && !$('ncVendorNo').value) $('ncVendorNo').value = no;
    });
    ['ncStart', 'ncEnd'].forEach(id => $(id).addEventListener('change', () => this.showPeriod()));
  },

  /** เรียกหลังโหลดข้อมูลหลัก — เติมตัวเลือก + โหลดรายการ */
  async render() {
    $('ncFormCard').classList.toggle('hidden', !Store.isAdmin());
    const companies = new Set(), suppliers = new Set();
    this.vendorNoOf = {};
    (Store.data.rentals || []).forEach(d => {
      if (d.company) companies.add(d.company);
      if (d.vendorName) { suppliers.add(d.vendorName); if (d.vendorNo) this.vendorNoOf[d.vendorName] = d.vendorNo; }
    });
    $('dlNcCompany').innerHTML = [...companies].sort().map(v => `<option value="${esc(v)}">`).join('');
    $('dlNcSupplier').innerHTML = [...suppliers].sort().map(v => `<option value="${esc(v)}">`).join('');
    const r = await api('getNewContracts', {});
    if (r.ok) { this.list = r.list; this.renderList(); }
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
  },

  showError(msg) {
    $('ncError').textContent = msg || '';
    $('ncError').classList.toggle('hidden', !msg);
  },

  reset() {
    $('ncForm').reset();
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
      startDate: $('ncStart').value, endDate: $('ncEnd').value, payment: pay ? pay.value : '', force
    };
    const btn = $('btnNcSave');
    btn.disabled = true;
    btn.textContent = 'กำลังบันทึก…';
    const r = await api('addNewContract', body);
    btn.disabled = false;
    btn.textContent = '+ บันทึกสัญญาใหม่';

    if (!r.ok) {
      if (r.code === 'SESSION_EXPIRED') { toast('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่'); setTimeout(() => Auth.logout(), 1200); return; }
      if (r.code === 'DUPLICATE' && confirm(r.message + '?')) return this.submit(true);
      if (r.errors) this.setErrors(r.errors);
      return this.showError(r.message || 'บันทึกไม่สำเร็จ');
    }
    toast(`บันทึกสัญญา ${body.contractNo.trim()} ลง Google Sheet แล้ว`);
    this.list = r.list;
    this.renderList();
    this.reset();
  },

  renderList() {
    $('ncCount').textContent = `${this.list.length} รายการ`;
    const tb = $('ncBody');
    if (!this.list.length) {
      tb.innerHTML = '<tr><td colspan="8"><div class="empty">ยังไม่มีสัญญาใหม่</div></td></tr>';
      return;
    }
    const admin = Store.isAdmin();
    tb.innerHTML = this.list.map(c => `
      <tr data-id="${c.id}">
        <td class="cell-mute">${esc(c.timestamp)}<div>${esc(c.by)}</div></td>
        <td class="cell-strong">${esc(c.contractNo)}</td>
        <td>${esc(c.company)}<div class="cell-mute">${esc(c.supplier)}</div></td>
        <td>${esc(c.vendorNo || '-')}</td>
        <td>${esc(c.pr || '-')}<div class="cell-mute">${esc(c.po || '-')}</div></td>
        <td>${fmtDate(c.startDate)} – ${fmtDate(c.endDate)}<div class="cell-mute">${esc(c.startText)} – ${esc(c.endText)}</div></td>
        <td>${statusBadgePay(c.payment)}</td>
        <td>${admin ? '<button class="icon-btn nc-del" title="ลบ">🗑</button>' : ''}</td>
      </tr>`).join('');
    tb.querySelectorAll('.nc-del').forEach(b => b.addEventListener('click', async () => {
      const c = this.list.find(x => x.id === b.closest('tr').dataset.id);
      if (!confirm(`ลบสัญญาใหม่ ${c.contractNo} (${c.supplier})?`)) return;
      const r = await apiGuarded('deleteNewContract', { id: c.id, contractNo: c.contractNo });
      if (r) { this.list = r.list; this.renderList(); toast('ลบรายการแล้ว'); }
    }));
  }
};

function statusBadgePay(p) {
  const cls = { 'รายเดือน': 'b-info', 'รายปี': 'b-led', 'ราย 3 เดือน': 'b-warn' }[p] || 'b-off';
  return `<span class="badge ${cls}">${esc(p || '-')}</span>`;
}
