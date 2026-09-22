/* ============================================================
   PLAN B — CONTRACT RENTAL HUB  |  js/members.js
   ฟอร์มแอดมินเพิ่มสมาชิกใหม่ (เฉพาะ role admin)
   ============================================================ */

const Members = {

  photoData: '',

  init() {
    $('memberForm').addEventListener('submit', e => { e.preventDefault(); this.submit(); });
    $('mPhoto').addEventListener('change', e => this.onPhoto(e.target.files[0]));
  },

  showError(msg) {
    const el = $('memberError');
    el.textContent = msg;
    el.classList.remove('hidden');
  },

  hideError() {
    $('memberError').classList.add('hidden');
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
    this.hideError();
    $('memberResult').classList.add('hidden');

    const name  = $('mName').value.trim();
    const email = $('mEmail').value.trim();
    if (!name)  return this.showError('กรุณากรอกชื่อ-นามสกุล');
    if (!email) return this.showError('กรุณากรอกอีเมล');

    const btn = $('btnAddMember');
    btn.disabled = true;
    btn.textContent = 'กำลังเพิ่ม...';

    const r = await api('addMember', {
      name,
      email,
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

    $('memberResult').innerHTML = `
      เพิ่มสมาชิก <b>${esc(name)}</b> (${esc(email)}) เรียบร้อย
      <div class="pw-row">
        รหัสผ่านชั่วคราว: <code id="tempPw">${esc(r.tempPassword)}</code>
        <button type="button" class="btn btn-ghost" id="btnCopyPw" style="padding:6px 12px;">คัดลอก</button>
      </div>
      <div class="cell-mute" style="margin-top:8px;">ส่งรหัสนี้ให้สมาชิกไปเปลี่ยนหลัง login ครั้งแรก</div>
    `;
    $('memberResult').classList.remove('hidden');
    $('btnCopyPw').addEventListener('click', () => {
      navigator.clipboard.writeText(r.tempPassword).then(() => toast('คัดลอกรหัสผ่านแล้ว'));
    });

    $('memberForm').reset();
    this.clearPhoto();
    toast('เพิ่มสมาชิกเรียบร้อย');
  }
};
