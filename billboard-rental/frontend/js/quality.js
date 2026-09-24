/* ============================================================
   PLAN B — BILLBOARD RENTAL HUB  |  js/quality.js
   แท็บ "ตรวจสอบข้อมูล": ปัญหาคุณภาพข้อมูลใน Contract_Master + แก้อัตโนมัติ (admin)
   ============================================================ */

const Quality = {

  RANK: { high: 3, medium: 2, low: 1 },

  init() {
    $('fLevel').addEventListener('change', () => this.render());
    $('fFixable').addEventListener('change', () => this.render());
    $('btnAutoFix').addEventListener('click', () => this.autoFix());
  },

  /** ระดับปัญหาที่หนักที่สุดของแถว */
  worst(d) {
    return d.issues.reduce((w, i) => (this.RANK[i.level] > this.RANK[w] ? i.level : w), 'low');
  },

  allIssues() {
    const out = [];
    Store.data.rentals.forEach(d => d.issues.forEach(i => out.push({ d, i })));
    return out.sort((a, b) => (this.RANK[b.i.level] - this.RANK[a.i.level]) || (a.d._row - b.d._row));
  },

  render() {
    const all = this.allIssues();
    const count = lv => all.filter(x => x.i.level === lv).length;
    const fixable = all.filter(x => x.i.fix).length;
    $('cntIssues').textContent = all.length || '';

    $('qualityKpi').innerHTML = [
      ['k-crit',  'สำคัญ',               count('high'),   'ยอดเงิน/วันที่ ผิดหรือหาย'],
      ['k-warn',  'ควรตรวจ',              count('medium'), 'ปีอาจผิด / ใส่ผิดช่อง'],
      ['k-off',   'เล็กน้อย',              count('low'),    'คำสะกด / ช่องว่าง'],
      ['k-active','แก้อัตโนมัติได้',        fixable,         'กดปุ่ม "แก้อัตโนมัติ…"']
    ].map(c => `
      <div class="kpi ${c[0]}">
        <div class="label">${c[1]}</div>
        <div class="value">${c[2]}</div>
        <div class="foot">${c[3]}</div>
      </div>`).join('');
    $('btnAutoFix').classList.toggle('hidden', !Store.isAdmin() || !fixable);

    const lv = $('fLevel').value;
    const onlyFix = $('fFixable').checked;
    const rows = all.filter(x => (!lv || x.i.level === lv) && (!onlyFix || x.i.fix));

    const tb = $('qualityBody');
    if (!rows.length) {
      tb.innerHTML = `<tr><td colspan="7"><div class="empty">${all.length ? 'ไม่มีรายการตามตัวกรอง' : 'ข้อมูลเรียบร้อย ไม่พบปัญหา'}</div></td></tr>`;
      return;
    }
    tb.innerHTML = rows.map(({ d, i }) => `
      <tr data-id="${d.id}">
        <td><span class="lv lv-${i.level}">${CONFIG.LEVEL_LABEL[i.level]}</span></td>
        <td class="num">${d._row}</td>
        <td class="cell-strong">${esc(d.contractNo || '-')}</td>
        <td>${esc(d.vendorName)}<div class="cell-mute">${esc(d.mediaSite)}</div></td>
        <td>${esc(CONFIG.FIELD_LABEL[i.field] || i.field)}</td>
        <td class="msg">${esc(i.msg)}</td>
        <td>${i.fix ? `<span class="fix-to">${esc(i.fix)}</span>` : '<span class="cell-mute">ตรวจเอกสาร แล้วแก้เอง</span>'}</td>
      </tr>`).join('');
    tb.querySelectorAll('tr[data-id]').forEach(tr => {
      tr.addEventListener('click', () => Rentals.openDetail(tr.dataset.id));
    });
  },

  /** แสดงรายการที่จะถูกแก้ (อ่านจาก backend ล่าสุด) → ยืนยัน → เขียนลงชีต */
  async autoFix() {
    const r = await apiGuarded('previewFixes');
    if (!r) return;
    if (!r.fixes.length) return toast('ไม่มีรายการที่แก้อัตโนมัติได้');

    $('drawerHost').innerHTML = `
    <div class="drawer-mask" id="drawerMask">
      <div class="drawer">
        <div class="drawer-head">
          <div><h2>แก้ข้อมูลอัตโนมัติ ${r.fixes.length} รายการ</h2>
            <div class="sub">เขียนลง Contract_Master เฉพาะเซลล์ที่ค่ายังเป็นค่าเดิม · บันทึกประวัติทั้งหมดในชีต Log</div></div>
          <div class="spacer"></div>
          <button class="icon-btn" id="btnCloseDetail" title="ปิด">✕</button>
        </div>
        <div class="drawer-body">
          <div class="card">
            <div class="table-wrap fix-preview">
              <table class="compact">
                <thead><tr><th>แถว</th><th>คอลัมน์</th><th>ค่าเดิม</th><th>แก้เป็น</th></tr></thead>
                <tbody>${r.fixes.map(f => `<tr><td class="num">${f.row}</td><td>${esc(CONFIG.FIELD_LABEL[f.field] || f.field)}</td>
                  <td>"${esc(f.before)}"</td><td class="fix-to">"${esc(f.after)}"</td></tr>`).join('')}</tbody>
              </table>
            </div>
            <div class="edit-actions">
              <div class="spacer"></div>
              <button type="button" class="btn btn-ghost" id="btnFixCancel">ยกเลิก</button>
              <button type="button" class="btn btn-primary" id="btnFixApply">ยืนยัน แก้ลง Google Sheet</button>
            </div>
          </div>
        </div>
      </div>
    </div>`;
    const close = () => { $('drawerHost').innerHTML = ''; };
    $('btnCloseDetail').addEventListener('click', close);
    $('btnFixCancel').addEventListener('click', close);
    $('drawerMask').addEventListener('click', e => { if (e.target.id === 'drawerMask') close(); });
    $('btnFixApply').addEventListener('click', async () => {
      $('btnFixApply').disabled = true;
      const res = await apiGuarded('applyFixes');
      close();
      if (!res) return;
      toast(`แก้ข้อมูลแล้ว ${res.applied.length} รายการ` + (res.skipped.length ? ` · ข้าม ${res.skipped.length} (ค่าในชีตเปลี่ยนไปแล้ว)` : ''));
      await App.load(false, true);
    });
  }
};
