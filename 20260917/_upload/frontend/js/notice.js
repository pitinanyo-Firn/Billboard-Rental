/* ============================================================
   PLAN B — CONTRACT RENTAL HUB  |  js/notice.js
   แท็บ "หนังสือแจ้งเตือน" — ตารางรายเดือนตามคอลัมน์ "วันที่ต้องทำหนังสือแจ้งเตือน"
   + แก้ "สถานะการต่อสัญญา" (dropdown) / "สถานะเอกสาร" (text) เขียนกลับลงชีต (admin)
   + สถานะ/ทดสอบการแจ้งเตือนทางอีเมล
   ============================================================ */

const Notice = {

  selected: null,       // 'yyyy-MM'
  settings: null,
  saving: 0,            // จำนวนการบันทึกที่ยังค้าง — Sync จะรอจนเป็น 0

  init() {
    $('btnMailSelf').addEventListener('click', () => this.send(true));
    $('btnMailAll').addEventListener('click', () => this.send(false));
    $('btnGoNotice').addEventListener('click', () => App.switchTab('notice'));
  },

  /** เรียกหลังโหลดข้อมูลใหม่ (silent = โหลดเบื้องหลังจาก Sync — คงเดือนที่เลือกไว้) */
  render(silent = false) {
    const months = Store.data.noticeSchedule || [];
    const now = this.monthKey(new Date());
    if (!this.selected || !months.some(m => m.month === this.selected)) {
      this.selected = months.some(m => m.month === now) ? now : (months[0] || {}).month;
    }
    this.renderMonths();
    this.renderDetail();
    if (!silent) this.loadSettings();
  },

  isAdmin() {
    return (Store.profile || {}).role === 'admin';
  },

  monthKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  },

  monthName(key) {
    const [y, m] = key.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  },

  /** จบแล้ว = Complete / Not Renew (รองรับค่าเดิม "ส่งแล้ว") */
  isDone(c) {
    return CONFIG.RENEW_DONE.includes(c.renewStatus) || String(c.renewStatus || '').includes('ส่งแล้ว');
  },

  /* ---------- ตารางรายเดือน (ตามสเปก) ---------- */
  renderMonths() {
    const months = Store.data.noticeSchedule || [];
    const now = this.monthKey(new Date());
    const cls = { 'Complete': 'ok-text', 'On Process': 'warn-text', 'Not Renew': 'off-text' };

    const renewSummary = list => {
      const m = {};
      list.forEach(c => { const k = c.renewStatus || 'ยังไม่ระบุ'; m[k] = (m[k] || 0) + 1; });
      return CONFIG.RENEW_STATUSES.concat(Object.keys(m).filter(k => !CONFIG.RENEW_STATUSES.includes(k)))
        .filter(k => m[k])
        .map(k => `<span class="${cls[k] || 'cell-mute'}">${esc(k)} ${m[k]}</span>`)
        .join('<br>');
    };
    const docSummary = list => {
      const notes = list.filter(c => c.docStatus);
      if (!notes.length) return '<span class="cell-mute">-</span>';
      return notes.slice(0, 3).map(c =>
        `<div class="doc-line" title="${esc(c.docStatus)}"><b>${esc(c.contractNo || '-')}</b> ${esc(c.docStatus)}</div>`
      ).join('') + (notes.length > 3 ? `<div class="cell-mute">+${notes.length - 3} รายการ</div>` : '');
    };

    const tb = $('noticeBody');
    tb.innerHTML = months.map(m => `
      <tr data-month="${m.month}" class="${m.month === this.selected ? 'sel' : ''} ${m.month === now ? 'now-month' : ''} ${m.count ? '' : 'zero'}">
        <td>${this.monthName(m.month)}</td>
        <td class="num">${m.count}</td>
        <td>${m.contracts.map(c => `<span class="cno">${esc(c.contractNo || '-')}</span>`).join('') || '-'}</td>
        <td>${m.count ? renewSummary(m.contracts) : ''}</td>
        <td>${m.count ? docSummary(m.contracts) : ''}</td>
      </tr>`).join('');

    tb.querySelectorAll('tr[data-month]').forEach(tr => {
      tr.addEventListener('click', () => {
        this.selected = tr.dataset.month;
        this.renderMonths();
        this.renderDetail();
      });
    });
  },

  /* ---------- รายละเอียดเดือนที่เลือก ---------- */
  level(c) {
    if (this.isDone(c))       return ['normal',   c.renewStatus === 'Not Renew' ? 'ไม่ต่อสัญญา' : 'เสร็จแล้ว'];
    if (c.daysToNotice < 0)   return ['critical', 'เลยกำหนด'];
    if (c.daysToNotice <= 30) return ['warning',  'ใกล้ถึงกำหนด'];
    return ['unknown', 'รอถึงกำหนด'];
  },

  levelHtml(c) {
    const [lv, text] = this.level(c);
    return `${alertDot(lv)}<span class="cell-mute">${text}</span>`;
  },

  renewCell(c) {
    if (!this.isAdmin()) return esc(c.renewStatus || 'ยังไม่ระบุ');
    const known = CONFIG.RENEW_STATUSES.includes(c.renewStatus) || !c.renewStatus;
    return `<select class="st-select" data-field="renewStatus" aria-label="สถานะการต่อสัญญา">
      <option value="">— ยังไม่ระบุ —</option>
      ${known ? '' : `<option value="${esc(c.renewStatus)}" selected disabled>${esc(c.renewStatus)} (ค่าเดิม)</option>`}
      ${CONFIG.RENEW_STATUSES.map(s => `<option ${s === c.renewStatus ? 'selected' : ''}>${esc(s)}</option>`).join('')}
    </select>`;
  },

  docCell(c) {
    if (!this.isAdmin()) return esc(c.docStatus || '-');
    const v = c.docStatus || '';
    return `<div class="doc-edit">
      <input type="text" class="st-input" data-field="docStatus" maxlength="${CONFIG.DOC_STATUS_MAX}"
             value="${esc(v)}" placeholder="พิมพ์สถานะเอกสาร" aria-label="สถานะเอกสาร">
      <span class="st-count">${v.length}/${CONFIG.DOC_STATUS_MAX}</span>
    </div>`;
  },

  renderDetail() {
    const m = (Store.data.noticeSchedule || []).find(x => x.month === this.selected);
    $('noticeMonthTitle').textContent = m ? `รายละเอียด — ${this.monthName(m.month)}` : 'รายละเอียด';
    $('noticeMonthCount').textContent = m
      ? `${m.count} สัญญา${this.isAdmin() && m.count ? ' · แก้สถานะได้ บันทึกลงชีตอัตโนมัติ' : ''}`
      : '';

    const tb = $('noticeDetail');
    if (!m || !m.count) {
      tb.innerHTML = '<tr><td colspan="9"><div class="empty">เดือนนี้ไม่มีสัญญาที่ต้องทำหนังสือแจ้งเตือน</div></td></tr>';
      return;
    }

    tb.innerHTML = m.contracts.map(c => `
      <tr data-id="${c.id}">
        <td class="lv">${this.levelHtml(c)}</td>
        <td class="cell-strong open-detail">${esc(c.contractNo || '-')}</td>
        <td class="open-detail">${esc(c.mediaSite)}<div class="cell-mute">${esc(c.mediaType)}</div></td>
        <td class="open-detail">${esc(c.counterparty)}</td>
        <td>${fmtDate(c.noticeDeadline)}</td>
        <td class="num">${c.daysToNotice === null ? '-' : fmtDays(c.daysToNotice)}</td>
        <td>${fmtDate(c.endDate)}</td>
        <td class="st-cell">${this.renewCell(c)}<span class="st-flag"></span></td>
        <td class="st-cell">${this.docCell(c)}</td>
      </tr>`).join('');

    tb.querySelectorAll('tr[data-id]').forEach(tr => {
      const id = tr.dataset.id;
      tr.querySelectorAll('.open-detail').forEach(td => td.addEventListener('click', () => Contracts.openDetail(id)));
      tr.querySelectorAll('.st-cell').forEach(td => td.addEventListener('click', e => e.stopPropagation()));

      const sel = tr.querySelector('.st-select');
      if (sel) sel.addEventListener('change', () => this.save(tr, { renewStatus: sel.value }));

      const inp = tr.querySelector('.st-input');
      if (inp) {
        const counter = tr.querySelector('.st-count');
        inp.addEventListener('input', () => { counter.textContent = `${inp.value.length}/${CONFIG.DOC_STATUS_MAX}`; });
        inp.addEventListener('keydown', e => {
          if (e.key === 'Enter') { e.preventDefault(); inp.blur(); }
          if (e.key === 'Escape') { inp.value = inp.defaultValue; inp.blur(); }
        });
        inp.addEventListener('blur', () => {
          const v = inp.value.replace(/\s+/g, ' ').trim();
          if (v !== inp.defaultValue.trim()) this.save(tr, { docStatus: v });
        });
      }
    });
  },

  /* ---------- บันทึกลงชีต ---------- */
  async save(tr, patch) {
    const id = tr.dataset.id;
    const c = (Store.data.contracts || []).find(x => x.id === id);
    if (!c) return;
    const flag = tr.querySelector('.st-flag');
    const controls = tr.querySelectorAll('.st-select, .st-input');
    controls.forEach(el => { el.disabled = true; });
    flag.className = 'st-flag saving';
    flag.textContent = 'กำลังบันทึกลง Google Sheet…';

    this.saving++;
    let r;
    try {
      r = await api('updateNoticeStatus', Object.assign({ id, contractNo: c.contractNo }, patch));
    } finally {
      this.saving--;
    }
    controls.forEach(el => { el.disabled = false; });

    if (!r.ok) {
      flag.className = 'st-flag err';
      flag.textContent = 'บันทึกไม่สำเร็จ';
      if (r.code === 'SESSION_EXPIRED') { toast('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่'); setTimeout(() => Auth.logout(), 1200); return; }
      toast(r.message || 'บันทึกไม่สำเร็จ');
      if (r.code === 'STALE') Sync.soon(300);          // แถวในชีตเลื่อน → ดึงข้อมูลล่าสุดให้เลย
      // คืนค่าเดิมในช่อง
      const sel = tr.querySelector('.st-select'); if (sel && 'renewStatus' in patch) sel.value = c.renewStatus || '';
      const inp = tr.querySelector('.st-input'); if (inp && 'docStatus' in patch) inp.value = inp.defaultValue;
      return;
    }

    // อัปเดตข้อมูลในหน้า (ไม่ต้องโหลดทั้งหมดใหม่)
    const apply = o => Object.keys(patch).forEach(k => { o[k] = patch[k]; });
    apply(c);
    (Store.data.noticeSchedule || []).forEach(m => m.contracts.forEach(x => { if (x.id === id) apply(x); }));
    const inp = tr.querySelector('.st-input'); if (inp && 'docStatus' in patch) { inp.value = patch.docStatus; inp.defaultValue = patch.docStatus; }
    const src = (Store.data.noticeSchedule || []).flatMap(m => m.contracts).find(x => x.id === id) || c;
    tr.querySelector('.lv').innerHTML = this.levelHtml(src);

    flag.className = 'st-flag ok';
    flag.textContent = 'บันทึกลงชีตแล้ว ✓';
    setTimeout(() => { if (flag.classList.contains('ok')) { flag.className = 'st-flag'; flag.textContent = ''; } }, 2500);

    this.renderMonths();
    Dashboard.renderNoticeSoon();
    Sync.soon();                                         // ยืนยันกับชีต + รับการแก้ของคนอื่นที่อาจเกิดพร้อมกัน
  },

  /* ---------- อีเมล ---------- */
  async loadSettings() {
    const r = await api('getNoticeSettings', {});
    $('noticeAdmin').classList.toggle('hidden', !this.isAdmin());

    if (!r.ok) {
      $('noticeMailBadge').innerHTML = '';
      $('noticeMailInfo').textContent = r.message || 'โหลดสถานะการแจ้งเตือนไม่สำเร็จ';
      return;
    }
    this.settings = r;

    $('noticeMailBadge').innerHTML = r.triggerOn
      ? '<span class="badge b-ok">เปิดอยู่</span>'
      : '<span class="badge b-off">ยังไม่เปิด</span>';

    const who = r.recipients.length ? r.recipients.map(esc).join(', ') : `${r.recipientCount} คน`;
    const lines = [
      r.triggerOn
        ? `ตรวจอัตโนมัติทุกวันประมาณ ${String(r.hour).padStart(2, '0')}:00 น. — ส่งอีเมลเมื่อเหลืออีก ${r.offsets.join(' / ')} วันถึงวันที่ต้องทำหนังสือแจ้งเตือน` +
          (r.overdueEvery ? ` · เลยกำหนดแล้วเตือนซ้ำทุก ${r.overdueEvery} วัน` : '') +
          (r.monthlySummary !== false ? ' · วันที่ 1 ของเดือนส่งสรุปรายการของเดือนนั้น' : '')
        : 'ยังไม่ได้เปิดการส่งอัตโนมัติ — ผู้ดูแลระบบเปิดได้ที่ Apps Script: เมนู ⚙️ Contract Hub → เปิดการเตือนทางอีเมล',
      r.recipientCount
        ? `ผู้รับ: ${who}`
        : 'ยังไม่มีผู้รับ — ตั้ง Script Property NOTICE_EMAILS',
      'สัญญาที่ "สถานะการต่อสัญญา" เป็น Complete หรือ Not Renew จะหยุดการเตือน'
    ];
    $('noticeMailInfo').innerHTML = lines.map(l => `<div>${l}</div>`).join('');
  },

  async send(toSelf) {
    if (!this.selected) return;
    const label = this.monthName(this.selected);
    if (!toSelf) {
      const n = (this.settings || {}).recipientCount || 0;
      if (!confirm(`ส่งอีเมลสรุปหนังสือแจ้งเตือนเดือน ${label} ถึงผู้รับ ${n} คน?`)) return;
    }
    const r = await apiGuarded('sendNoticeNow', { month: this.selected, toSelf });
    if (r) toast(`ส่งอีเมลสรุป ${r.sent} สัญญา ถึง ${r.to.join(', ')} แล้ว`);
  }
};
