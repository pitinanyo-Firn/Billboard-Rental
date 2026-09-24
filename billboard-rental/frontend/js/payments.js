/* ============================================================
   PLAN B — BILLBOARD RENTAL HUB  |  js/payments.js
   บันทึกการเบิกจ่าย (Payment_History) · ติดตามใบเสร็จ (Receipt_Tracking)
   ============================================================ */

const Payments = {

  selected: null,     // รายการค่าเช่าที่เลือกในฟอร์ม

  init() {
    $('payForm').addEventListener('submit', e => { e.preventDefault(); this.submit(); });
    $('pRental').addEventListener('change', () => this.pick($('pRental').value));
    $('pRental').addEventListener('input', () => this.pick($('pRental').value));
    $('fReceipt').addEventListener('change', () => this.renderReceipts());
  },

  label(d) {
    return `${d.vendorName} · ${d.mediaSite} · ${d.contractNo || '-'} · ${d.payment} [${d.id}]`;
  },

  render() {
    $('payFormCard').classList.toggle('hidden', !Store.isAdmin());
    $('dlRentals').innerHTML = Store.data.rentals.map(d => `<option value="${esc(this.label(d))}">`).join('');

    const st = $('fReceipt');
    const keep = st.value;
    st.innerHTML = '<option value="">ทุกสถานะ</option>' +
      Store.data.receiptStatuses.map(s => `<option>${esc(s)}</option>`).join('');
    if (keep) st.value = keep;

    this.renderReceipts();
    this.renderPayments();
  },

  /** เลือกรายการจาก datalist ("... [R12]") */
  pick(text) {
    const m = String(text).match(/\[(R\d+)\]\s*$/);
    this.selected = m ? Store.data.rentals.find(d => d.id === m[1]) || null : null;
    $('pExpected').value = this.selected ? fmtMoney(this.selected.installment) : '';
    if (this.selected && !$('pActual').value) $('pActual').value = this.selected.installment || '';
  },

  /** เปิดฟอร์มพร้อมเลือกรายการ (จากปุ่ม 💸 บันทึกจ่าย ในหน้ารายละเอียด) */
  prefill(id) {
    const d = Store.data.rentals.find(x => x.id === id);
    if (!d) return;
    App.switchTab('payments');
    $('pActual').value = '';
    $('pRental').value = this.label(d);
    this.pick($('pRental').value);
    const now = new Date();
    $('pMonth').value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    $('payFormCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
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
