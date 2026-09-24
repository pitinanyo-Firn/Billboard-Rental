/* ============================================================
   PLAN B — BILLBOARD RENTAL HUB  |  js/api.js
   API client (คุยกับ Apps Script Web App) + helper ที่ใช้ร่วมกัน
   ============================================================ */

/* ---------- 1. DOM helpers ---------- */
const $ = (id) => document.getElementById(id);

function showLoader(on) {
  $('loader').classList.toggle('hidden', !on);
}

let _toastTimer = null;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.add('hidden'), 2600);
}

/* ---------- 2. Format helpers ---------- */
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
  ));
}

/** 'yyyy-MM-dd' -> 'dd/MM/yyyy' */
function fmtDate(iso) {
  if (!iso) return '-';
  const p = String(iso).split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : '-';
}

function fmtNum(n) {
  if (n === 0 || n == null || n === '') return '-';
  return Number(n).toLocaleString('th-TH');
}

/** ยอดเงิน 2 ตำแหน่ง */
function fmtMoney(n) {
  if (n === 0 || n == null || n === '') return '-';
  return Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** ตัวเลขวัน — ติดลบให้เป็นสีแดง */
function fmtDays(n) {
  if (n === null || n === undefined) return '-';
  return n < 0 ? `<span class="neg">${n}</span>` : Number(n).toLocaleString('th-TH');
}

function statusBadge(s) {
  const cls = CONFIG.STATUS_CLASS[s] || 'b-off';
  return `<span class="badge ${cls}">${esc(s || 'ไม่ระบุ')}</span>`;
}

function alertDot(a) {
  return `<span class="dot d-${a}"></span>`;
}

function payText(a) {
  return CONFIG.PAY_LABEL[a] || a;
}

/* ---------- 3. Session store ---------- */
const Store = {
  token: null,
  profile: null,
  data: null,        // payload จาก getDashboard
  viewRows: [],      // แถวที่ผ่านตัวกรองแล้ว

  isAdmin() {
    return (this.profile || {}).role === 'admin';
  },
  save(token) {
    this.token = token;
    try { sessionStorage.setItem(CONFIG.TOKEN_KEY, token); } catch (e) {}
  },
  restore() {
    try { return sessionStorage.getItem(CONFIG.TOKEN_KEY); } catch (e) { return null; }
  },
  clear() {
    this.token = null;
    this.profile = null;
    try { sessionStorage.removeItem(CONFIG.TOKEN_KEY); } catch (e) {}
  }
};

/* ---------- 4. API client ---------- */

/**
 * เรียก Apps Script API
 * ใช้ Content-Type: text/plain เพื่อให้เป็น "simple request"
 * เลี่ยง CORS preflight ที่ Apps Script ไม่รองรับ
 *
 * @param {string} action  ชื่อ action ใน route_() ฝั่ง Code.gs
 * @param {object} params  พารามิเตอร์เพิ่มเติม
 * @returns {Promise<object>}
 */
async function api(action, params = {}) {
  if (!CONFIG.API_URL || CONFIG.API_URL.indexOf('XXXX') > -1) {
    return { ok: false, code: 'NO_CONFIG', message: 'ยังไม่ได้ตั้งค่า API_URL ใน js/config.js' };
  }

  const body = JSON.stringify(Object.assign({ action, token: Store.token }, params));

  // ลองซ้ำ 1 ครั้งเมื่อเน็ตสะดุด / Apps Script ตื่นช้า (ไม่ลองซ้ำกรณี 404 เพราะ URL ผิดแน่นอน)
  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(CONFIG.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body,
        redirect: 'follow'
      });
      if (!res.ok) {
        lastErr = new Error('HTTP ' + res.status);
        if (res.status === 404 || res.status === 401 || res.status === 403) break;
        continue;
      }
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); }
      catch (e) { lastErr = new Error('backend ตอบกลับไม่ใช่ JSON'); break; }   // เช่น หน้า error ของ Google
      if (data && data.code === 'UNKNOWN_ACTION') {
        // หน้าเว็บใหม่กว่า backend — ยังไม่ได้วางโค้ดใหม่ใน Apps Script / ยังไม่ได้ Deploy เวอร์ชันใหม่
        data.message = `Apps Script ยังเป็นโค้ดเวอร์ชันเก่า (ไม่มีคำสั่ง "${action}") — วาง backend/dist/Code.gs ใน Apps Script แล้ว Deploy → Manage deployments → เวอร์ชันใหม่`;
        data.outdated = true;
      }
      return data;
    } catch (err) {
      lastErr = err;
    }
    await new Promise(r => setTimeout(r, 1200));
  }
  return { ok: false, code: 'NETWORK_ERROR', message: backendErrorText_(lastErr) };
}

/** อธิบายสาเหตุที่เชื่อมต่อไม่ได้ + แสดง URL ที่หน้าเว็บเรียกจริง (ไว้เทียบกับ Apps Script) */
function backendErrorText_(err) {
  const msg = err ? err.message : 'unknown';
  const m = String(CONFIG.API_URL).match(/\/macros\/s\/([^/]+)\/(exec|dev)/);
  const id = m ? m[1].slice(0, 14) + '…' + m[1].slice(-6) : String(CONFIG.API_URL).slice(0, 60);
  let hint = 'ตรวจว่า Apps Script deploy แล้ว โดยเปิด API_URL?action=ping ต้องได้ {"ok":true}';
  if (m && m[2] === 'dev') hint = 'API_URL ลงท้าย /dev เป็น URL ทดสอบที่คนนอกเปิดไม่ได้ — ใช้ URL ที่ลงท้าย /exec';
  else if (/404/.test(msg)) hint = 'ไม่พบ Web App ตาม API_URL ใน js/config.js (URL ผิด หรือ deployment ถูกลบ/เก็บถาวร) — คัดลอก Web app URL จาก Apps Script → Manage deployments มาใส่ใหม่';
  return `เชื่อมต่อ backend ไม่ได้ — ${hint} (${msg} · URL: ${id})`;
}

/**
 * เรียก API พร้อมจัดการ loader + session หมดอายุให้อัตโนมัติ
 * คืน null เมื่อมี error (แสดง toast ให้แล้ว)
 */
async function apiGuarded(action, params = {}, silent = false) {
  if (!silent) showLoader(true);
  const r = await api(action, params);
  if (!silent) showLoader(false);

  if (!r.ok) {
    if (r.code === 'SESSION_EXPIRED') {
      toast('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
      setTimeout(() => Auth.logout(), 1200);
      return null;
    }
    toast(r.message || 'เกิดข้อผิดพลาด');
    return null;
  }
  return r;
}
