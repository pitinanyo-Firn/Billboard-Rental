/* ============================================================
   PLAN B — CONTRACT RENTAL HUB  |  js/app.js
   Bootstrap · สลับแท็บ · โหลดข้อมูล · Export CSV
   ============================================================ */

const App = {

  TABS: ['dashboard', 'contracts', 'action', 'notice', 'ai', 'members'],

  /* ---------- Bootstrap ---------- */
  async init() {
    Auth.init();
    Contracts.init();
    Members.init();
    Notice.init();
    AI.init();
    this.bindShell();

    // กู้คืน session เดิม ถ้ายังไม่หมดอายุ
    if (await Auth.restore()) this.enter();
  },

  bindShell() {
    document.querySelectorAll('.tab').forEach(el => {
      el.addEventListener('click', () => this.switchTab(el.dataset.tab));
    });
    $('btnRefresh').addEventListener('click', () => this.load(true));
    $('btnExport').addEventListener('click', () => this.exportCSV());
    $('btnLogout').addEventListener('click', () => Auth.logout());
  },

  /** เข้าสู่หน้าแอปหลังล็อกอินสำเร็จ */
  enter() {
    $('loginView').classList.add('hidden');
    $('appView').classList.remove('hidden');

    const p = Store.profile || {};
    $('userName').textContent = p.name || p.email || '-';
    $('avatar').textContent   = (p.name || 'U').charAt(0).toUpperCase();
    document.querySelector('.tab[data-tab="members"]').classList.toggle('hidden', p.role !== 'admin');

    this.load(false).then(() => Sync.start());
  },

  /* ---------- โหลดข้อมูล ----------
     hard   = ล้าง cache ฝั่ง server ก่อน (ปุ่มรีเฟรช)
     silent = โหลดเบื้องหลังจาก Sync — ไม่มี loader, คงแท็บ/ตัวกรอง/เดือนที่เลือกไว้ */
  async load(hard, silent = false) {
    if (!silent) showLoader(true);
    if (hard) await api('clearCache', {});

    const r = await api('getDashboard', {});
    if (!silent) showLoader(false);

    if (!r.ok) {
      if (r.code === 'SESSION_EXPIRED') {
        toast('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
        return setTimeout(() => Auth.logout(), 1200);
      }
      if (silent) return Sync.setState('error');
      return toast(r.message || 'โหลดข้อมูลไม่สำเร็จ');
    }

    Store.data = r;
    $('updatedAt').textContent = '· อัปเดต ' + r.updatedAt;

    Dashboard.render();
    Contracts.render();
    Notice.render(silent);
    Sync.setState('ok');

    if (hard) toast('รีเฟรชข้อมูลเรียบร้อย');
  },

  /* ---------- แท็บ ---------- */
  switchTab(name) {
    this.TABS.forEach(t => {
      $('tab-' + t).classList.toggle('hidden', t !== name);
      document.querySelector(`.tab[data-tab="${t}"]`).classList.toggle('active', t === name);
    });
  },

  /* ---------- Export ---------- */
  async exportCSV() {
    const r = await apiGuarded('exportCSV');
    if (!r) return;

    const blob = new Blob([r.csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `PlanB_Contracts_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
    toast('ดาวน์โหลดไฟล์ CSV เรียบร้อย');
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
