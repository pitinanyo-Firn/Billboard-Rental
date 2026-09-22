/* ============================================================
   PLAN B — CONTRACT RENTAL HUB  |  js/contracts.js
   ทะเบียนสัญญา (ตาราง + ตัวกรอง) · รายการต้องดำเนินการ · หน้ารายละเอียด
   ============================================================ */

const Contracts = {

  FILTER_IDS: ['q', 'fCompany', 'fMedia', 'fStatus', 'fProvince', 'fAlert'],

  /** ผูก event ครั้งเดียวตอนเริ่มระบบ */
  init() {
    this.FILTER_IDS.forEach(id => {
      $(id).addEventListener('input', () => this.applyFilter());
      $(id).addEventListener('change', () => this.applyFilter());
    });
    $('btnResetFilter').addEventListener('click', () => this.resetFilter());
    document.addEventListener('keydown', e => { if (e.key === 'Escape') this.closeDetail(); });
  },

  /** เรียกหลังโหลดข้อมูลใหม่ */
  render() {
    this.buildFilters();
    this.applyFilter();
    this.renderActionList();
  },

  /* ------------------------------------------------------------
     ตัวกรอง
     ---------------------------------------------------------- */
  buildFilters() {
    const f = Store.data.filters;
    const fill = (id, arr) => {
      const el = $(id);
      const keep = el.value;                           // คงตัวกรองเดิมไว้เมื่อ Sync โหลดข้อมูลใหม่
      const placeholder = el.options[0].outerHTML;
      el.innerHTML = placeholder + arr.map(v => `<option>${esc(v)}</option>`).join('');
      if (keep && arr.includes(keep)) el.value = keep;
    };
    fill('fCompany',  f.company);
    fill('fMedia',    f.mediaType);
    fill('fStatus',   f.status);
    fill('fProvince', f.province);
  },

  resetFilter() {
    this.FILTER_IDS.forEach(id => { $(id).value = ''; });
    this.applyFilter();
  },

  applyFilter() {
    if (!Store.data) return;

    const q  = $('q').value.trim().toLowerCase();
    const co = $('fCompany').value;
    const md = $('fMedia').value;
    const st = $('fStatus').value;
    const pv = $('fProvince').value;
    const al = $('fAlert').value;

    Store.viewRows = Store.data.contracts.filter(d => {
      if (co && d.company    !== co) return false;
      if (md && d.mediaType  !== md) return false;
      if (st && d.status     !== st) return false;
      if (pv && d.province   !== pv) return false;
      if (al && d.alert      !== al) return false;
      if (q) {
        const hay = [d.contractNo, d.counterparty, d.mediaSite, d.code,
                     d.siteCode, d.company, d.province].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    this.renderTable();
  },

  /* ------------------------------------------------------------
     ตารางทะเบียนสัญญา
     ---------------------------------------------------------- */
  renderTable() {
    const rows = Store.viewRows;
    $('rowCount').textContent = `แสดง ${rows.length} จาก ${Store.data.contracts.length} รายการ`;

    const tb = $('tbody');
    if (!rows.length) {
      tb.innerHTML = '<tr><td colspan="9"><div class="empty">ไม่พบสัญญาที่ตรงกับเงื่อนไข</div></td></tr>';
      return;
    }

    tb.innerHTML = rows.map(d => `
      <tr data-id="${d.id}">
        <td class="cell-strong">${alertDot(d.alert)}${esc(d.contractNo || '-')}</td>
        <td>${esc(d.company)}</td>
        <td>${esc(d.mediaType)}</td>
        <td>${esc(d.mediaSite)}<div class="cell-mute">${esc(d.province)}</div></td>
        <td>${esc(d.counterparty)}</td>
        <td>${fmtDate(d.startDate)}</td>
        <td>${fmtDate(d.endDate)}</td>
        <td class="num">${fmtDays(d.daysToExpire)}</td>
        <td>${statusBadge(d.status)}</td>
      </tr>`).join('');

    tb.querySelectorAll('tr[data-id]').forEach(tr => {
      tr.addEventListener('click', () => this.openDetail(tr.dataset.id));
    });
  },

  /* ------------------------------------------------------------
     รายการต้องดำเนินการ (180 วัน)
     ---------------------------------------------------------- */
  renderActionList() {
    const rows = Store.data.contracts
      .filter(d => d.status !== 'Write Off' && d.daysToExpire !== null && d.daysToExpire <= 180)
      .sort((a, b) => a.daysToExpire - b.daysToExpire);

    const tb = $('actionBody');
    if (!rows.length) {
      tb.innerHTML = '<tr><td colspan="8"><div class="empty">ไม่มีสัญญาที่ต้องดำเนินการภายใน 180 วัน</div></td></tr>';
      return;
    }

    tb.innerHTML = rows.map(d => `
      <tr data-id="${d.id}">
        <td>${alertDot(d.alert)}<span class="cell-mute">${alertText(d.alert)}</span></td>
        <td class="cell-strong">${esc(d.contractNo || '-')}</td>
        <td>${esc(d.mediaSite)}</td>
        <td>${esc(d.counterparty)}</td>
        <td>${fmtDate(d.endDate)}</td>
        <td class="num">${fmtDays(d.daysToExpire)}</td>
        <td>${d.noticeDeadline ? fmtDate(d.noticeDeadline)
                               : '<span class="cell-mute">ไม่ระบุเงื่อนไข</span>'}</td>
        <td class="num">${d.daysToNotice === null ? '-'
              : (d.daysToNotice < 0 ? '<span class="neg">เลยกำหนด</span>' : d.daysToNotice)}</td>
      </tr>`).join('');

    tb.querySelectorAll('tr[data-id]').forEach(tr => {
      tr.addEventListener('click', () => this.openDetail(tr.dataset.id));
    });
  },

  /* ------------------------------------------------------------
     หน้ารายละเอียดสัญญา (drawer)
     อ้างอิง layout ชีต 'หน้าย่อยแต่ละสัญญา'
     ---------------------------------------------------------- */
  async openDetail(id) {
    const r = await apiGuarded('getContract', { id });
    if (r) this.drawDetail(r.contract, r.responsibility);
  },

  closeDetail() {
    if (!$('drawerHost').innerHTML) return;
    if (Editor.isOpen && Editor.dirty() && !confirm('มีข้อมูลที่แก้ไขแต่ยังไม่ได้บันทึก — ปิดโดยไม่บันทึก?')) return;
    Editor.isOpen = false;
    $('drawerHost').innerHTML = '';
  },

  respClass(v) {
    if (v === 'บริษัท')   return 'v-company';
    if (v === 'คู่สัญญา') return 'v-partner';
    return 'v-none';
  },

  drawDetail(d, resp) {
    // แถบความคืบหน้าอายุสัญญา
    let pct = 0;
    if (d.startDate && d.endDate) {
      const s = new Date(d.startDate), e = new Date(d.endDate), n = new Date();
      pct = Math.max(0, Math.min(100, (n - s) / (e - s) * 100));
    }
    const barColor = {
      normal: '#059669', warning: '#D97706', critical: '#DC2626',
      expired: '#DC2626', closed: '#94A3B8', unknown: '#94A3B8'
    }[d.alert] || '#059669';

    const revShare = (d.revShareCompany || d.revShareOwner)
      ? `บริษัท ${(d.revShareCompany * 100).toFixed(0)}% / เจ้าของสื่อ ${(d.revShareOwner * 100).toFixed(0)}%`
      : '-';

    const row = (k, v) => `<dt>${esc(k)}</dt><dd>${esc(v || '-')}</dd>`;

    $('drawerHost').innerHTML = `
    <div class="drawer-mask" id="drawerMask">
      <div class="drawer">

        <div class="drawer-head">
          <div>
            <h2>${esc(d.mediaSite || '-')}</h2>
            <div class="sub">${esc(d.contractNo || '-')} · ${esc(d.mediaType || '-')} · ${esc(d.province || '-')}</div>
          </div>
          <div class="spacer"></div>
          ${(Store.profile || {}).role === 'admin'
            ? '<button class="btn btn-ghost btn-sm" id="btnEditDetail" title="แก้ไขข้อมูลสัญญา">✎ แก้ไข</button>' : ''}
          <button class="icon-btn" id="btnPrintDetail" title="พิมพ์">⎙</button>
          <button class="icon-btn" id="btnCloseDetail" title="ปิด">✕</button>
        </div>

        <div class="drawer-body">

          <div class="card">
            <div class="card-head"><h2>สถานะสัญญา</h2><div class="spacer"></div>${statusBadge(d.status)}</div>
            <div class="timeline-bar">
              <div class="timeline-fill" style="width:${pct.toFixed(1)}%;background:${barColor}"></div>
            </div>
            <div class="cell-mute">
              ${fmtDate(d.startDate)} → ${fmtDate(d.endDate)}
              · คงเหลือ ${d.daysToExpire === null ? 'ไม่ระบุ' : fmtNum(d.daysToExpire) + ' วัน'}
              · ${alertText(d.alert)}
            </div>
            ${d.noticeDeadline ? `
              <div class="notice-line" style="color:${barColor}">
                ต้องทำหนังสือแจ้งเตือนภายใน ${fmtDate(d.noticeDeadline)}
                ${d.noticeSource === 'calc' ? `(คำนวณจากแจ้งล่วงหน้า ${d.noticeDays} วัน)` : '(ตามชีต)'}
              </div>` : ''}
          </div>

          <div class="card">
            <div class="card-head"><h2>รายละเอียดสัญญา</h2></div>
            <dl class="spec">
              ${row('Media Type', d.mediaType)}
              ${row('Media Site', d.mediaSite)}
              ${row('Code ป้าย', d.code)}
              ${row('Asset Code', d.siteCode)}
              ${row('เลขที่สัญญา', d.contractNo)}
              ${row('บริษัท', d.company)}
              ${row('คู่สัญญา', d.counterparty)}
              ${row('จังหวัด', d.province)}
              ${row('ระยะสัญญา', d.duration)}
              ${row('วันเริ่มต้น', fmtDate(d.startDate))}
              ${row('วันสิ้นสุด', fmtDate(d.endDate))}
            </dl>
          </div>

          <div class="card">
            <div class="card-head"><h2>เงื่อนไขทางการเงิน</h2></div>
            <dl class="spec">
              ${row('Business Model', d.businessModel)}
              ${row('Cost Type', d.costType)}
              ${row('เงื่อนไขการชำระ', d.paymentTerm)}
              ${row('กำหนดชำระ', d.paymentDue)}
              ${row('%Rev Share', revShare)}
              ${row('ประเภทหลักประกัน', d.collateralType)}
              ${row('มูลค่าหลักประกัน', d.collateralValue ? fmtNum(d.collateralValue) + ' บาท' : '-')}
            </dl>
          </div>

          <div class="card">
            <div class="card-head"><h2>ความรับผิดชอบค่าใช้จ่าย</h2></div>
            <div class="resp-grid">
              ${resp.map(r => `
                <div class="resp-item">
                  <div class="k">${esc(r.label)}</div>
                  <div class="v ${this.respClass(r.value)}">${esc(r.value)}</div>
                </div>`).join('')}
            </div>
          </div>

          <div class="card">
            <div class="card-head"><h2>เงื่อนไขการต่อ / สิ้นสุดสัญญา</h2></div>
            <dl class="spec">
              ${row('เงื่อนไขการต่อสัญญา', /^\d+$/.test(d.renewCondition) ? `แจ้งล่วงหน้า ${d.renewCondition} วัน` : d.renewCondition)}
              ${row('วันที่ต้องทำหนังสือแจ้งเตือน', d.noticeDeadline ? fmtDate(d.noticeDeadline) : '')}
              ${row('เงื่อนไขสิ้นสุดสัญญา', d.endCondition)}
              ${row('ระยะเวลารื้อถอน', d.removalPeriod)}
              ${row('เงื่อนไขการเข้าพื้นที่', d.accessCondition)}
              ${row('สถานะการต่อสัญญา', d.renewStatus)}
              ${row('สถานะเอกสาร', d.docStatus)}
            </dl>
          </div>

        </div>
      </div>
    </div>`;

    $('btnCloseDetail').addEventListener('click', () => this.closeDetail());
    $('btnPrintDetail').addEventListener('click', () => window.print());
    if ($('btnEditDetail')) $('btnEditDetail').addEventListener('click', () => Editor.open(d));
    $('drawerMask').addEventListener('click', e => {
      if (e.target.id === 'drawerMask') this.closeDetail();
    });
  }
};
