/* ============================================================
   PLAN B — BILLBOARD RENTAL HUB  |  js/due.js
   แท็บ "ครบกำหนดจ่าย": รายการเลยกำหนด + ภายใน 30 วัน · สถานะอีเมลแจ้งเตือน
   ============================================================ */

const Due = {

  settingsLoaded: false,

  init() {
    $('btnGoDue').addEventListener('click', () => App.switchTab('due'));
    $('btnMailSelf').addEventListener('click', () => this.sendNow(true));
    $('btnMailAll').addEventListener('click', () => this.sendNow(false));
  },

  /** งวดที่ต้องจ่าย: เลยกำหนด + ภายใน dueSoonDays วัน เรียงตามวันที่
      (1 งวด = แถวรายเดือนที่ใช้วันชำระเดียวกัน — ราย 3 เดือน/รายปี ถูกรวมให้แล้วจาก backend) */
  rows() {
    if (!Store.data) return [];
    const lim = Store.data.dueSoonDays;
    return (Store.data.payGroups || [])
      .filter(g => g.payAlert === 'overdue' || (g.daysToPay >= 0 && g.daysToPay <= lim))
      .sort((a, b) => a.daysToPay - b.daysToPay);
  },

  render() {
    const rows = this.rows();
    const total = rows.reduce((s, d) => s + d.amount, 0);
    const overdue = rows.filter(d => d.payAlert === 'overdue').length;
    $('cntDue').textContent = rows.length || '';
    $('dueTitle').textContent = `ครบกำหนดจ่าย — เลยกำหนด ${overdue} · ภายใน ${Store.data.dueSoonDays} วัน ${rows.length - overdue}`;
    $('dueTotal').textContent = `รวม ${fmtMoney(total)} บาท`;

    const tb = $('dueBody');
    if (!rows.length) {
      tb.innerHTML = '<tr><td colspan="9"><div class="empty">ไม่มีรายการครบกำหนดจ่าย</div></td></tr>';
    } else {
      tb.innerHTML = rows.map(d => `
        <tr data-id="${d.id}">
          <td>${alertDot(d.payAlert)}<span class="cell-mute">${payText(d.payAlert)}</span></td>
          <td class="cell-strong">${fmtDate(d.payDate)}<div class="cell-mute">${d.payKind === 'cheque' ? 'เช็คลงวันที่' : 'ชำระตามสัญญา'}</div></td>
          <td class="num">${fmtDays(d.daysToPay)}</td>
          <td>${esc(d.vendorName)}</td>
          <td>${esc(d.mediaSite)}</td>
          <td>${esc(d.contractNo || '-')}</td>
          <td>${esc(d.payment)}<div class="cell-mute">${esc(d.months.length > 1 ? `${d.months[0]} – ${d.months[d.months.length - 1]}` : d.months[0] || '')}</div></td>
          <td class="num">${fmtMoney(d.amount)}</td>
          <td>${statusBadge(d.payStatus)}</td>
        </tr>`).join('');
      tb.querySelectorAll('tr[data-id]').forEach(tr => {
        tr.addEventListener('click', () => Rentals.openDetail(tr.dataset.id));
      });
    }

    if (!this.settingsLoaded) this.loadSettings();
  },

  async loadSettings() {
    const r = await api('getAlertSettings', {});
    if (!r.ok) { $('alertInfo').textContent = r.message || 'โหลดสถานะอีเมลไม่สำเร็จ'; return; }
    this.settingsLoaded = true;
    $('alertBadge').innerHTML = r.triggerOn
      ? '<span class="badge b-ok">เปิดอยู่</span>'
      : '<span class="badge b-off">ปิดอยู่</span>';
    $('alertInfo').innerHTML = `
      <div>${r.triggerOn
        ? `ตรวจทุกวันประมาณ ${r.hour}:00 น. — ส่งอีเมลเมื่อเหลืออีก ${r.offsets.map(n => n + ' วัน').join(' / ')} ถึงวันที่ต้องจ่าย และสรุปรายการเลยกำหนดทุกวันจันทร์`
        : 'ยังไม่ได้เปิดการเตือนอัตโนมัติ — รัน installAlertTrigger ใน Apps Script (หรือเมนู ⚙️ Billboard Rental ในชีต)'}</div>
      <div>ผู้รับ ${r.recipientCount} คน${r.recipients.length ? ': ' + r.recipients.map(esc).join(', ') : ''}</div>`;
    $('alertAdmin').classList.toggle('hidden', !Store.isAdmin());
  },

  async sendNow(toSelf) {
    if (!toSelf && !confirm('ส่งอีเมลสรุปรายการครบกำหนดจ่ายให้ผู้รับทั้งหมด?')) return;
    const r = await apiGuarded('sendAlertNow', { toSelf });
    if (r) toast(`ส่งอีเมลแล้ว (${r.sent} รายการ) → ${r.to.join(', ')}`);
  }
};
