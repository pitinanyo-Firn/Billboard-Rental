/* ============================================================
   PLAN B — BILLBOARD RENTAL HUB  |  js/sync.js
   ซิงค์สองทางกับ Google Sheet
     หน้าเว็บ → ชีต : บันทึกทันทีผ่าน API (editor.js / payments.js / quality.js)
     ชีต → หน้าเว็บ : ถาม getVersion ทุก 30 วินาที ถ้าข้อมูลในชีตเปลี่ยน โหลดใหม่อัตโนมัติ
   ============================================================ */

const Sync = {

  INTERVAL_MS: 30000,
  timer: null,
  busy: false,
  pending: false,     // มีข้อมูลใหม่ แต่ผู้ใช้กำลังแก้ช่องอยู่ — รอให้เสร็จก่อน
  bound: false,

  start() {
    if (!this.bound) {
      this.bound = true;
      document.addEventListener('visibilitychange', () => { if (!document.hidden) this.check(); });
      window.addEventListener('focus', () => this.check());
      // ออกจากช่องที่แก้อยู่ แล้วมีข้อมูลใหม่ค้าง → โหลดเลย
      document.addEventListener('focusout', e => {
        if (this.pending && e.target.matches && e.target.matches('.st-input, .st-select')) this.soon(800);
      });
      $('syncState').addEventListener('click', () => this.check(true));
    }
    clearInterval(this.timer);
    this.timer = setInterval(() => this.check(), this.INTERVAL_MS);
    this.setState('ok');
  },

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  },

  /** เช็กอีกครั้งในอีกไม่กี่วินาที (เช่น หลังบันทึกจากหน้าเว็บ) */
  soon(ms = 1500) {
    setTimeout(() => this.check(), ms);
  },

  isEditing() {
    const a = document.activeElement;
    return !!(a && a.matches && a.matches('.st-input, .st-select')) || Editor.isOpen;
  },

  async check(manual = false) {
    if (this.busy || !Store.token || !Store.data || (document.hidden && !manual)) return;
    this.busy = true;
    this.setState('checking');
    try {
      const r = await api('getVersion', {});
      if (!r.ok) {
        if (r.code === 'SESSION_EXPIRED') { this.stop(); toast('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่'); setTimeout(() => Auth.logout(), 1200); return; }
        if (r.outdated) { this.stop(); this.setState('outdated'); return; }      // backend เก่า — ไม่ต้องลองซ้ำทุก 30 วิ
        this.setState('error');
        return;
      }
      if (r.version === Store.data.version) {
        this.pending = false;
        this.setState('ok');
        if (manual) toast('ข้อมูลตรงกับ Google Sheet แล้ว');
        return;
      }
      if (this.isEditing()) {
        this.pending = true;
        this.setState('pending');
        return;
      }
      this.pending = false;
      await App.load(false, true);
      toast('อัปเดตข้อมูลล่าสุดจาก Google Sheet แล้ว');
    } finally {
      this.busy = false;
    }
  },

  setState(state) {
    const el = $('syncState');
    const time = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const map = {
      ok:       ['sync-ok',   'ซิงค์กับ Google Sheet', `ตรวจล่าสุด ${time} · ตรวจอัตโนมัติทุก ${this.INTERVAL_MS / 1000} วินาที · คลิกเพื่อตรวจตอนนี้`],
      checking: ['sync-busy', 'กำลังตรวจ…',            'กำลังเทียบข้อมูลกับ Google Sheet'],
      pending:  ['sync-warn', 'มีข้อมูลใหม่',           'มีการแก้ไขในชีต — จะโหลดให้หลังคุณแก้ไข/บันทึกเสร็จ'],
      error:    ['sync-err',  'ซิงค์ไม่ได้',            `เชื่อมต่อ backend ไม่ได้ (${time}) — จะลองใหม่อัตโนมัติ`],
      outdated: ['sync-err',  'Apps Script ต้องอัปเดต',  'backend ยังเป็นโค้ดเวอร์ชันเก่า — วาง backend/dist/Code.gs ใน Apps Script แล้ว Deploy เวอร์ชันใหม่ จากนั้นรีเฟรชหน้านี้']
    }[state];
    el.className = 'sync-pill ' + map[0];
    el.lastElementChild.textContent = map[1];
    el.title = map[2];
  }
};
