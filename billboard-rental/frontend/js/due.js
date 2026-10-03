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
    $('btnTestAlert').addEventListener('click', () => this.openTest());
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

  /* ---------- ปุ่ม 🔔 ทดสอบแจ้งเตือน (ส่งได้ทุกเวลา) ---------- */
  openTest() {
    const all = this.recipients.length ? this.recipients.join(', ') : 'ผู้รับแจ้งเตือนทั้งหมด';
    $('drawerHost').innerHTML = `
    <div class="drawer-mask" id="drawerMask">
      <div class="drawer" style="width:min(560px,100%)">
        <div class="drawer-head">
          <div><h2>🔔 ทดสอบแจ้งเตือนทางอีเมล</h2>
            <div class="sub">ส่งได้ทุกเวลา · การส่งอัตโนมัติทุกวัน 08:00 น. ยังทำงานตามปกติ</div></div>
          <div class="spacer"></div>
          <button class="icon-btn" id="btnCloseDetail" title="ปิด">✕</button>
        </div>
        <div class="drawer-body">
          <div class="card">
            <div class="card-head"><h2>อีเมลที่จะส่ง</h2></div>
            <div class="test-opts">
              <label class="check"><input type="checkbox" id="tRound0" checked> ① ครั้งที่ 1 — แจ้งเตือนล่วงหน้า 7 วัน</label>
              <label class="check"><input type="checkbox" id="tRound1" checked> ② ครั้งที่ 2 — แจ้งเตือนล่วงหน้า 3 วัน</label>
              <label class="check"><input type="checkbox" id="tMonthly"> ③ สรุปงานเดือนนี้</label>
            </div>
            <div class="cell-mute" style="margin-top:10px">ถ้าวันนี้ไม่มีรายการที่ครบในอีก 7 / 3 วัน ระบบจะใช้งวดถัดไปเป็นตัวอย่าง · หัวเรื่องขึ้นต้นด้วย [ทดสอบ]</div>
          </div>
          <div class="card">
            <div class="card-head"><h2>ส่งถึง</h2></div>
            <div class="test-opts">
              <label class="check"><input type="radio" name="tTo" value="self" checked> เฉพาะฉัน</label>
              <label class="check"><input type="radio" name="tTo" value="all"> ผู้รับทั้งหมด (${esc(all)})</label>
            </div>
          </div>
          <div id="testResult" class="member-result hidden"></div>
          <div class="edit-actions">
            <div class="spacer"></div>
            <button type="button" class="btn btn-ghost" id="btnTestCancel">ปิด</button>
            <button type="button" class="btn btn-primary" id="btnTestSend">🔔 ส่งอีเมลทดสอบ</button>
          </div>
        </div>
      </div>
    </div>`;
    const close = () => { $('drawerHost').innerHTML = ''; };
    $('btnCloseDetail').addEventListener('click', close);
    $('btnTestCancel').addEventListener('click', close);
    $('drawerMask').addEventListener('click', e => { if (e.target.id === 'drawerMask') close(); });
    $('btnTestSend').addEventListener('click', () => this.sendTest());
  },

  async sendTest() {
    const rounds = [0, 1].filter(i => $('tRound' + i).checked);
    const monthly = $('tMonthly').checked;
    const to = document.querySelector('input[name="tTo"]:checked').value;
    if (!rounds.length && !monthly) return toast('กรุณาเลือกอีเมลอย่างน้อย 1 ฉบับ');
    if (to === 'all' && !confirm('ส่งอีเมลทดสอบถึงผู้รับทั้งหมด?')) return;
    const btn = $('btnTestSend');
    btn.disabled = true;
    btn.textContent = 'กำลังส่ง…';
    const r = await apiGuarded('testAlert', { rounds, monthly, to }, true);
    btn.disabled = false;
    btn.textContent = '🔔 ส่งอีเมลทดสอบ';
    if (!r) return;
    const el = $('testResult');
    el.innerHTML = `ส่งแล้ว ${r.sent.length} ฉบับ → <b>${esc(r.to.join(', '))}</b>
      <ul style="margin:8px 0 0 18px">${r.sent.map(s => `<li>${esc(s)}</li>`).join('')}</ul>
      <div class="cell-mute" style="margin-top:8px">การส่งอัตโนมัติทุกวัน: ${r.auto ? '<b class="ok-text">เปิดอยู่</b>' : '<b class="warn-text">ปิดอยู่</b>'}</div>`;
    el.classList.remove('hidden');
    toast(`ส่งอีเมลทดสอบแล้ว ${r.sent.length} ฉบับ`);
  },

  async send(type, toSelf) {
    const what = type === 'monthly' ? `สรุปงานเดือน ${$('mailMonth').value}` : 'แจ้งเตือนล่วงหน้าของวันนี้';
    const who = toSelf ? 'ตัวคุณเอง' : this.recipients.join(', ');
    if (!confirm(`ส่งอีเมล${what} ถึง ${who}?`)) return;
    const r = await apiGuarded('sendAlertNow', { type, month: $('mailMonth').value, toSelf });
    if (r) toast(`ส่งอีเมลแล้ว → ${r.to.join(', ')}`);
  }
};
