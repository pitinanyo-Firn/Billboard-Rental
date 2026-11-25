/* ============================================================
   PLAN B — BILLBOARD RENTAL HUB  |  js/pwa.js
   ติดตั้งเป็นแอปบนเครื่อง
     - Windows / Android (Edge, Chrome): ปุ่ม 📲 ติดตั้งแอป → หน้าต่างติดตั้งของเบราว์เซอร์
     - iPhone / iPad (Safari): ปุ่มเดียวกัน → วิธี "เพิ่มไปยังหน้าจอโฮม"
     - Windows ทุกเบราว์เซอร์: ดาวน์โหลดตัวติดตั้ง (.iso / .zip) ที่สร้างไอคอนบน Desktop + Start Menu
   ============================================================ */

const PWA = {

  deferred: null,
  DOWNLOAD_ISO: 'download/Billboard-Rental-Hub-Setup.iso',
  DOWNLOAD_ZIP: 'download/Billboard-Rental-Hub-Setup.zip',

  isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches ||
           window.matchMedia('(display-mode: window-controls-overlay)').matches || navigator.standalone === true;
  },
  isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  },
  isWindows() { return /Windows/i.test(navigator.userAgent); },
  isMobile() { return this.isIOS() || /Android|Mobi/i.test(navigator.userAgent); },

  /** เปิดจากไอคอนที่ติดตั้งแล้ว (ตัวติดตั้ง Windows ใส่ ?source=win-app · แอปจากเบราว์เซอร์ใส่ ?source=pwa) */
  installed() {
    if (this.isStandalone()) return true;
    try { return localStorage.getItem('brh-installed') === '1'; } catch (e) { return false; }
  },

  init() {
    if (/[?&]source=(win-app|pwa)\b/.test(location.search)) {
      try { localStorage.setItem('brh-installed', '1'); } catch (e) {}
      history.replaceState(null, '', location.pathname + location.hash);
    }
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      this.deferred = e;
      this.showButtons();
    });
    window.addEventListener('appinstalled', () => {
      this.deferred = null;
      try { localStorage.setItem('brh-installed', '1'); } catch (e) {}
      this.showButtons();
      if (typeof toast === 'function') toast('ติดตั้ง Billboard Rental Hub บนเครื่องนี้แล้ว — เปิดได้จากไอคอนบน Desktop / Start Menu');
    });
    document.querySelectorAll('.btn-install').forEach(b => b.addEventListener('click', () => this.install()));
    this.showButtons();
  },

  /** ปุ่มตามอุปกรณ์: คอมพิวเตอร์ = 💻 ติดตั้งบนคอมพิวเตอร์ · มือถือ/แท็บเล็ต = 📲 ติดตั้งแอป · ติดตั้งแล้ว = ซ่อน */
  showButtons() {
    const show = !this.installed();
    const pc = !this.isMobile();
    document.querySelectorAll('.btn-install').forEach(b => {
      b.classList.toggle('hidden', !show);
      const label = pc ? (b.dataset.pc || '💻 ติดตั้งบนคอมพิวเตอร์') : (b.dataset.mobile || '📲 ติดตั้งแอป');
      if (b.textContent !== label) b.textContent = label;
    });
  },

  /** คลิกเดียว: เบราว์เซอร์รองรับ → หน้าต่างติดตั้งทันที · ไม่รองรับ → Windows ดาวน์โหลดตัวติดตั้ง + วิธีทำ */
  async install() {
    if (this.deferred) {
      this.deferred.prompt();
      const r = await this.deferred.userChoice.catch(() => null);
      this.deferred = null;
      if (r && r.outcome === 'accepted') return;
    }
    if (this.isWindows() && !this.isMobile()) this.download('iso');
    this.guide();
  },

  download(kind) {
    const a = document.createElement('a');
    a.href = kind === 'zip' ? this.DOWNLOAD_ZIP : this.DOWNLOAD_ISO;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    a.remove();
  },

  /** วิธีติดตั้งตามอุปกรณ์ (กรณีเบราว์เซอร์ไม่มีหน้าต่างติดตั้งให้เรียก) */
  guide() {
    const ios = this.isIOS();
    const host = document.getElementById('drawerHost');
    host.innerHTML = `
    <div class="drawer-mask" id="drawerMask">
      <div class="drawer">
        <div class="drawer-head">
          <div><h2>${ios ? '📲 ติดตั้ง Billboard Rental Hub เป็นแอป' : '💻 ติดตั้ง Billboard Rental Hub บนคอมพิวเตอร์'}</h2>
            <div class="sub">เปิดจากไอคอนบนเครื่องได้เหมือนโปรแกรม · ข้อมูลยังซิงค์กับ Google Sheet เหมือนเดิม</div></div>
          <div class="spacer"></div>
          <button class="icon-btn" id="btnCloseDetail" title="ปิด">✕</button>
        </div>
        <div class="drawer-body">
          ${ios ? `
          <div class="card pwa-steps">
            <div class="card-head"><h2>iPhone / iPad</h2></div>
            <ol>
              <li>เปิดหน้านี้ด้วย <b>Safari</b></li>
              <li>แตะปุ่ม <b>แชร์</b> <span class="pwa-ic">⬆︎</span> ที่แถบด้านล่าง (iPad: มุมขวาบน)</li>
              <li>เลือก <b>"เพิ่มไปยังหน้าจอโฮม" (Add to Home Screen)</b> → แตะ <b>เพิ่ม</b></li>
              <li>เปิดแอปจากไอคอน <b>PB</b> บนหน้าจอโฮม</li>
            </ol>
          </div>` : `
          <div class="pwa-quick">
            <button type="button" class="btn btn-primary" id="pwaGetIso">💿 ดาวน์โหลดตัวติดตั้ง Windows (.iso)</button>
            <button type="button" class="btn btn-ghost" id="pwaGetZip">🗜 ดาวน์โหลดแบบ .zip</button>
            <div class="cell-mute">${this.isWindows() ? 'เริ่มดาวน์โหลด .iso ให้แล้ว — ' : ''}เปิดไฟล์ที่ดาวน์โหลด → ดับเบิลคลิก <b>Install.cmd</b> → ได้ไอคอนบน Desktop + Start Menu</div>
          </div>
          <div class="card pwa-steps">
            <div class="card-head"><h2>วิธีที่ 1 · ติดตั้งจากเบราว์เซอร์ (Edge / Chrome)</h2></div>
            <ol>
              <li>เปิดหน้านี้ด้วย <b>Microsoft Edge</b> หรือ <b>Google Chrome</b></li>
              <li>กดไอคอน <b>ติดตั้งแอป</b> <span class="pwa-ic">⊕</span> ที่ช่องที่อยู่เว็บ (มุมขวา)
                หรือเมนู <b>⋯ → แอป → ติดตั้งไซต์นี้เป็นแอป</b> (Chrome: <b>⋮ → แคสต์ บันทึก และแชร์ → ติดตั้งหน้าเว็บเป็นแอป</b>)</li>
              <li>ระบบสร้างไอคอนใน Start Menu / Desktop ให้ — เปิดเป็นหน้าต่างแยกเหมือนโปรแกรม</li>
            </ol>
          </div>
          <div class="card pwa-steps">
            <div class="card-head"><h2>วิธีที่ 2 · ตัวติดตั้ง Windows (.iso / .zip)</h2></div>
            <ol>
              <li>ดาวน์โหลด
                <a class="btn btn-ghost btn-sm" href="${this.DOWNLOAD_ISO}" download>💿 Billboard-Rental-Hub-Setup.iso</a>
                หรือ <a class="btn btn-ghost btn-sm" href="${this.DOWNLOAD_ZIP}" download>🗜 .zip</a></li>
              <li>.iso: ดับเบิลคลิกเพื่อเปิด (Mount) · .zip: คลิกขวา → Extract All</li>
              <li>ดับเบิลคลิก <b>Install.cmd</b> → ได้ไอคอน <b>Billboard Rental Hub</b> บน Desktop และ Start Menu (ไม่ต้องใช้สิทธิ์ admin)</li>
              <li>ถอนการติดตั้ง: Settings → Apps → Billboard Rental Hub → Uninstall</li>
            </ol>
          </div>`}
          <div class="cell-mute">แอปเปิดหน้าเว็บ https://billboard-rental.vercel.app/ ในหน้าต่างของตัวเอง — อัปเดตเป็นเวอร์ชันล่าสุดเองทุกครั้งที่เปิด</div>
        </div>
      </div>
    </div>`;
    const iso = document.getElementById('pwaGetIso'), zip = document.getElementById('pwaGetZip');
    if (iso) iso.addEventListener('click', () => this.download('iso'));
    if (zip) zip.addEventListener('click', () => this.download('zip'));
    const close = () => { host.innerHTML = ''; };
    document.getElementById('btnCloseDetail').addEventListener('click', close);
    document.getElementById('drawerMask').addEventListener('click', e => { if (e.target.id === 'drawerMask') close(); });
  }
};

document.addEventListener('DOMContentLoaded', () => PWA.init());
