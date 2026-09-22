/* ============================================================
   PLAN B — CONTRACT RENTAL HUB  |  js/auth.js
   Login / Logout / กู้คืน session
   ============================================================ */

const Auth = {

  /** ผูก event ของหน้า Login */
  init() {
    $('btnLogin').addEventListener('click', () => this.login());
    ['email', 'password'].forEach(id => {
      $(id).addEventListener('keydown', e => { if (e.key === 'Enter') this.login(); });
    });
  },

  showError(msg) {
    const el = $('loginError');
    el.textContent = msg;
    el.classList.remove('hidden');
  },

  hideError() {
    $('loginError').classList.add('hidden');
  },

  async login() {
    const email = $('email').value.trim();
    const password = $('password').value;

    if (!email || !password) return this.showError('กรุณากรอกอีเมลและรหัสผ่าน');

    this.hideError();
    const btn = $('btnLogin');
    btn.disabled = true;
    btn.textContent = 'กำลังตรวจสอบ...';

    const r = await api('login', { email, password });

    btn.disabled = false;
    btn.textContent = 'เข้าสู่ระบบ';

    if (!r.ok) return this.showError(r.message);

    Store.save(r.token);
    Store.profile = r.profile;
    $('password').value = '';
    App.enter();
  },

  async logout() {
    if (Store.token) api('logout', {});   // ยิงทิ้งไม่ต้องรอผล
    Store.clear();
    location.reload();
  },

  /** กู้คืน session เดิมตอนเปิดหน้า — คืน true ถ้ายังใช้ได้ */
  async restore() {
    const token = Store.restore();
    if (!token) return false;

    Store.token = token;
    showLoader(true);
    const r = await api('checkSession', {});
    showLoader(false);

    if (r.ok) {
      Store.profile = r.profile;
      return true;
    }
    Store.clear();
    return false;
  }
};
