/* ============================================================
   PLAN B — BILLBOARD RENTAL HUB  |  js/due.js
   แท็บ "ครบกำหนดจ่าย": รายการเลยกำหนด + ภายใน 30 วัน · อีเมลแจ้งเตือน
     ① แจ้งเตือนล่วงหน้า 7 วัน / 3 วัน   ② สรุปงานประจำเดือน (ทุกวันที่ 1)
   ============================================================ */

const Due = {

  settingsLoaded: false,
  recipients: [],

  init() {
    $('btnGoDue').addEventListener('click', () => App.switchTab('due'));
    $('btnInstallAlerts').addEventListener('click', () => this.install());
    $('btnAdvPreview').addEventListener('click', () => this.preview('advance'));
    $('btnAdvSelf').addEventListener('click', () => this.send('advance', true));
    $('btnMonPreview').addEventListener('click', () => this.preview('monthly'));
    $('btnMonSelf').addEventListener('click', () => this.send('monthly', true));
    $('btnMonAll').addEventListener('click', () => this.send('monthly', false));
    const now = new Date();
    $('mailMonth').value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  },

  /** งวดที่ต้องจ่าย: เลยกำหนด + ภายใน dueSoonDays วัน เรียงตามวันที่
      (1 งวด = แถวรายเดือนที่ใช้วันชำระเดียวกัน — ราย 3 เดือน/รายปี ถูกรวมให้แล้วจาก backend)
      ไม่รวม "งวดของปีก่อน" (วันชำระอยู่ก่อน Rental Year) — แสดงในแท็บตรวจสอบข้อมูลแทน */
  rows() {
    if (!Store.data) return [];
    const lim = Store.data.dueSoonDays;
    return (Store.data.payGroups || [])
      .filter(g => g.payAlert === 'overdue' || (g.payAlert !== 'prior' && g.daysToPay >= 0 && g.daysToPay <= lim))
      .sort((a, b) => a.daysToPay - b.daysToPay);
  },

  render() {
    const rows = this.rows();
    const total = rows.reduce((s, d) => s + d.amount, 0);
    const overdue = rows.filter(d => d.payAlert === 'overdue').length;
    const prior = Store.data.kpi.prior || 0;
    $('cntDue').textContent = rows.length || '';
    $('dueTitle').textContent = `ครบกำหนดจ่าย — เลยกำหนด ${overdue} · ภายใน ${Store.data.dueSoonDays} วัน ${rows.length - overdue}`;
    $('dueTotal').textContent = `รวม ${fmtMoney(total)} บาท` + (prior ? ` · ไม่รวมงวดของปีก่อน ${prior} งวด (ดูแท็บตรวจสอบข้อมูล)` : '');

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

  showSettings(r) {
    this.settingsLoaded = true;
    this.recipients = r.recipients || [];
    $('alertBadge').innerHTML = r.triggerOn
      ? '<span class="badge b-ok">เปิดอยู่</span>'
      : '<span class="badge b-off">ปิดอยู่</span>';
    const offsets = r.offsets.map((n, i) => `ครั้งที่ ${i + 1} ก่อน ${n} วัน`).join(' · ');
    $('alertInfo').innerHTML = `
      <div>${r.triggerOn
        ? `ตรวจทุกวันประมาณ ${r.hour}:00 น. — แจ้งเตือนล่วงหน้า ${offsets} · สรุปงานของเดือนทุกวันที่ ${r.monthlyDay}`
        : 'ยังไม่ได้เปิดการแจ้งเตือนอัตโนมัติ'}</div>
      ${r.oldTrigger ? '<div class="warn-text">พบ trigger อีเมลของ Billboard ERP เดิม (sendPaymentAlertEmails) — กด "เปิดการแจ้งเตือนอัตโนมัติ" เพื่อแทนที่ กันอีเมลซ้ำ</div>' : ''}
      <div>ผู้รับ ${r.recipientCount} คน${r.recipients.length ? ': ' + r.recipients.map(esc).join(', ') : ''}</div>`;
    $('advLabel').textContent = `ก่อนถึงกำหนด ${r.offsets.join(' และ ')} วัน`;
    $('alertAdmin').classList.toggle('hidden', !Store.isAdmin());
    $('btnInstallAlerts').classList.toggle('hidden', r.triggerOn && !r.oldTrigger);
  },

  async loadSettings() {
    const r = await api('getAlertSettings', {});
    if (!r.ok) { $('alertInfo').textContent = r.message || 'โหลดสถานะอีเมลไม่สำเร็จ'; return; }
    this.showSettings(r);
  },

  async install() {
    if (!confirm('เปิดการแจ้งเตือนทางอีเมลอัตโนมัติทุกวัน 08:00 น. (แทนที่ trigger เดิมของ Billboard ERP)?')) return;
    const r = await apiGuarded('installAlerts');
    if (r) { this.showSettings(r); toast('เปิดการแจ้งเตือนอัตโนมัติแล้ว'); }
  },

  async preview(type) {
    const r = await apiGuarded('previewEmail', { type, month: $('mailMonth').value });
    if (!r) return;
    $('drawerHost').innerHTML = `
    <div class="drawer-mask" id="drawerMask">
      <div class="drawer">
        <div class="drawer-head">
          <div><h2>ตัวอย่างอีเมล</h2>
            <div class="sub">${esc(r.subject)}<br>ถึง: ${esc(r.to.join(', '))}</div></div>
          <div class="spacer"></div>
          <button class="icon-btn" id="btnCloseDetail" title="ปิด">✕</button>
        </div>
        <div class="drawer-body"><iframe class="mail-preview" id="mailFrame" sandbox></iframe></div>
      </div>
    </div>`;
    $('mailFrame').srcdoc = r.html;
    const close = () => { $('drawerHost').innerHTML = ''; };
    $('btnCloseDetail').addEventListener('click', close);
    $('drawerMask').addEventListener('click', e => { if (e.target.id === 'drawerMask') close(); });
  },

  async send(type, toSelf) {
    const what = type === 'monthly' ? `สรุปงานเดือน ${$('mailMonth').value}` : 'แจ้งเตือนล่วงหน้าของวันนี้';
    const who = toSelf ? 'ตัวคุณเอง' : this.recipients.join(', ');
    if (!confirm(`ส่งอีเมล${what} ถึง ${who}?`)) return;
    const r = await apiGuarded('sendAlertNow', { type, month: $('mailMonth').value, toSelf });
    if (r) toast(`ส่งอีเมลแล้ว → ${r.to.join(', ')}`);
  }
};
