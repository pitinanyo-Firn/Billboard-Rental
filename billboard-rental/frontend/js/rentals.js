/* ============================================================
   PLAN B — BILLBOARD RENTAL HUB  |  js/rentals.js
   ทะเบียนค่าเช่า (ตาราง + ตัวกรอง) · หน้ารายละเอียด (drawer)
   ============================================================ */

const Rentals = {

  FILTER_IDS: ['q', 'fCompany', 'fMedia', 'fPayment', 'fStatus', 'fRent', 'fAlert'],

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
    fill('fCompany', f.company);
    fill('fMedia',   f.mediaType);
    fill('fPayment', f.payment);
    fill('fStatus',  f.payStatus);
    fill('fRent',    f.rent);
  },

  resetFilter() {
    this.FILTER_IDS.forEach(id => { $(id).value = ''; });
    this.applyFilter();
  },

  /** ตั้งตัวกรองจากที่อื่น (เช่น คลิกจาก Dashboard) แล้วเปิดแท็บนี้ */
  filterBy(id, value) {
    this.resetFilter();
    $(id).value = value;
    this.applyFilter();
    App.switchTab('rentals');
  },

  applyFilter() {
    if (!Store.data) return;

    const q  = $('q').value.trim().toLowerCase();
    const v  = id => $(id).value;
    const co = v('fCompany'), md = v('fMedia'), pm = v('fPayment'),
          st = v('fStatus'),  rt = v('fRent'),  al = v('fAlert');

    Store.viewRows = Store.data.rentals.filter(d => {
      if (co && d.company   !== co) return false;
      if (md && d.mediaType !== md) return false;
      if (pm && d.payment   !== pm) return false;
      if (st && d.payStatus !== st) return false;
      if (rt && d.rent      !== rt) return false;
      if (al && d.payAlert  !== al) return false;
      if (q) {
        const hay = [d.contractNo, d.vendorName, d.vendorNo, d.mediaSite, d.partDesc, d.epicoreCode,
                     d.pr, d.po, d.memoInv, d.ecmNo, d.company].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    this.renderTable();
  },

  /* ------------------------------------------------------------
     ตารางทะเบียนค่าเช่า
     ---------------------------------------------------------- */
  renderTable() {
    const rows = Store.viewRows;
    $('rowCount').textContent = `แสดง ${rows.length} จาก ${Store.data.rentals.length} รายการ`;

    const tb = $('tbody');
    if (!rows.length) {
      tb.innerHTML = '<tr><td colspan="10"><div class="empty">ไม่พบรายการที่ตรงกับเงื่อนไข</div></td></tr>';
      return;
    }

    tb.innerHTML = rows.map(d => `
      <tr data-id="${d.id}">
        <td class="cell-strong">${alertDot(d.payAlert)}${esc(d.contractNo || '-')}${d.issues.length ? ' <span class="lv lv-' + Quality.worst(d) + '" title="มีปัญหาข้อมูล">!</span>' : ''}</td>
        <td>${esc(d.vendorName)}<div class="cell-mute">${esc(d.company)} · ${esc(d.rent)}</div></td>
        <td>${esc(d.mediaType)}</td>
        <td>${esc(d.mediaSite)}</td>
        <td>${esc(d.payment)}<div class="cell-mute">${esc(d.month)}</div></td>
        <td class="num">${fmtMoney(d.monthlyCost)}</td>
        <td>${fmtDate(d.dueDate)}</td>
        <td class="num">${d.payKind === 'due' ? fmtDays(d.daysToPay) : '-'}</td>
        <td>${statusBadge(d.payStatus)}</td>
        <td>${fmtDate(d.endDate)}${d.expireAlert === 'expired' || d.expireAlert === 'warning'
              ? `<div class="cell-mute">${alertDot(d.expireAlert)}${CONFIG.EXPIRE_LABEL[d.expireAlert]}</div>` : ''}</td>
      </tr>`).join('');

    tb.querySelectorAll('tr[data-id]').forEach(tr => {
      tr.addEventListener('click', () => this.openDetail(tr.dataset.id));
    });
  },

  /* ------------------------------------------------------------
     หน้ารายละเอียด (drawer)
     ---------------------------------------------------------- */
  async openDetail(id) {
    const r = await apiGuarded('getRental', { id });
    if (r) this.drawDetail(r.rental, r.payments, r.receipts, r.cycles || []);
  },

  closeDetail() {
    if (!$('drawerHost').innerHTML) return;
    if (Editor.isOpen && Editor.dirty() && !confirm('มีข้อมูลที่แก้ไขแต่ยังไม่ได้บันทึก — ปิดโดยไม่บันทึก?')) return;
    Editor.isOpen = false;
    $('drawerHost').innerHTML = '';
  },

  drawDetail(d, payments, receipts, cycles = []) {
    // แถบความคืบหน้าอายุสัญญา
    let pct = 0;
    if (d.startDate && d.endDate) {
      const s = new Date(d.startDate), e = new Date(d.endDate), n = new Date();
      pct = Math.max(0, Math.min(100, (n - s) / (e - s) * 100));
    }
    const barColor = { normal: '#059669', warning: '#D97706', expired: '#DC2626', unknown: '#94A3B8' }[d.expireAlert] || '#059669';
    const payColor = { overdue: '#7F1D1D', due3: '#DC2626', soon: '#D97706' }[d.payAlert] || '#059669';

    const row = (k, v) => `<dt>${esc(k)}</dt><dd>${esc(v || '-')}</dd>`;
    const dateRow = (k, f) => `<dt>${esc(k)}</dt><dd>${d[f] ? fmtDate(d[f]) : esc(d[f + 'Text'] || '-')}</dd>`;
    const admin = Store.isAdmin();

    $('drawerHost').innerHTML = `
    <div class="drawer-mask" id="drawerMask">
      <div class="drawer">

        <div class="drawer-head">
          <div>
            <h2>${esc(d.mediaSite || '-')}</h2>
            <div class="sub">${esc(d.contractNo || '-')} · ${esc(d.vendorName || '-')} · ${esc(d.mediaType || '-')} · แถว ${d._row}</div>
          </div>
          <div class="spacer"></div>
          ${admin ? '<button class="btn btn-ghost btn-sm" id="btnPayDetail" title="บันทึกการเบิกจ่ายรายการนี้">💸 บันทึกจ่าย</button>' : ''}
          ${admin ? '<button class="btn btn-ghost btn-sm" id="btnEditDetail" title="แก้ไขข้อมูล">✎ แก้ไข</button>' : ''}
          <button class="icon-btn" id="btnPrintDetail" title="พิมพ์">⎙</button>
          <button class="icon-btn" id="btnCloseDetail" title="ปิด">✕</button>
        </div>

        <div class="drawer-body">

          ${d.issues.length ? `
          <div class="card">
            <div class="card-head"><h2>ข้อมูลที่ต้องตรวจ (${d.issues.length})</h2></div>
            <ul class="issue-list">
              ${d.issues.map(i => `<li><span class="lv lv-${i.level}">${CONFIG.LEVEL_LABEL[i.level]}</span>
                <span><b>${esc(CONFIG.FIELD_LABEL[i.field] || i.field)}</b> — ${esc(i.msg)}${i.fix ? ` → <span class="fix-to">${esc(i.fix)}</span>` : ''}</span></li>`).join('')}
            </ul>
          </div>` : ''}

          <div class="card">
            <div class="card-head"><h2>การจ่ายรอบ ${esc(d.month || '-')}</h2><div class="spacer"></div>${statusBadge(d.payStatus)}</div>
            ${d.payDate ? `<div class="notice-line" style="color:${payColor};margin-top:0">
                ${d.payKind === 'cheque' ? 'เช็คลงวันที่' : 'ครบกำหนดชำระ'} ${fmtDate(d.payDate)}
                · ${d.daysToPay < 0 ? 'เลยมา ' + (-d.daysToPay) + ' วัน' : d.daysToPay === 0 ? 'วันนี้' : 'อีก ' + d.daysToPay + ' วัน'}
              </div>` : ''}
            <dl class="spec" style="margin-top:10px">
              ${row('รูปแบบการจ่าย', d.payment)}
              ${row('Payment term', d.paymentTerm)}
              ${row('Amount/Month', fmtMoney(d.amountMonth))}
              ${row('Amount/Year', fmtMoney(d.amountYear))}
              ${row('Up or CN', d.adjust ? fmtMoney(d.adjust) : '')}
              ${row('ค่าเช่าเดือนนี้', fmtMoney(d.installment) + ' บาท')}
              ${row('ค่าเช่าต่อปี', fmtMoney(d.annualCost) + ' บาท')}
              ${dateRow('ว/ด/ป ชำระตามสัญญา', 'dueDate')}
              ${row('รอบการจ่าย', (d.periodStart || d.periodEnd) ? fmtDate(d.periodStart) + ' – ' + fmtDate(d.periodEnd) : '')}
              ${row('รอบจ่ายตามเอกสาร', d.docPeriod)}
              ${dateRow('เช็คลงวันที่', 'chequeDate')}
            </dl>
          </div>

          <div class="card">
            <div class="card-head"><h2>เอกสารเบิกจ่าย</h2></div>
            <dl class="spec">
              ${row('รูปแบบ', d.docType)}
              ${dateRow('วันที่ส่งจัดซื้อ', 'sentDate')}
              ${row('PR', d.pr)}
              ${row('PO', d.po)}
              ${row('MEMO/INV No.', d.memoInv)}
              ${dateRow('Send ECM', 'ecmSent')}
              ${row('ECM No.', d.ecmNo)}
              ${row('Remark', d.remark)}
            </dl>
          </div>

          <div class="card">
            <div class="card-head"><h2>สัญญา</h2><div class="spacer"></div><span class="badge b-off">${esc(d.contractStatus || '-')}</span></div>
            <div class="timeline-bar">
              <div class="timeline-fill" style="width:${pct.toFixed(1)}%;background:${barColor}"></div>
            </div>
            <div class="cell-mute">
              ${fmtDate(d.startDate)} → ${fmtDate(d.endDate)}
              · คงเหลือ ${d.daysToExpire === null ? 'ไม่ระบุ' : fmtNum(d.daysToExpire) + ' วัน'}
              · ${CONFIG.EXPIRE_LABEL[d.expireAlert]}
            </div>
            <dl class="spec" style="margin-top:10px">
              ${row('เลขที่สัญญา', d.contractNo)}
              ${row('Company', d.company)}
              ${row('Rent', d.rent)}
              ${row('Vendor No. / ชื่อ', (d.vendorNo ? d.vendorNo + ' · ' : '') + d.vendorName)}
              ${row('Media Type', d.mediaType)}
              ${row('Media Site', d.mediaSite)}
              ${row('Epicore Code', d.epicoreCode)}
              ${row('Part Code', d.partCode)}
              ${row('Part Description', d.partDesc)}
              ${row('Period', d.period)}
              ${dateRow('Start Contract', 'startDate')}
              ${dateRow('End Contract', 'endDate')}
            </dl>
          </div>

          ${cycles.length > 1 ? `
          <div class="card">
            <div class="card-head"><h2>รอบรายเดือนของรายการนี้ (${cycles.length})</h2><div class="spacer"></div>
              <span class="cell-mute">คลิกแถวเพื่อเปิดรอบนั้น</span></div>
            <div class="table-wrap"><table class="compact">
              <thead><tr><th>รอบ</th><th>ชำระตามสัญญา</th><th>เช็คลงวันที่</th><th class="num">ยอด (บาท)</th><th>Status Payment</th><th>MEMO/INV · ECM</th></tr></thead>
              <tbody>${cycles.map(c => `
                <tr data-cycle="${c.id}" class="clickable ${c.id === d.id ? 'sel' : ''}">
                  <td class="cell-strong">${esc(c.month || '-')}${c.issues ? ' <span class="lv lv-medium" title="มีปัญหาข้อมูล">!</span>' : ''}</td>
                  <td>${fmtDate(c.dueDate)}</td>
                  <td>${fmtDate(c.chequeDate)}</td>
                  <td class="num">${fmtMoney(c.installment)}</td>
                  <td>${statusBadge(c.payStatus)}</td>
                  <td class="cell-mute">${esc([c.memoInv, c.ecmNo].filter(Boolean).join(' · ') || '-')}</td>
                </tr>`).join('')}</tbody>
            </table></div>
          </div>` : ''}

          <div class="card">
            <div class="card-head"><h2>ประวัติการเบิกจ่าย (${payments.length})</h2></div>
            ${payments.length ? `<div class="table-wrap"><table class="compact">
              <thead><tr><th>วันที่บันทึก</th><th>รอบดิว</th><th class="num">ต้องจ่าย</th><th class="num">จ่ายจริง</th><th>หมายเหตุ</th></tr></thead>
              <tbody>${payments.map(p => `<tr><td>${esc(p.timestamp)}</td><td>${esc(p.month)}${p.dup ? '<span class="dup-tag">ซ้ำ</span>' : ''}</td>
                <td class="num">${fmtMoney(p.expected)}</td><td class="num">${fmtMoney(p.actual)}</td><td>${esc(p.remark)}</td></tr>`).join('')}</tbody>
            </table></div>` : '<div class="cell-mute">ยังไม่มีการบันทึกจ่าย</div>'}
            ${receipts.length ? `<div class="cell-mute" style="margin-top:10px">ใบเสร็จ: ${receipts.map(r => esc(r.status)).join(' · ')}</div>` : ''}
          </div>

        </div>
      </div>
    </div>`;

    document.querySelectorAll('tr[data-cycle]').forEach(tr => {
      tr.addEventListener('click', () => { if (tr.dataset.cycle !== d.id) this.openDetail(tr.dataset.cycle); });
    });
    $('btnCloseDetail').addEventListener('click', () => this.closeDetail());
    $('btnPrintDetail').addEventListener('click', () => window.print());
    if ($('btnEditDetail')) $('btnEditDetail').addEventListener('click', () => Editor.open(d));
    if ($('btnPayDetail')) $('btnPayDetail').addEventListener('click', () => { this.closeDetail(); Payments.prefill(d.id); });
    $('drawerMask').addEventListener('click', e => {
      if (e.target.id === 'drawerMask') this.closeDetail();
    });
  }
};
