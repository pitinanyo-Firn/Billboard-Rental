/* ============================================================
   PLAN B — CONTRACT RENTAL HUB  |  js/dashboard.js
   KPI cards + Chart.js 5 ชุด
   ============================================================ */

const Dashboard = {

  charts: {},

  /** วาดใหม่ทั้งหน้า (เรียกหลังโหลดข้อมูลสำเร็จ) */
  render() {
    this.renderKPI();
    this.renderExpiringByMedia();
    this.renderNoticeSoon();
    this.renderCharts();
  },

  /* ---------- สเปกข้อ 1: สัญญาที่จะหมดใน 12 เดือนข้างหน้า แยกตามประเภทสื่อ ---------- */
  renderExpiringByMedia() {
    const rows = Store.data.charts.expiringByMedia || [];
    const total = rows.reduce((s, r) => s + r.value, 0);
    const now = new Date();
    const end = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
    const th = d => d.toLocaleDateString('th-TH-u-ca-gregory', { month: 'short', year: 'numeric' });
    $('expiringRange').textContent = `${th(now)} – ${th(end)}`;

    $('expiringByMedia').innerHTML = rows.map(r => `
      <tr class="${r.value ? '' : 'zero'}">
        <td>${esc(r.label)}</td>
        <td class="num">${r.value}</td>
      </tr>`).join('') + `
      <tr><td class="cell-strong">รวม</td><td class="num cell-strong">${total}</td></tr>`;
  },

  /* ---------- หนังสือแจ้งเตือนที่ใกล้ถึงกำหนด (ตารางเต็มอยู่แท็บ "หนังสือแจ้งเตือน") ---------- */
  renderNoticeSoon() {
    const rows = Store.data.contracts
      .filter(d => d.status !== 'Write Off' && d.noticeDeadline && d.daysToExpire !== null && d.daysToExpire >= 0 &&
                   !Notice.isDone(d))
      .sort((a, b) => a.daysToNotice - b.daysToNotice)
      .slice(0, 10);

    const tb = $('noticeSoon');
    if (!rows.length) {
      tb.innerHTML = '<tr><td colspan="3"><div class="empty">ไม่มีหนังสือที่ต้องทำ</div></td></tr>';
      return;
    }
    tb.innerHTML = rows.map(d => `
      <tr data-id="${d.id}" class="clickable">
        <td>${alertDot(d.daysToNotice < 0 ? 'critical' : d.daysToNotice <= 30 ? 'warning' : 'normal')}${fmtDate(d.noticeDeadline)}</td>
        <td class="cell-strong">${esc(d.contractNo || '-')}<div class="cell-mute">${esc(d.mediaSite)}</div></td>
        <td class="num">${d.daysToNotice < 0 ? '<span class="neg">เลยกำหนด</span>' : d.daysToNotice}</td>
      </tr>`).join('');
    tb.querySelectorAll('tr[data-id]').forEach(tr => {
      tr.addEventListener('click', () => Contracts.openDetail(tr.dataset.id));
    });
  },

  /* ---------- KPI ---------- */
  renderKPI() {
    const k = Store.data.kpi;
    const days = Store.data.alertDays;

    const cards = [
      ['k-total',  'สัญญาทั้งหมด',        fmtNum(k.total),      'รายการในระบบ'],
      ['k-warn',   'จะหมดใน 12 เดือน',     fmtNum(k.expiring12m), 'ไม่รวม Write Off'],
      ['k-active', 'Active',              fmtNum(k.active),     'สัญญาที่มีผลบังคับใช้'],
      ['k-new',    'New',                 fmtNum(k.isNew),      'สัญญาใหม่ / รอเริ่ม'],
      ['k-warn',   'ใกล้หมดอายุ',          fmtNum(k.expiring),   `ภายใน ${days} วัน`],
      ['k-crit',   'หมดอายุแล้ว',          fmtNum(k.expired),    'ต้องเร่งดำเนินการ'],
      ['k-off',    'Write Off',           fmtNum(k.writeOff),   'ยุติสัญญาแล้ว'],
      ['k-new',    'Change to LED',       fmtNum(k.changeLED),  'อยู่ระหว่างเปลี่ยนสื่อ'],
      ['k-total',  'มูลค่าหลักประกันรวม', fmtNum(k.collateral), 'บาท']
    ];

    $('kpiGrid').innerHTML = cards.map(c => `
      <div class="kpi ${c[0]}">
        <div class="label">${c[1]}</div>
        <div class="value">${c[2] === '-' ? '0' : c[2]}</div>
        <div class="foot">${c[3]}</div>
      </div>`).join('');
  },

  /* ---------- Charts ---------- */
  mk(id, cfg) {
    if (this.charts[id]) this.charts[id].destroy();
    this.charts[id] = new Chart($(id).getContext('2d'), cfg);
  },

  renderCharts() {
    const c = Store.data.charts;
    const base = { responsive: true, maintainAspectRatio: false };
    const labels = arr => arr.map(d => d.label);
    const values = arr => arr.map(d => d.value);

    // 1) สถานะสัญญา — doughnut
    this.mk('chStatus', {
      type: 'doughnut',
      data: {
        labels: labels(c.byStatus),
        datasets: [{
          data: values(c.byStatus),
          backgroundColor: CONFIG.PALETTE,
          borderWidth: 2, borderColor: '#fff'
        }]
      },
      options: { ...base, cutout: '62%',
        plugins: { legend: { position: 'right', labels: { boxWidth: 12, font: { size: 12 } } } } }
    });

    // 2) ประเภทสื่อ — horizontal bar
    this.mk('chMedia', {
      type: 'bar',
      data: {
        labels: labels(c.byMediaType),
        datasets: [{ data: values(c.byMediaType), backgroundColor: '#E4002B',
                     borderRadius: 5, maxBarThickness: 22 }]
      },
      options: { ...base, indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: '#F1F5F9' }, ticks: { precision: 0 } },
          y: { grid: { display: false }, ticks: { font: { size: 11.5 } } }
        } }
    });

    // 3) ไทม์ไลน์หมดอายุ — bar
    this.mk('chTimeline', {
      type: 'bar',
      data: {
        labels: labels(c.timeline),
        datasets: [{ label: 'สัญญาหมดอายุ', data: values(c.timeline),
                     backgroundColor: '#D97706', borderRadius: 5, maxBarThickness: 36 }]
      },
      options: { ...base,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, grid: { color: '#F1F5F9' }, ticks: { precision: 0 } },
          x: { grid: { display: false } }
        } }
    });

    // 4) บริษัท — doughnut
    this.mk('chCompany', {
      type: 'doughnut',
      data: {
        labels: labels(c.byCompany),
        datasets: [{ data: values(c.byCompany), backgroundColor: CONFIG.PALETTE,
                     borderWidth: 2, borderColor: '#fff' }]
      },
      options: { ...base, cutout: '55%',
        plugins: { legend: { position: 'right', labels: { boxWidth: 12, font: { size: 12 } } } } }
    });

    // 5) จังหวัด — horizontal bar
    this.mk('chProvince', {
      type: 'bar',
      data: {
        labels: labels(c.byProvince),
        datasets: [{ data: values(c.byProvince), backgroundColor: '#2563EB',
                     borderRadius: 5, maxBarThickness: 24 }]
      },
      options: { ...base, indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: '#F1F5F9' }, ticks: { precision: 0 } },
          y: { grid: { display: false } }
        } }
    });
  }
};
