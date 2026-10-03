/* ============================================================
   PLAN B — BILLBOARD RENTAL HUB  |  js/fold.js
   ย่อ/ขยายหน้าต่างข้อมูลที่ยาว (ใช้กับทุกตารางอัตโนมัติ)
     ① ตารางแสดงทีละ 10 แถว (เปลี่ยนได้ด้วย <tbody data-fold="50">, 0 = ไม่ย่อ)
        ปุ่มใต้ตาราง: แสดงเพิ่ม · แสดงทั้งหมด · ย่อ
     ② ปุ่ม ▾ ย่อ / ▸ ขยาย ที่หัวการ์ด — ซ่อนทั้งตาราง (จำค่าไว้ในเบราว์เซอร์)
   ไม่ต้องเรียกจากโค้ดแท็บอื่น: MutationObserver จับทุกครั้งที่ tbody ถูกวาดใหม่
   ============================================================ */

const Fold = {

  LIMIT: 10,
  shown: {},          // tbody id → จำนวนแถวที่แสดงอยู่ (คงไว้ตอนวาดตารางใหม่)

  init() {
    document.querySelectorAll('section[id^="tab-"] tbody[id]').forEach(tb => {
      if (tb.dataset.fold === '0') return;
      const wrap = tb.closest('.table-wrap');
      if (!wrap) return;
      const bar = document.createElement('div');
      bar.className = 'fold-bar hidden';
      bar.id = 'fold-' + tb.id;
      wrap.after(bar);
      bar.addEventListener('click', e => {
        const b = e.target.closest('button[data-act]');
        if (b) this.act(tb, b.dataset.act);
      });
      new MutationObserver(() => this.apply(tb)).observe(tb, { childList: true });
      this.addToggle(tb);
      this.apply(tb);
    });
  },

  limitOf(tb) {
    const n = parseInt(tb.dataset.fold, 10);
    return n > 0 ? n : this.LIMIT;
  },

  /** ซ่อนแถวที่เกินจำนวนที่แสดง + อัปเดตปุ่มใต้ตาราง */
  apply(tb) {
    const bar = $('fold-' + tb.id);
    if (!bar) return;
    const rows = [...tb.children].filter(tr => tr.tagName === 'TR');
    const lim = this.limitOf(tb);
    const total = rows.length;
    const shown = Math.min(total, Math.max(lim, this.shown[tb.id] || lim));
    rows.forEach((tr, i) => tr.classList.toggle('fold-hide', i >= shown));
    if (total <= lim) { bar.classList.add('hidden'); return; }
    const more = Math.min(lim, total - shown);
    bar.innerHTML = `
      <span class="cell-mute">แสดง ${shown} จาก ${total} รายการ</span>
      <div class="spacer"></div>
      ${shown < total ? `<button type="button" class="btn btn-ghost btn-sm" data-act="more">▾ แสดงเพิ่ม (+${more})</button>
        <button type="button" class="btn btn-ghost btn-sm" data-act="all">แสดงทั้งหมด (${total})</button>` : ''}
      ${shown > lim ? `<button type="button" class="btn btn-ghost btn-sm" data-act="less">▴ ย่อเหลือ ${lim}</button>` : ''}`;
    bar.classList.remove('hidden');
  },

  act(tb, what) {
    const lim = this.limitOf(tb);
    const cur = Math.max(lim, this.shown[tb.id] || lim);
    if (what === 'more') this.shown[tb.id] = cur + lim;
    else if (what === 'all') this.shown[tb.id] = Infinity;
    else {
      this.shown[tb.id] = lim;
      const card = tb.closest('.card');
      if (card && card.getBoundingClientRect().top < 0) card.scrollIntoView({ block: 'start' });
    }
    this.apply(tb);
  },

  /** ปุ่ม ▾ ย่อ / ▸ ขยาย ที่หัวการ์ด (card-head ตัวที่อยู่ก่อนตาราง) */
  addToggle(tb) {
    const card = tb.closest('.card');
    if (!card) return;
    const heads = [...card.querySelectorAll(':scope > .card-head')];
    const head = heads[heads.length - 1] || card.querySelector(':scope > .filter-bar');   // การ์ดที่ไม่มีหัว ใช้แถบตัวกรองแทน
    if (!head || head.querySelector('.fold-toggle')) return;
    const key = 'fold:' + tb.id;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'fold-toggle';
    const set = folded => {
      card.classList.toggle('folded', folded);
      btn.textContent = folded ? '▸ ขยาย' : '▾ ย่อ';
      btn.title = folded ? 'แสดงตาราง' : 'ซ่อนตาราง';
    };
    let saved = false;
    try { saved = localStorage.getItem(key) === '1'; } catch (e) { /* ไม่มี storage ก็ไม่เป็นไร */ }
    set(saved);
    btn.addEventListener('click', () => {
      const folded = !card.classList.contains('folded');
      set(folded);
      try { localStorage.setItem(key, folded ? '1' : '0'); } catch (e) { /* ignore */ }
    });
    head.appendChild(btn);
  }
};

document.addEventListener('DOMContentLoaded', () => Fold.init());
