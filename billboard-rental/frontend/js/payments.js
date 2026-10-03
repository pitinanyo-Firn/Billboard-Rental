/* ============================================================
   PLAN B — BILLBOARD RENTAL HUB  |  js/payments.js
   บันทึกการเบิกจ่าย (Payment_History) · ติดตามใบเสร็จ (Receipt_Tracking)
   รายการค่าเช่า = ทุกแถวใน Contract_Master (1 แถว = 1 รอบเดือน)
     กรองตาม Vendor / รอบจ่าย / ค้นหา → 🔍 รายละเอียด (ตรวจข้อมูล) → ยืนยันจ่าย
   ============================================================ */

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const Payments = {

  edits: {},          // id → ยอดจ่ายจริงที่แก้ในตาราง (คงไว้ตอนกรองใหม่)
  focusId: '',        // แถวที่เปิดมาจากปุ่ม 💸 บันทึกจ่าย ในหน้ารายละเอียด

  init() {
    $('pfVendor').addEventListener('change', () => this.renderPick());
    $('pfMonth').addEventListener('change', () => this.renderPick());
    $('pfSearch').addEventListener('input', () => this.renderPick());
    $('pfClear').addEventListener('click', () => {
      $('pfVendor').value = ''; $('pfMonth').value = ''; $('pfSearch').value = '';
      this.focusId = '';
      this.renderPick();
    });
    $('pickBody').addEventListener('input', e => {
      const inp = e.target.closest('.pick-amt');
      if (inp) this.edits[inp.closest('tr').dataset.id] = inp.value;
    });
    $('pickBody').addEventListener('click', e => {
      const b = e.target.closest('button[data-act]');
      if (!b) return;
      const id = b.closest('tr').dataset.id;
      if (b.dataset.act === 'detail') Rentals.openDetail(id);
      else this.confirmPay(id, b);
    });
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

  render() {
    $('payFormCard').classList.toggle('hidden', !Store.isAdmin());
    this.renderFilters();
    this.renderPick();

    const st = $('fReceipt');
    const keep = st.value;
    st.innerHTML = '<option value="">ทุกสถานะ</option>' +
      Store.data.receiptStatuses.map(s => `<option>${esc(s)}</option>`).join('');
    if (keep) st.value = keep;

    this.renderReceipts();
    this.renderPayments();
  },

  /* ---------- รายการค่าเช่า (Contract_Master ทั้งหมด) ---------- */
  renderFilters() {
    const rows = Store.data.rentals;
    const fill = (sel, first, opts) => {
      const keep = sel.value;
      sel.innerHTML = `<option value="">${first}</option>` + opts.map(o => `<option value="${esc(o.v)}">${esc(o.t)}</option>`).join('');
      if (opts.some(o => o.v === keep)) sel.value = keep;
    };
    const vendors = [...new Set(rows.map(d => d.vendorName).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'th'));
    fill($('pfVendor'), '-- กรองผู้ขายทั้งหมด (Vendor) --', vendors.map(v => ({ v, t: v })));
    const yms = [...new Set(rows.map(d => this.ymOf(d)).filter(Boolean))].sort();
    fill($('pfMonth'), '-- กรองรอบจ่ายรายเดือนทั้งหมด --', yms.map(v => ({ v, t: this.ymLabel(v) })));
  },

  /** รอบที่บันทึกจ่ายไปแล้ว (Vendor + Site + เดือน) — ใช้แสดงป้าย "บันทึกแล้ว" */
  paidKeys() {
    const k = new Set();
    Store.data.payments.forEach(p => k.add(`${p.vendor}|${p.site}|${String(p.month).toLowerCase()}`));
    return k;
  },

  filtered() {
    const v = $('pfVendor').value, ym = $('pfMonth').value;
    const q = $('pfSearch').value.trim().toLowerCase();
    return Store.data.rentals
      .filter(d => !this.focusId || d.id === this.focusId)
      .filter(d => !v || d.vendorName === v)
      .filter(d => !ym || this.ymOf(d) === ym)
      .filter(d => !q || [d.vendorName, d.vendorNo, d.mediaSite, d.pr, d.po, d.contractNo, d.memoInv]
        .some(x => String(x || '').toLowerCase().includes(q)))
      .sort((a, b) => (this.ymOf(a) || '9').localeCompare(this.ymOf(b) || '9') ||
                      a.vendorName.localeCompare(b.vendorName, 'th') || a._row - b._row);
  },

  renderPick() {
    const rows = this.filtered();
    $('pfCount').textContent = `${fmtNum(rows.length)} รายการ`;
    const tb = $('pickBody');
    if (!rows.length) {
      tb.innerHTML = '<tr><td colspan="6"><div class="empty">ไม่พบรายการตามตัวกรอง</div></td></tr>';
      return;
    }
    const done = this.paidKeys();
    tb.innerHTML = rows.map(d => {
      const ym = this.ymOf(d);
      const label = this.ymLabel(ym) || d.month || '-';
      const recorded = done.has(`${d.vendorName}|${d.mediaSite}|${label.toLowerCase()}`);
      const amt = this.edits[d.id] !== undefined ? this.edits[d.id] : (d.installment ? Number(d.installment).toFixed(2) : '');
      return `
      <tr data-id="${d.id}" class="${d.id === this.focusId ? 'pick-focus' : ''}">
        <td class="cell-strong">${esc(d.vendorName || '-')}<div class="cell-mute">${esc(d.contractNo || '-')}${d.vendorNo ? ' · ' + esc(d.vendorNo) : ''}</div></td>
        <td>${esc(d.mediaSite || '-')}<div class="cell-mute">${esc(d.payment || '')}</div></td>
        <td><b>${esc(label)}</b><div>${statusBadge(d.payStatus)}${recorded ? '<span class="dup-tag" title="มีใน Payment_History แล้ว">บันทึกแล้ว</span>' : ''}</div></td>
        <td class="num">฿${fmtMoney(d.installment)}</td>
        <td class="num"><input class="st-input pick-amt" type="number" min="0" step="0.01" value="${esc(amt)}"></td>
        <td class="pick-act">
          <button type="button" class="btn btn-ghost btn-sm" data-act="detail" title="ตรวจข้อมูลทั้งหมดของแถวนี้">🔍 รายละเอียด</button>
          <button type="button" class="btn btn-primary btn-sm" data-act="pay">ยืนยันจ่าย</button>
        </td>
      </tr>`;
    }).join('');
  },

  /** เปิดหน้าบันทึกจ่ายพร้อมกรองรายการเดียว (จากปุ่ม 💸 บันทึกจ่าย ในหน้ารายละเอียด) */
  prefill(id) {
    const d = Store.data.rentals.find(x => x.id === id);
    if (!d) return;
    App.switchTab('payments');
    this.focusId = id;
    this.renderPick();
    $('payFormCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  showError(msg) {
    $('payError').textContent = msg;
    $('payError').classList.toggle('hidden', !msg);
  },

  async confirmPay(id, btn, force = false) {
    this.showError('');
    const d = Store.data.rentals.find(x => x.id === id);
    if (!d) return this.showError('ไม่พบรายการ — กด ↻ รีเฟรช แล้วลองใหม่');
    const ym = this.ymOf(d);
    if (!ym) return this.showError(`แถว ${d._row}: ไม่มีรอบจ่าย (คอลัมน์ Month / วันชำระว่าง) — กรุณาแก้ไขข้อมูลก่อน`);
    const inp = btn.closest('tr').querySelector('.pick-amt');
    const actual = Number(inp.value);
    if (!(actual > 0)) { inp.focus(); return this.showError('กรุณากรอกยอดจ่ายจริงให้มากกว่า 0'); }

    const diff = actual - (Number(d.installment) || 0);
    const markPaid = $('pMarkPaid').checked;
    if (!force && !confirm(
      `ยืนยันบันทึกการเบิกจ่าย\n\n` +
      `Vendor: ${d.vendorName}\nMedia Site: ${d.mediaSite}\nเลขที่สัญญา: ${d.contractNo || '-'}\n` +
      `รอบจ่าย: ${this.ymLabel(ym)}\nPR / PO: ${d.pr || '-'} / ${d.po || '-'}\n` +
      `ค่าเช่าตามสัญญา: ${fmtMoney(d.installment)} บาท\nยอดจ่ายจริง: ${fmtMoney(actual)} บาท` +
      (diff ? `  (ส่วนต่าง ${fmtMoney(diff)})` : '') +
      ($('pRemark').value ? `\nหมายเหตุ: ${$('pRemark').value}` : '') +
      (markPaid ? `\n\n→ เปลี่ยน Status Payment เป็น "เบิกแล้ว"` : ''))) return;

    btn.disabled = true;
    btn.textContent = 'กำลังบันทึก…';
    const r = await api('recordPayment', {
      id: d.id, contractNo: d.contractNo, month: ym,
      actual, remark: $('pRemark').value, markPaid, force
    });
    btn.disabled = false;
    btn.textContent = 'ยืนยันจ่าย';

    if (!r.ok) {
      if (r.code === 'SESSION_EXPIRED') { toast('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่'); setTimeout(() => Auth.logout(), 1200); return; }
      if (r.code === 'DUPLICATE' && confirm(r.message + '?')) return this.confirmPay(id, btn, true);
      return this.showError(r.message || 'บันทึกไม่สำเร็จ');
    }
    toast(`บันทึกการเบิกจ่าย ${d.vendorName} รอบ ${r.month} แล้ว`);
    delete this.edits[id];
    $('pRemark').value = '';
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
