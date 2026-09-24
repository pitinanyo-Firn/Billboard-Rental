/* ============================================================
   PLAN B — BILLBOARD RENTAL HUB  |  js/dashboard.js
   KPI cards + ตารางสรุป + Chart.js 5 ชุด
   ============================================================ */

const Dashboard = {

  charts: {},

  /** วาดใหม่ทั้งหน้า (เรียกหลังโหลดข้อมูลสำเร็จ) */
  render() {
    this.renderKPI();
    this.renderCostByMedia();
    this.renderDueSoon();
    this.renderCharts();
  },

  /* ---------- ค่าเช่าต่อปีตามประเภทสื่อ ---------- */
  renderCostByMedia() {
    const rows = Store.data.charts.costByMedia || [];
    const sum = k => rows.reduce((s, r) => s + r[k], 0);
    $('costByMedia').innerHTML = rows.map(r => `
      <tr class="${r.count ? '' : 'zero'}">
        <td>${esc(r.label)}</td>
        <td class="num">${r.count}</td>
        <td class="num">${r.count ? `<span class="ok-text">${r.paid}</span> / <span class="warn-text">${r.wait}</span>` : '-'}</td>
        <td class="num">${fmtMoney(r.value)}</td>
      </tr>`).join('') + `
      <tr><td class="cell-strong">รวม</td><td class="num cell-strong">${sum('count')}</td>
          <td class="num cell-strong">${sum('paid')} / ${sum('wait')}</td>
          <td class="num cell-strong">${fmtMoney(sum('value'))}</td></tr>`;
  },

  /* ---------- ครบกำหนดจ่ายเร็ว ๆ นี้ (ตารางเต็มอยู่แท็บ "ครบกำหนดจ่าย") ---------- */
  renderDueSoon() {
    const rows = Due.rows().slice(0, 10);
    const tb = $('dueSoon');
    if (!rows.length) {
      tb.innerHTML = '<tr><td colspan="3"><div class="empty">ไม่มีรายการครบกำหนดจ่าย</div></td></tr>';
      return;
    }
    tb.innerHTML = rows.map(d => `
      <tr data-id="${d.id}" class="clickable">
        <td>${alertDot(d.payAlert)}${fmtDate(d.payDate)}
          <div class="cell-mute">${d.daysToPay < 0 ? `<span class="neg">เลยมา ${-d.daysToPay} วัน</span>` : d.daysToPay === 0 ? 'วันนี้' : `อีก ${d.daysToPay} วัน`}</div></td>
        <td class="cell-strong">${esc(d.vendorName || '-')}<div class="cell-mute">${esc(d.mediaSite)}</div></td>
        <td class="num">${fmtMoney(d.amount)}</td>
      </tr>`).join('');
    tb.querySelectorAll('tr[data-id]').forEach(tr => {
      tr.addEventListener('click', () => Rentals.openDetail(tr.dataset.id));
    });
  },

  /* ---------- KPI ---------- */
  renderKPI() {
    const k = Store.data.kpi;
    const cards = [
      ['k-total',  'รายการค่าเช่า',          fmtNum(k.total),        `${fmtNum(k.contracts)} สัญญา · ${fmtNum(k.rows)} แถวรายเดือน`],
      ['k-total',  'ค่าเช่าต่อเดือน',         fmtNum(k.monthlyCost),  k.monthLabel ? `บาท · รอบ ${k.monthLabel}` : 'บาท (เฉลี่ยทั้งปี)'],
      ['k-new',    'ค่าเช่าต่อปี',            fmtNum(k.annualCost),   'บาท (รวมทั้งปีตามชีต)'],
      ['k-active', 'เบิกแล้ว',               fmtNum(k.paid),         'แถวรายเดือน'],
      ['k-warn',   'รอเบิก',                 fmtNum(k.waiting),      'แถวรายเดือน'],
      ['k-crit',   'เลยกำหนดจ่าย',           fmtNum(k.overdue),      'งวดที่ยังไม่เบิก'],
      ['k-warn',   'ครบกำหนดใน ' + Store.data.dueSoonDays + ' วัน', fmtNum(k.dueSoon), `${fmtMoney(k.dueAmount)} บาท รวมที่เลยกำหนด`],
      ['k-warn',   'สัญญาใกล้หมดอายุ',        fmtNum(k.expiring),     `รายการ · ภายใน ${Store.data.expireDays} วัน`],
      ['k-off',    'ใบเสร็จที่ยังไม่ได้รับ',   fmtNum(k.receiptWait),  'Receipt_Tracking'],
      ['k-crit',   'ข้อมูลที่ต้องตรวจ',        fmtNum(k.issues),       'แถวใน Contract_Master']
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
    const baht = { callback: v => Number(v).toLocaleString('th-TH') };
    const monthLabel = ym => {
      const [y, m] = ym.split('-');
      return new Date(+y, +m - 1, 1).toLocaleDateString('th-TH-u-ca-gregory', { month: 'short', year: '2-digit' });
    };
    const tipBaht = { callbacks: { label: ctx => ' ' + fmtMoney(ctx.parsed.y ?? ctx.parsed.x ?? ctx.parsed) + ' บาท' } };

    // 1) ประมาณการ 12 เดือน — bar
    this.mk('chForecast', {
      type: 'bar',
      data: {
        labels: c.forecast.map(d => monthLabel(d.label)),
        datasets: [{ data: values(c.forecast), backgroundColor: '#E4002B', borderRadius: 5, maxBarThickness: 36 }]
      },
      options: { ...base,
        plugins: { legend: { display: false }, tooltip: tipBaht },
        scales: {
          y: { beginAtZero: true, grid: { color: '#F1F5F9' }, ticks: baht },
          x: { grid: { display: false } }
        } }
    });

    // 2) สถานะการเบิกตามประเภทสื่อ — stacked horizontal bar
    const media = c.costByMedia.filter(r => r.count);
    this.mk('chStatus', {
      type: 'bar',
      data: {
        labels: labels(media),
        datasets: [
          { label: 'เบิกแล้ว', data: media.map(r => r.paid), backgroundColor: '#059669', borderRadius: 4, maxBarThickness: 22 },
          { label: 'รอเบิก',  data: media.map(r => r.wait), backgroundColor: '#D97706', borderRadius: 4, maxBarThickness: 22 }
        ]
      },
      options: { ...base, indexAxis: 'y',
        plugins: { legend: { position: 'top', labels: { boxWidth: 12 } } },
        scales: {
          x: { stacked: true, grid: { color: '#F1F5F9' }, ticks: { precision: 0 } },
          y: { stacked: true, grid: { display: false }, ticks: { font: { size: 11.5 } } }
        } }
    });

    // 3) บริษัท — doughnut
    const pie = (id, arr) => this.mk(id, {
      type: 'doughnut',
      data: {
        labels: labels(arr),
        datasets: [{ data: values(arr), backgroundColor: CONFIG.PALETTE, borderWidth: 2, borderColor: '#fff' }]
      },
      options: { ...base, cutout: '58%',
        plugins: {
          legend: { position: 'right', labels: { boxWidth: 12, font: { size: 12 } } },
          tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${fmtMoney(ctx.parsed)} บาท` } }
        } }
    });
    pie('chCompany', c.byCompany);

    // 4) External vs Inter-Co — doughnut
    pie('chRent', c.byRent);

    // 5) สัญญาหมดอายุ — bar
    this.mk('chExpiry', {
      type: 'bar',
      data: {
        labels: c.expiry.map(d => monthLabel(d.label)),
        datasets: [{ label: 'สัญญาหมดอายุ', data: values(c.expiry), backgroundColor: '#2563EB', borderRadius: 5, maxBarThickness: 32 }]
      },
      options: { ...base,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, grid: { color: '#F1F5F9' }, ticks: { precision: 0 } },
          x: { grid: { display: false } }
        } }
    });
  }
};
