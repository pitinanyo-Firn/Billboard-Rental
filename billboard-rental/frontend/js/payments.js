/* ============================================================
   PLAN B — BILLBOARD RENTAL HUB  |  js/payments.js
   บันทึกการเบิกจ่าย (Payment_History) · ติดตามใบเสร็จ (Receipt_Tracking)
   รายการค่าเช่า = ทุกแถวใน Contract_Master (1 แถว = 1 รอบเดือน)
     กรอง Vendor / Media Site → ค้นหา (Vendor, Site, PR, PO, เลขสัญญา) เลือกรายการ
     → 🔍 ตรวจสอบรายละเอียด → บันทึกการเบิกจ่าย
   ============================================================ */

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const Payments = {

  selected: null,     // รายการค่าเช่าที่เลือกในฟอร์ม

  init() {
    $('payForm').addEventListener('submit', e => { e.preventDefault(); this.submit(); });
    $('pRental').addEventListener('change', () => this.pick($('pRental').value));
    $('pRental').addEventListener('input', () => this.pick($('pRental').value));
    $('pfVendor').addEventListener('change', () => { this.renderFilters(); this.refilter(); });
    $('pfSite').addEventListener('change', () => this.refilter());
    $('btnPayCheck').addEventListener('click', () => this.checkDetail());
    $('fReceipt').addEventListener('change', () => this.renderReceipts());
  },

  /** 'Oct-26' → '2026-10' (ใช้ dueDate ถ้าคอลัมน์ Month ว่าง/อ่านไม่ได้) */
  ymOf(d) {
    const m = String(d.month || '').trim().match(/^([A-Za-z]{3})[-\s/]?(\d{2}|\d{4})$/);
    if (m) {
      const i = MONTHS_EN.findIndex(x => x.toLowerCase() === m[1].toLowerCase());
      if (i >= 0) return `${m[2].length === 2 ? '20' + m[2] : m[2]}-${String(i + 1).padStart(2, '0')}`;
    }
    return /^\d{4}-\d{2}/.test(d.dueDate || '') ? d.dueDate.slice(0, 7) : '';
  },

  ymLabel(ym) {
    return ym ? `${MONTHS_EN[+ym.slice(5, 7) - 1]}-${ym.slice(2, 4)}` : '';
  },

  /** ข้อความในช่องค้นหา — ใส่ PR / PO ไว้ด้วยเพื่อให้พิมพ์ค้นหาได้ */
  label(d) {
    return [d.vendorName, d.mediaSite, d.contractNo || '-', this.ymLabel(this.ymOf(d)) || d.month || '-',
            d.pr ? 'PR ' + d.pr : '', d.po ? 'PO ' + d.po : ''].filter(Boolean).join(' · ') + ` [${d.id}]`;
  },

  render() {
    $('payFormCard').classList.toggle('hidden', !Store.isAdmin());
    this.renderFilters();
    this.refilter();

    const st = $('fReceipt');
    const keep = st.value;
    st.innerHTML = '<option value="">ทุกสถานะ</option>' +
      Store.data.receiptStatuses.map(s => `<option>${esc(s)}</option>`).join('');
    if (keep) st.value = keep;

    this.renderReceipts();
    this.renderPayments();
  },

  /* ---------- ตัวกรองรายการค่าเช่า ---------- */
  renderFilters() {
    const rows = Store.data.rentals;
    const fill = (sel, first, opts) => {
      const keep = sel.value;
      sel.innerHTML = `<option value="">${first}</option>` + opts.map(o => `<option value="${esc(o.v)}">${esc(o.t)}</option>`).join('');
      if (opts.some(o => o.v === keep)) sel.value = keep;
    };
    const vendors = [...new Set(rows.map(d => d.vendorName).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'th'));
    fill($('pfVendor'), '-- กรองผู้ขายทั้งหมด (Vendor) --', vendors.map(v => ({ v, t: v })));
    // Media Site — แสดงเฉพาะ Site ของ Vendor ที่เลือก (ถ้าเลือก)
    const v = $('pfVendor').value;
    const sites = [...new Set(rows.filter(d => !v || d.vendorName === v).map(d => d.mediaSite).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'th'));
    fill($('pfSite'), '-- กรอง Media Site ทั้งหมด --', sites.map(s => ({ v: s, t: s })));
  },

  filtered() {
    const v = $('pfVendor').value, s = $('pfSite').value;
    return Store.data.rentals
      .filter(d => (!v || d.vendorName === v) && (!s || d.mediaSite === s))
      .sort((a, b) => (this.ymOf(a) || '9').localeCompare(this.ymOf(b) || '9') ||
                      a.vendorName.localeCompare(b.vendorName, 'th') || a._row - b._row);
  },

  /** สร้างรายการให้ช่องค้นหาตามตัวกรอง — เหลือรายการเดียวจะเลือกให้อัตโนมัติ */
  refilter() {
    const rows = this.filtered();
    $('dlRentals').innerHTML = rows.map(d => `<option value="${esc(this.label(d))}">`).join('');
    if (this.selected && !rows.includes(this.selected)) {
      $('pRental').value = '';
      this.pick('');
    }
    if (rows.length === 1 && !this.selected) {
      $('pRental').value = this.label(rows[0]);
      this.pick($('pRental').value);
    }
    this.renderHint();
  },

  renderHint() {
    const d = this.selected;
    const n = this.filtered().length;
    $('pfHint').innerHTML = d
      ? `✓ เลือกแล้ว: <b>${esc(d.vendorName)}</b> · ${esc(d.mediaSite)} · ${esc(d.contractNo || '-')} · รอบ ${esc(this.ymLabel(this.ymOf(d)) || d.month || '-')}
         · ${statusBadge(d.payStatus)} — กด 🔍 ตรวจสอบรายละเอียด ก่อนบันทึก`
      : `<span class="pay-count">${fmtNum(n)} รายการ</span>พิมพ์หรือคลิกช่องค้นหาเพื่อเลือกรายการ`;
  },

  /** เลือกรายการจาก datalist ("... [R12]") */
  pick(text) {
    const m = String(text).match(/\[(R\d+)\]\s*$/);
    const prev = this.selected;
    this.selected = m ? Store.data.rentals.find(d => d.id === m[1]) || null : null;
    const d = this.selected;
    $('pExpected').value = d ? fmtMoney(d.installment) : '';
    if (d && d !== prev) {
      $('pActual').value = d.installment || '';
      const ym = this.ymOf(d);
      if (ym) $('pMonth').value = ym;
    }
    this.renderHint();
  },

  /** เปิดฟอร์มพร้อมเลือกรายการ (จากปุ่ม 💸 บันทึกจ่าย ในหน้ารายละเอียด) */
  prefill(id) {
    const d = Store.data.rentals.find(x => x.id === id);
    if (!d) return;
    App.switchTab('payments');
    $('pfVendor').value = '';
    this.renderFilters();
    $('pfSite').value = '';
    this.refilter();
    $('pRental').value = this.label(d);
    this.pick($('pRental').value);
    $('payFormCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  /** 🔍 ตรวจสอบรายละเอียด — เปิดข้อมูลทั้งหมดของแถวที่เลือก */
  checkDetail() {
    this.showError('');
    if (!this.selected) return this.showError('กรุณาเลือกรายการค่าเช่าก่อน แล้วจึงกดตรวจสอบรายละเอียด');
    Rentals.openDetail(this.selected.id);
  },

  showError(msg) {
    $('payError').textContent = msg;
    $('payError').classList.toggle('hidden', !msg);
  },

  async submit(force = false) {
    this.showError('');
    const d = this.selected;
    if (!d) return this.showError('กรุณาเลือกรายการค่าเช่าจากรายการที่แนะนำ');
    if (!$('pMonth').value) return this.showError('กรุณาเลือกรอบดิว');
    if (!(Number($('pActual').value) > 0)) return this.showError('กรุณากรอกยอดที่จ่ายจริง');

    const btn = $('btnPay');
    btn.disabled = true;
    btn.textContent = 'กำลังบันทึก…';
    const r = await api('recordPayment', {
      id: d.id, contractNo: d.contractNo, month: $('pMonth').value,
      actual: $('pActual').value, remark: $('pRemark').value, markPaid: $('pMarkPaid').checked, force
    });
    btn.disabled = false;
    btn.textContent = 'บันทึกการเบิกจ่าย';

    if (!r.ok) {
      if (r.code === 'SESSION_EXPIRED') { toast('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่'); setTimeout(() => Auth.logout(), 1200); return; }
      if (r.code === 'DUPLICATE' && confirm(r.message + '?')) return this.submit(true);
      return this.showError(r.message || 'บันทึกไม่สำเร็จ');
    }
    toast(`บันทึกการเบิกจ่ายรอบ ${r.month} แล้ว`);
    $('payForm').reset();
    this.selected = null;
    await App.load(false, true);
  },

  /* ---------- ติดตามใบเสร็จ ---------- */
  renderReceipts() {
    const f = $('fReceipt').value;
    const rows = Store.data.receipts.filter(r => !f || r.status === f);
    const tb = $('receiptBody');
    if (!rows.length) {
      tb.innerHTML = '<tr><td colspan="6"><div class="empty">ไม่มีรายการ</div></td></tr>';
      return;
    }
    const admin = Store.isAdmin();
    const statuses = Store.data.receiptStatuses;
    tb.innerHTML = rows.map(r => `
      <tr data-id="${r.id}">
        <td>${esc(r.timestamp)}</td>
        <td class="cell-strong">${esc(r.vendor)}</td>
        <td>${esc(r.site)}</td>
        <td class="num">${fmtMoney(r.amount)}</td>
        <td>${admin
          ? `<select class="st-select rc-status">${statuses.map(s => `<option ${s === r.status ? 'selected' : ''}>${esc(s)}</option>`).join('')}
               ${statuses.includes(r.status) ? '' : `<option selected>${esc(r.status)}</option>`}</select>`
          : esc(r.status)}</td>
        <td>${admin ? '<div class="rc-actions"><button class="icon-btn rc-del" title="ลบรายการ">🗑</button></div>' : ''}</td>
      </tr>`).join('');

    if (!admin) return;
    const find = tr => Store.data.receipts.find(x => x.id === tr.dataset.id);
    tb.querySelectorAll('.rc-status').forEach(sel => {
      sel.addEventListener('change', async () => {
        const rc = find(sel.closest('tr'));
        const r = await apiGuarded('updateReceipt', { id: rc.id, timestamp: rc.timestamp, vendor: rc.vendor, status: sel.value });
        if (r) { rc.status = r.status; toast('เปลี่ยนสถานะใบเสร็จแล้ว'); Sync.soon(); }
        else sel.value = rc.status;
      });
    });
    tb.querySelectorAll('.rc-del').forEach(btn => {
      btn.addEventListener('click', async () => {
        const rc = find(btn.closest('tr'));
        if (!confirm(`ลบรายการติดตามใบเสร็จ ${rc.vendor} (${fmtMoney(rc.amount)} บาท)?`)) return;
        const r = await apiGuarded('deleteReceipt', { id: rc.id, timestamp: rc.timestamp, vendor: rc.vendor });
        if (r) { toast('ลบรายการแล้ว'); await App.load(false, true); }
      });
    });
  },

  /* ---------- ประวัติการเบิกจ่าย ---------- */
  renderPayments() {
    const rows = Store.data.payments;
    const dups = rows.filter(p => p.dup).length;
    $('payCount').textContent = `${rows.length} รายการ` + (dups ? ` · บันทึกซ้ำ ${dups} รายการ` : '');
    const tb = $('payBody');
    if (!rows.length) {
      tb.innerHTML = '<tr><td colspan="8"><div class="empty">ยังไม่มีการบันทึกจ่าย</div></td></tr>';
      return;
    }
    tb.innerHTML = rows.map(p => {
      const diff = p.actual - p.expected;
      return `
      <tr>
        <td>${esc(p.timestamp)}</td>
        <td class="cell-strong">${esc(p.vendor)}</td>
        <td>${esc(p.site)}</td>
        <td>${esc(p.month)}${p.dup ? '<span class="dup-tag" title="Vendor + Media Site + รอบดิว ซ้ำกับรายการก่อนหน้า">ซ้ำ</span>' : ''}</td>
        <td class="num">${fmtMoney(p.expected)}</td>
        <td class="num">${fmtMoney(p.actual)}</td>
        <td class="num">${diff ? `<span class="${diff < 0 ? 'neg' : 'warn-text'}">${fmtMoney(diff)}</span>` : '-'}</td>
        <td>${esc(p.remark)}</td>
      </tr>`;
    }).join('');
  }
};
