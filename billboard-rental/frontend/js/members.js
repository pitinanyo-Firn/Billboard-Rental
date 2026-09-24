/* ============================================================
   PLAN B — BILLBOARD RENTAL HUB  |  js/members.js
   จัดการสมาชิก (เฉพาะ role admin): เพิ่ม · แก้สิทธิ์/สถานะ · รีเซ็ตรหัสผ่าน · ลบ
   ============================================================ */

const Members = {

  photoData: '',
  list: [],
  me: '',

  init() {
    $('memberForm').addEventListener('submit', e => { e.preventDefault(); this.submit(); });
    $('mPhoto').addEventListener('change', e => this.onPhoto(e.target.files[0]));
  },

  showError(msg) {
    const el = $('memberError');
    el.textContent = msg;
    el.classList.toggle('hidden', !msg);
  },

  showResult(html) {
    const el = $('memberResult');
    el.innerHTML = html;
    el.classList.remove('hidden');
  },

  /** โหลดรายชื่อสมาชิกจาก backend (เรียกทุกครั้งที่โหลดข้อมูลใหม่ ถ้าเป็น admin) */
  async load(silent = true) {
    if (!Store.isAdmin()) return;
    const r = await api('getMembers', {});
    if (!r.ok) {
      if (!silent) toast(r.message || 'โหลดรายชื่อสมาชิกไม่สำเร็จ');
      return;
    }
    this.list = r.members;
    this.me = r.me;
    this.render();
  },

  render() {
    const tb = $('memberBody');
    if (!tb) return;
    $('memberCount').textContent = `${this.list.length} คน · admin ${this.list.filter(m => m.role === 'admin' && m.active).length} คน`;
    if (!this.list.length) {
      tb.innerHTML = '<tr><td colspan="6"><div class="empty">ยังไม่มีสมาชิก</div></td></tr>';
      return;
    }
    tb.innerHTML = this.list.map(m => {
      const self = m.email === this.me;
      return `
      <tr data-id="${m.id}">
        <td class="cell-strong">${m.photoUrl ? `<img class="mini-avatar" src="${esc(m.photoUrl)}" alt="">` : ''}${esc(m.name || '-')}
          ${self ? '<span class="dup-tag">คุณ</span>' : ''}<div class="cell-mute">${esc(m.email)}</div></td>
        <td>${esc(m.position || '-')}<div class="cell-mute">${esc(m.department || '-')}</div></td>
        <td>${esc(m.phone || '-')}</td>
        <td><select class="st-select m-role" ${self ? 'disabled' : ''}>
              <option value="admin" ${m.role === 'admin' ? 'selected' : ''}>Admin</option>
              <option value="viewer" ${m.role === 'viewer' ? 'selected' : ''}>Viewer</option>
            </select></td>
        <td><select class="st-select m-active" ${self ? 'disabled' : ''}>
              <option value="true" ${m.active ? 'selected' : ''}>ใช้งาน</option>
              <option value="false" ${m.active ? '' : 'selected'}>ปิดใช้งาน</option>
            </select></td>
        <td><div class="rc-actions">
              <button class="btn btn-ghost btn-sm m-reset">รีเซ็ตรหัส</button>
              <button class="icon-btn m-del" title="ลบสมาชิก" ${self ? 'disabled' : ''}>🗑</button>
            </div></td>
      </tr>`;
    }).join('');

    const find = el => this.list.find(m => m.id === el.closest('tr').dataset.id);
    tb.querySelectorAll('.m-role, .m-active').forEach(sel => {
      sel.addEventListener('change', () => {
        const m = find(sel);
        const tr = sel.closest('tr');
        this.update(m, {
          role: tr.querySelector('.m-role').value,
          active: tr.querySelector('.m-active').value === 'true'
        });
      });
    });
    tb.querySelectorAll('.m-reset').forEach(btn => {
      btn.addEventListener('click', () => {
        const m = find(btn);
        if (!confirm(`รีเซ็ตรหัสผ่านของ ${m.name || m.email}? ระบบจะสุ่มรหัสใหม่ให้`)) return;
        this.update(m, { resetPassword: true });
      });
    });
    tb.querySelectorAll('.m-del').forEach(btn => {
      btn.addEventListener('click', async () => {
        const m = find(btn);
        if (!confirm(`ลบสมาชิก ${m.name || m.email} ออกจากระบบ?`)) return;
        const r = await apiGuarded('deleteMember', { id: m.id, email: m.email });
        if (r) { toast('ลบสมาชิกแล้ว'); this.load(false); }
      });
    });
  },

  async update(m, fields) {
    const r = await apiGuarded('updateMember', Object.assign({ id: m.id, email: m.email, name: m.name }, fields));
    if (!r) return this.load(false);                       // ล้มเหลว — โหลดค่าจริงกลับมาแสดง
    if (r.tempPassword) {
      this.showResult(`รีเซ็ตรหัสผ่านของ <b>${esc(m.name || m.email)}</b> แล้ว
        <div class="pw-row">รหัสผ่านใหม่: <code id="tempPw">${esc(r.tempPassword)}</code>
          <button type="button" class="btn btn-ghost" id="btnCopyPw" style="padding:6px 12px;">คัดลอก</button></div>
        <div class="cell-mute" style="margin-top:8px;">ส่งรหัสนี้ให้สมาชิกไปเปลี่ยนหลังเข้าสู่ระบบ</div>`);
      $('btnCopyPw').addEventListener('click', () => {
        navigator.clipboard.writeText(r.tempPassword).then(() => toast('คัดลอกรหัสผ่านแล้ว'));
      });
    } else {
      toast('บันทึกการเปลี่ยนแปลงแล้ว');
    }
    this.load(false);
  },

  /** ย่อ+ครอปรูปเป็นสี่เหลี่ยมจัตุรัสฝั่ง client แล้วบีบอัดให้เล็กพอเก็บในเซลล์ Google Sheet ได้ */
  onPhoto(file) {
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      const size = 160;
      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d');
      const s = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);

      let quality = 0.82;
      let dataUrl = canvas.toDataURL('image/jpeg', quality);
      while (dataUrl.length > 24000 && quality > 0.25) {
        quality -= 0.12;
        dataUrl = canvas.toDataURL('image/jpeg', quality);
      }
      this.photoData = dataUrl;
      $('mPhotoPreview').innerHTML = `<img src="${dataUrl}" alt="">`;
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => toast('เปิดไฟล์รูปไม่สำเร็จ');
    img.src = URL.createObjectURL(file);
  },

  clearPhoto() {
    this.photoData = '';
    $('mPhotoPreview').innerHTML = '+';
    $('mPhoto').value = '';
  },

  async submit() {
    this.showError('');
    $('memberResult').classList.add('hidden');

    const name  = $('mName').value.trim();
    const email = $('mEmail').value.trim();
    const password = $('mPassword').value;
    if (!name)  return this.showError('กรุณากรอกชื่อ-นามสกุล');
    if (!email) return this.showError('กรุณากรอกอีเมลหรือชื่อผู้ใช้');
    if (password && password.length < 6) return this.showError('รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร');

    const btn = $('btnAddMember');
    btn.disabled = true;
    btn.textContent = 'กำลังเพิ่ม...';

    const r = await api('addMember', {
      name,
      email,
      password,
      position:   $('mPosition').value.trim(),
      phone:      $('mPhone').value.trim(),
      department: $('mDepartment').value.trim(),
      role:       $('mRole').value,
      active:     $('mActive').value === 'true',
      photo:      this.photoData
    });

    btn.disabled = false;
    btn.textContent = '+ เพิ่มสมาชิก';

    if (!r.ok) return this.showError(r.message || 'เพิ่มสมาชิกไม่สำเร็จ');

    this.showResult(r.tempPassword
      ? `เพิ่มสมาชิก <b>${esc(name)}</b> (${esc(email)}) เรียบร้อย
         <div class="pw-row">รหัสผ่านชั่วคราว: <code id="tempPw">${esc(r.tempPassword)}</code>
           <button type="button" class="btn btn-ghost" id="btnCopyPw" style="padding:6px 12px;">คัดลอก</button></div>
         <div class="cell-mute" style="margin-top:8px;">ส่งรหัสนี้ให้สมาชิกไปเปลี่ยนหลังเข้าสู่ระบบครั้งแรก</div>`
      : `เพิ่มสมาชิก <b>${esc(name)}</b> (${esc(email)}) เรียบร้อย — เข้าสู่ระบบด้วยรหัสผ่านที่คุณตั้งไว้`);
    if ($('btnCopyPw')) {
      $('btnCopyPw').addEventListener('click', () => {
        navigator.clipboard.writeText(r.tempPassword).then(() => toast('คัดลอกรหัสผ่านแล้ว'));
      });
    }

    $('memberForm').reset();
    this.clearPhoto();
    toast('เพิ่มสมาชิกเรียบร้อย');
    this.load(false);
  }
};
