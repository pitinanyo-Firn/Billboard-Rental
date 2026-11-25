/* ============================================================
   PLAN B — BILLBOARD RENTAL HUB  |  sw.js (Service Worker)
   ทำให้ติดตั้งเป็นแอปได้ (Windows / iOS / Android) และเปิดหน้าแอปได้แม้เน็ตสะดุด
     - หน้าเว็บ / CSS / JS / ไอคอน ของโดเมนนี้: ดึงจากเน็ตก่อน (ได้เวอร์ชันล่าสุดเสมอ) ไม่ได้ค่อยใช้ที่เก็บไว้
     - ข้อมูลจาก API (script.google.com) และไฟล์ภายนอก: ไม่แตะ — ข้อมูลมาจาก Google Sheet สดทุกครั้ง
   ============================================================ */

const CACHE = 'billboard-hub-v2';
const SHELL = [
  './', 'index.html', 'manual.html', 'manifest.webmanifest',
  'css/style.css', 'css/dashboard.css', 'css/ai.css', 'css/rental.css',
  'js/config.js', 'js/api.js', 'js/fold.js', 'js/auth.js', 'js/dashboard.js', 'js/rentals.js', 'js/editor.js',
  'js/newcontract.js', 'js/due.js', 'js/payments.js', 'js/accrued.js', 'js/attach.js', 'js/aikeys.js',
  'js/quality.js', 'js/members.js', 'js/sync.js', 'js/ai.js', 'js/pwa.js', 'js/app.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => null).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;                                   // POST ไป API ไม่แตะ
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;                    // API / CDN / ฟอนต์ ไม่แตะ
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true })
      .then(hit => hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error())))
  );
});
