/* ============================================================
   PLAN B — BILLBOARD RENTAL HUB  |  js/accrued.js
   Accrued ประจำเดือน (ส่งแผนกบัญชีทุกวันที่ 23)
   Accrued = เดือนนี้มีค่าใช้จ่ายเกิดขึ้นแล้วตาม Service Month แต่ยังไม่มี Transaction
   ข้อมูลอยู่ในชีต Accrued (backend/Accrued.gs) · ซิงก์กับชีตผ่าน getDashboard + Sync
   Export เป็น .xlsx หน้าตาเดียวกับ Form Accrued (STT-BB-BUS-OTHER) ของบัญชี
   ============================================================ */

const Accrued = {

  HEAD: ['Line', 'Company', 'Department', 'VENDOR', 'Part Code', 'Part Description', 'Description & Period',
         'Amount (ก่อน VAT)', 'Media Site Code', 'Media Site Name', 'ถึงบัญชี', 'หมายเหตุ', 'Email ผู้ส่งข้อมูล'],
  FIELDS: ['line', 'company', 'department', 'vendor', 'partCode', 'partDesc', 'desc',
           'amount', 'siteCode', 'siteName', 'toAccount', 'note', 'email'],
  WIDTHS: [7.09, 10.82, 24.36, 43, 18, 53.73, 88.45, 18.18, 21.64, 48.55, 30.18, 78.55, 25.36],
  AMOUNT_FMT: '_-* #,##0.00_-;-* #,##0.00_-;_-* "-"??_-;_-@_-',
  EXCELJS: 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js',
  DEFAULTS: { company: 'PB', department: 'BD & Asset Management', toAccount: 'ponprom.ch@planbmedia.co.th' },
  MON3: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  TH_MONTH: ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
             'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'],
  TH_MON: ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'],

  month: null,          // 'yyyy-MM' ที่เลือก ('' = ทุกเดือน)
  editing: null,        // รายการที่กำลังแก้ (null = เพิ่มใหม่)
  suggest: [],

  init() {
    $('acMonth').addEventListener('change', () => { this.month = $('acMonth').value; this.closeSuggest(); this.render(); });
    $('acSearch').addEventListener('input', () => this.renderTable());
    $('btnAcAdd').addEventListener('click', () => this.openForm(null));
    $('btnAcCancel').addEventListener('click', () => this.closeForm());
    $('btnAcExport').addEventListener('click', () => this.exportExcel());
    $('btnAcSuggest').addEventListener('click', () => this.openSuggest());
    $('btnAcSugClose').addEventListener('click', () => this.closeSuggest());
    $('btnAcSugAdd').addEventListener('click', () => this.addSuggested());
    $('acSugAll').addEventListener('change', e => {
      $('acSuggestBody').querySelectorAll('.ac-sug').forEach(c => { c.checked = e.target.checked; });
    });
    $('acForm').addEventListener('submit', e => { e.preventDefault(); this.save(); });
    $('acPick').addEventListener('change', () => this.pickRental());
    $('acFMonth').addEventListener('change', () => this.fillPickList());
  },

  /* ---------- เดือน ---------- */
  thisMonth() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  },
  shiftMonth(key, n) {
    const d = new Date(+key.slice(0, 4), +key.slice(5, 7) - 1 + n, 1);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  },
  /** '2026-09' → 'Sep-26' (รูปแบบคอลัมน์ Month ใน Contract_Master) */
  label(key) { return key ? this.MON3[+key.slice(5, 7) - 1] + '-' + key.slice(2, 4) : ''; },
  /** '2026-09' → 'กันยายน 2569' */
  thaiLabel(key) { return this.TH_MONTH[+key.slice(5, 7) - 1] + ' ' + (+key.slice(0, 4) + 543); },
  /** ช่วงเวลาตาม Service Month เช่น '1-30 กันยายน 2569' */
  period(key) {
    const days = new Date(+key.slice(0, 4), +key.slice(5, 7), 0).getDate();
    return `1-${days} ${this.thaiLabel(key)}`;
  },

  list() { return (Store.data && Store.data.accrued) || []; },

  /* ---------- render ---------- */
  render() {
    const admin = Store.isAdmin();
    ['btnAcAdd', 'btnAcSuggest'].forEach(id => $(id).classList.toggle('hidden', !admin));
    if (!admin) { this.closeForm(); this.closeSuggest(); }

    // ตัวเลือกเดือน: เดือนที่มีข้อมูล + เดือนก่อน/เดือนนี้/เดือนหน้า
    const cur = this.thisMonth();
    const set = {};
    [this.shiftMonth(cur, -1), cur, this.shiftMonth(cur, 1)].forEach(k => { set[k] = 1; });
    this.list().forEach(a => { if (a.month) set[a.month] = 1; });
    if (this.month === null) this.month = cur;
    if (this.month) set[this.month] = 1;
    const months = Object.keys(set).sort().reverse();
    const count = k => this.list().filter(a => a.month === k).length;
    $('acMonth').innerHTML = `<option value="">ทุกเดือน (${this.list().length})</option>` +
      months.map(k => `<option value="${k}" ${k === this.month ? 'selected' : ''}>${this.label(k)} · ${this.thaiLabel(k)} (${count(k)})</option>`).join('');

    const nCur = count(cur);
    $('cntAccrued').textContent = nCur ? nCur : '';
    this.renderDue();
    this.renderTable();
    if (!$('acSuggestCard').classList.contains('hidden')) this.openSuggest();
  },

  /** กำหนดส่งบัญชีวันที่ 23 ของ Service Month ที่เลือก */
  renderDue() {
    const day = (Store.data && Store.data.accruedDay) || 23;
    const key = this.month || this.thisMonth();
    const due = new Date(+key.slice(0, 4), +key.slice(5, 7) - 1, day);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diff = Math.round((due - today) / 86400000);
    const txt = `📅 กำหนดส่งบัญชี ${day} ${this.TH_MON[due.getMonth()]} ${due.getFullYear() + 543}`;
    const el = $('acDue');
    el.className = 'ac-due' + (diff < 0 ? ' late' : diff <= 3 ? ' soon' : '');
    el.textContent = txt + (diff > 0 ? ` · อีก ${diff} วัน` : diff === 0 ? ' · วันนี้' : ` · ผ่านมาแล้ว ${-diff} วัน`);
  },

  /** รายการตามเดือน + คำค้นหา */
  rows() {
    const q = $('acSearch').value.trim().toLowerCase();
    return this.list().filter(a => {
      if (this.month && a.month !== this.month) return false;
      if (!q) return true;
      return [a.vendor, a.partCode, a.partDesc, a.desc, a.siteCode, a.siteName, a.note, a.email, a.company]
        .join(' ').toLowerCase().includes(q);
    });
  },

  money(n) { return (+n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); },

  renderTable() {
    const admin = Store.isAdmin();
    const rows = this.rows();
    const total = rows.reduce((s, a) => s + (+a.amount || 0), 0);
    $('acCount').textContent = `${rows.length} รายการ · รวม ${this.money(total)} บาท`;
    $('acSummary').textContent = this.month ? `Service Month ${this.label(this.month)} · ${rows.length} รายการ` : `ทุกเดือน · ${rows.length} รายการ`;

    const tb = $('acBody');
    if (!rows.length) {
      tb.innerHTML = `<tr><td colspan="14"><div class="empty">ยังไม่มีรายการ Accrued ${this.month ? 'ของ ' + this.label(this.month) : ''}${admin ? ' — กด “+ เพิ่มรายการ” หรือ “ดึงรายการที่ยังไม่มี Transaction”' : ''}</div></td></tr>`;
      $('acFoot').innerHTML = '';
      return;
    }
    let lastMonth = null;
    tb.innerHTML = rows.map(a => {
      const head = !this.month && a.month !== lastMonth
        ? `<tr class="ac-month-row"><td colspan="14">Service Month ${esc(a.monthLabel || '-')}${a.month ? ' · ' + this.thaiLabel(a.month) : ''}</td></tr>` : '';
      lastMonth = a.month;
      return head + `
      <tr data-id="${a.id}">
        <td class="num">${a.line || ''}</td>
        <td>${esc(a.company)}</td>
        <td>${esc(a.department)}</td>
        <td class="cell-strong">${esc(a.vendor)}</td>
        <td>${esc(a.partCode)}</td>
        <td>${esc(a.partDesc)}</td>
        <td class="ac-wrap">${esc(a.desc)}</td>
        <td class="num">${this.money(a.amount)}</td>
        <td>${esc(a.siteCode)}</td>
        <td>${esc(a.siteName)}</td>
        <td>${esc(a.toAccount)}</td>
        <td class="ac-wrap">${esc(a.note)}</td>
        <td>${esc(a.email)}<div class="cell-mute">${esc(a.ts || '')}</div></td>
        <td>${admin ? `<div class="rc-actions">
              <button class="icon-btn ac-edit" title="แก้ไข">✏️</button>
              <button class="icon-btn ac-del" title="ลบรายการ">🗑</button></div>` : ''}</td>
      </tr>`;
    }).join('');
    $('acFoot').innerHTML = `<tr><td colspan="7" class="num">รวม (ก่อน VAT)</td><td class="num">${this.money(total)}</td><td colspan="6"></td></tr>`;

    const find = el => this.list().find(a => a.id === el.closest('tr').dataset.id);
    tb.querySelectorAll('.ac-edit').forEach(b => b.addEventListener('click', () => this.openForm(find(b))));
    tb.querySelectorAll('.ac-del').forEach(b => b.addEventListener('click', () => this.remove(find(b))));
  },

  /* ---------- ฟอร์ม เพิ่ม / แก้ไข ---------- */
  formIds: { company: 'acCompany', department: 'acDepartment', vendor: 'acVendor', partCode: 'acPartCode',
             partDesc: 'acPartDesc', desc: 'acDesc', amount: 'acAmount', siteCode: 'acSiteCode',
             siteName: 'acSiteName', toAccount: 'acToAccount', note: 'acNote', email: 'acEmail' },

  showError(msg) {
    $('acError').textContent = msg || '';
    $('acError').classList.toggle('hidden', !msg);
  },

  openForm(item) {
    if (!Store.isAdmin()) return;
    this.editing = item;
    this.showError('');
    const me = (Store.profile || {}).email || '';
    const v = item || Object.assign({}, this.DEFAULTS, { email: /@/.test(me) ? me : '' });
    Object.keys(this.formIds).forEach(k => { $(this.formIds[k]).value = v[k] == null ? '' : v[k]; });
    $('acFMonth').value = item ? item.month : (this.month || this.thisMonth());
    $('acPick').value = '';
    $('acFormTitle').textContent = item ? `แก้ไขรายการ Accrued · Line ${item.line} (${item.monthLabel})` : 'เพิ่มรายการ Accrued';
    $('btnAcSave').textContent = item ? '💾 บันทึกการแก้ไข' : '💾 บันทึก';
    this.fillPickList();
    const vendors = [...new Set(((Store.data && Store.data.rentals) || []).map(d => d.vendorName).filter(Boolean))].sort();
    $('dlAcVendor').innerHTML = vendors.map(s => `<option value="${esc(s)}"></option>`).join('');
    $('acFormCard').classList.remove('hidden');
    $('acFormCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  closeForm() {
    this.editing = null;
    $('acFormCard').classList.add('hidden');
  },

  /** แถวค่าเช่าของ Service Month (ใช้ทั้งช่องค้นหาในฟอร์ม และรายการแนะนำ) */
  rentalsOf(key) {
    const lbl = this.label(key);
    return ((Store.data && Store.data.rentals) || []).filter(d => d.month === lbl);
  },

  rentalText(d) {
    return `${d.vendorName} · ${d.mediaSite}${d.partCode ? ' · ' + d.partCode : ''} · ${this.money(d.installment)} [${d.id}]`;
  },

  fillPickList() {
    const key = $('acFMonth').value || this.month || this.thisMonth();
    $('dlAcRentals').innerHTML = this.rentalsOf(key).map(d => `<option value="${esc(this.rentalText(d))}"></option>`).join('');
  },

  /** แปลงแถว Contract_Master → รายการ Accrued ตามรูปแบบ Form ของบัญชี */
  fromRental(d, key) {
    const site = d.mediaSite || '';
    const parts = String(d.partDesc || '').split(/\s*:\s*/);
    const partDesc = parts[0] || d.partDesc || '';
    let desc = String(d.partDesc || '').replace(/\s*:\s*/g, ' ').trim();
    if (site && !desc.includes(site)) desc += ' ' + site;
    desc += '  ' + this.period(key);
    const company = /^plan\s*b$/i.test(d.company || '') ? 'PB' : (d.company || this.DEFAULTS.company);
    const me = (Store.profile || {}).email || '';
    return {
      company, department: this.DEFAULTS.department, vendor: d.vendorName || '', partCode: d.partCode || '',
      partDesc, desc, amount: Math.round((+d.installment || +d.monthlyCost || 0) * 100) / 100,
      siteCode: d.epicoreCode || '', siteName: site, toAccount: this.DEFAULTS.toAccount,
      note: d.pr ? 'Ref. ' + d.pr : '', email: /@/.test(me) ? me : ''
    };
  },

  pickRental() {
    const m = $('acPick').value.match(/\[(R\d+)\]$/);
    if (!m) return;
    const d = ((Store.data && Store.data.rentals) || []).find(x => x.id === m[1]);
    if (!d) return;
    const v = this.fromRental(d, $('acFMonth').value || this.month || this.thisMonth());
    Object.keys(this.formIds).forEach(k => {
      if (k === 'email' && $(this.formIds[k]).value) return;   // คงอีเมลผู้ส่งที่กรอกไว้
      $(this.formIds[k]).value = v[k];
    });
    toast('ดึงข้อมูลจากทะเบียนค่าเช่าแล้ว — ตรวจ/แก้ไขก่อนบันทึก');
  },

  async save() {
    const f = {};
    Object.keys(this.formIds).forEach(k => { f[k] = $(this.formIds[k]).value.trim(); });
    const month = $('acFMonth').value;
    if (!month) return this.showError('กรุณาเลือก Service Month');
    if (!f.vendor) return this.showError('กรุณากรอก VENDOR');
    if (!f.desc) return this.showError('กรุณากรอก Description & Period');
    if (f.amount === '' || isNaN(+f.amount) || +f.amount === 0) return this.showError('กรุณากรอก Amount (ก่อน VAT)');
    this.showError('');

    const btn = $('btnAcSave');
    btn.disabled = true;
    const it = this.editing;
    const r = it
      ? await apiGuarded('updateAccrued', Object.assign({ id: it.id, origVendor: it.vendor, origMonth: it.month, month }, f))
      : await apiGuarded('addAccrued', { month, items: [f] });
    btn.disabled = false;
    if (!r) return;
    toast(it ? 'แก้ไขรายการ Accrued แล้ว' : 'เพิ่มรายการ Accrued แล้ว');
    this.month = month;
    this.closeForm();
    App.load(false, true);
  },

  async remove(a) {
    if (!a) return;
    if (!confirm(`ลบรายการ Accrued Line ${a.line} (${a.monthLabel})\n${a.vendor}\n${this.money(a.amount)} บาท ?`)) return;
    const r = await apiGuarded('deleteAccrued', { id: a.id, origVendor: a.vendor, origMonth: a.month });
    if (!r) return;
    toast('ลบรายการ Accrued แล้ว');
    if (this.editing && this.editing.id === a.id) this.closeForm();
    App.load(false, true);
  },

  /* ---------- รายการแนะนำ: ค่าเช่าของเดือนที่ยังไม่มี Transaction ---------- */
  openSuggest() {
    if (!Store.isAdmin()) return;
    const key = this.month || this.thisMonth();
    const paid = ['เบิกแล้ว', 'จ่ายแล้ว'];
    const have = this.list().filter(a => a.month === key);
    const norm = s => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const exists = d => have.some(a => norm(a.vendor) === norm(d.vendorName) &&
      ((a.siteName && norm(a.siteName) === norm(d.mediaSite)) || (a.siteCode && norm(a.siteCode) === norm(d.epicoreCode))));
    this.suggest = this.rentalsOf(key).filter(d => !paid.includes(d.payStatus) && (+d.installment || +d.monthlyCost) && !exists(d));

    $('acSuggestInfo').textContent = `Service Month ${this.label(key)} · ${this.suggest.length} รายการ`;
    $('acSugAll').checked = false;
    $('acSuggestBody').innerHTML = this.suggest.length ? this.suggest.map((d, i) => {
      const v = this.fromRental(d, key);
      return `<tr>
        <td><input type="checkbox" class="ac-sug" data-i="${i}"></td>
        <td class="cell-strong">${esc(d.vendorName)}</td>
        <td>${esc(d.mediaSite)}<div class="cell-mute">${esc(d.epicoreCode || '')}</div></td>
        <td>${esc(d.partCode || '-')}</td>
        <td class="ac-wrap">${esc(v.desc)}</td>
        <td>${esc(d.payment || '-')}</td>
        <td>${statusBadge(d.payStatus)}</td>
        <td class="num">${this.money(v.amount)}</td>
      </tr>`;
    }).join('') : '<tr><td colspan="8"><div class="empty">ไม่มีค่าเช่าของเดือนนี้ที่ค้างอยู่ — ทุกรายการมี Transaction แล้ว หรืออยู่ใน Accrued แล้ว</div></td></tr>';
    $('acSuggestCard').classList.remove('hidden');
  },

  closeSuggest() { $('acSuggestCard').classList.add('hidden'); },

  async addSuggested() {
    const key = this.month || this.thisMonth();
    const picked = [...$('acSuggestBody').querySelectorAll('.ac-sug:checked')].map(c => this.suggest[+c.dataset.i]);
    if (!picked.length) return toast('กรุณาติ๊กเลือกรายการก่อน');
    if (!confirm(`เพิ่ม ${picked.length} รายการเข้า Accrued ของ ${this.label(key)}?`)) return;
    const btn = $('btnAcSugAdd');
    btn.disabled = true;
    const r = await apiGuarded('addAccrued', { month: key, items: picked.map(d => this.fromRental(d, key)) });
    btn.disabled = false;
    if (!r) return;
    toast(`เพิ่ม ${r.added} รายการเข้า Accrued แล้ว`);
    this.month = key;
    this.closeSuggest();
    App.load(false, true);
  },

  /* ---------- Export Excel (หน้าตาเดียวกับ Form Accrued ของบัญชี) ---------- */
  loadExcelJS() {
    if (window.ExcelJS) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = this.EXCELJS;
      s.onload = resolve;
      s.onerror = () => reject(new Error('โหลดตัวสร้างไฟล์ Excel ไม่สำเร็จ'));
      document.head.appendChild(s);
    });
  },

  async exportExcel() {
    const rows = this.rows();
    if (!rows.length) return toast('ไม่มีรายการให้ Export');
    showLoader(true);
    try {
      await this.loadExcelJS();
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('STT-BB-BUS-OTHER');
      ws.columns = this.WIDTHS.map(w => ({ width: w }));
      const thin = { style: 'thin' };
      const border = { top: thin, left: thin, bottom: thin, right: thin };
      const font = { name: 'Calibri', size: 11 };

      const head = ws.addRow(this.HEAD);
      head.height = 23.5;
      head.eachCell(c => {
        c.font = Object.assign({ bold: true }, font);
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } };
        c.alignment = { horizontal: 'center', vertical: 'middle' };
        c.border = border;
      });
      rows.forEach(a => {
        const r = ws.addRow(this.FIELDS.map(f => f === 'amount' ? (+a.amount || 0) : f === 'line' ? (+a.line || null) : (a[f] || '')));
        r.height = 23.5;
        for (let i = 1; i <= this.HEAD.length; i++) {
          const c = r.getCell(i);
          c.font = font;
          c.border = border;
          c.alignment = { vertical: 'middle' };
        }
        r.getCell(8).numFmt = this.AMOUNT_FMT;
      });

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const d = new Date();
      const stamp = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `Accrued (STT-BB-BUS-OTHER)${this.month ? '_' + this.label(this.month) : ''}_${stamp}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      toast(`Export Excel ${rows.length} รายการเรียบร้อย`);
    } catch (e) {
      toast(e.message || 'Export ไม่สำเร็จ');
    } finally {
      showLoader(false);
    }
  }
};
