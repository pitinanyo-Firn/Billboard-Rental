/* ============================================================
   PLAN B — CONTRACT RENTAL HUB  |  js/ai.js
   ผู้ช่วย AI — ส่งคำถามไป backend (action: askAI)
   API key และข้อมูลสัญญาทั้งหมดอยู่ฝั่ง backend เท่านั้น
   ============================================================ */

const AI = {

  history: [],        // [{role:'user'|'assistant', content}] — ต่อท้ายอย่างเดียว
  busy: false,

  SUGGESTIONS: [
    'สัญญาไหนต้องทำหนังสือแจ้งต่อสัญญาภายใน 60 วันข้างหน้า',
    'สรุปสัญญาที่จะหมดอายุภายในสิ้นปีนี้ แยกตามประเภทสื่อ',
    'สัญญา Revenue Share มีอะไรบ้าง แบ่งสัดส่วนอย่างไร',
    'มูลค่าหลักประกันรวมของสัญญา Active เท่าไหร่'
  ],

  init() {
    $('aiChips').innerHTML = this.SUGGESTIONS
      .map(q => `<button type="button" class="ai-chip">${esc(q)}</button>`).join('');
    $('aiChips').querySelectorAll('.ai-chip').forEach(b => {
      b.addEventListener('click', () => this.ask(b.textContent));
    });

    $('aiForm').addEventListener('submit', e => {
      e.preventDefault();
      this.ask($('aiInput').value);
    });
    $('aiInput').addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {        // Enter = ส่ง · Shift+Enter = ขึ้นบรรทัดใหม่
        e.preventDefault();
        this.ask($('aiInput').value);
      }
    });
    $('btnAiClear').addEventListener('click', () => this.reset());
  },

  reset() {
    this.history = [];
    $('aiLog').querySelectorAll('.msg').forEach(el => el.remove());
    $('aiWelcome').classList.remove('hidden');
  },

  async ask(text) {
    const question = String(text || '').trim();
    if (!question || this.busy) return;

    this.busy = true;
    $('btnAiSend').disabled = true;
    $('aiInput').value = '';
    $('aiWelcome').classList.add('hidden');

    this.addMsg('user', esc(question));
    const pending = this.addMsg('bot', '<span class="typing"><i></i><i></i><i></i></span>');

    const r = await api('askAI', { question, history: this.history });

    this.busy = false;
    $('btnAiSend').disabled = false;

    if (!r.ok) {
      if (r.code === 'SESSION_EXPIRED') {
        toast('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
        setTimeout(() => Auth.logout(), 1200);
      }
      pending.classList.add('err');
      pending.innerHTML = esc(r.message || 'เกิดข้อผิดพลาด');
      $('aiInput').value = question;                  // คืนคำถามให้กดส่งใหม่ได้
      return;
    }

    this.history.push({ role: 'user', content: question },
                      { role: 'assistant', content: r.answer });
    pending.innerHTML = this.format(r.answer);
    this.scroll();
  },

  addMsg(role, html) {
    const el = document.createElement('div');
    el.className = 'msg ' + role;
    el.innerHTML = html;
    $('aiLog').appendChild(el);
    this.scroll();
    return el;
  },

  scroll() {
    const log = $('aiLog');
    log.scrollTop = log.scrollHeight;
  },

  /** แปลงข้อความ AI เป็น HTML แบบปลอดภัย: escape ก่อน แล้วรองรับ **ตัวหนา** และรายการ "- " */
  format(text) {
    const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    const blocks = String(text).split(/\n{2,}/);
    return blocks.map(block => {
      const lines = block.split('\n');
      if (lines.every(l => /^\s*[-•*]\s+/.test(l))) {
        return '<ul>' + lines.map(l => `<li>${inline(l.replace(/^\s*[-•*]\s+/, ''))}</li>`).join('') + '</ul>';
      }
      return '<p>' + lines.map(inline).join('<br>') + '</p>';
    }).join('');
  }
};
