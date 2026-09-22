/* ============================================================
   PLAN B — CONTRACT RENTAL HUB  |  js/config.js
   ตั้งค่าเดียวที่ต้องแก้หลัง deploy Apps Script
   ============================================================ */

const CONFIG = {
  /**
   * URL ของ Apps Script Web App (ลงท้ายด้วย /exec)
   * ได้จาก: Apps Script → Deploy → New deployment → Web app → Web app URL
   */
  API_URL: 'https://script.google.com/macros/s/AKfycbxnxRwEP7s4_UQQyF7JR4HwVE-aOidAWcMWRIqY8bo43BJG0KsrIDxSY29Yvi-GlUF6/exec',

  /** ชื่อ key ที่ใช้เก็บ session token ใน sessionStorage */
  TOKEN_KEY: 'pb_contract_token',

  /** สีของกราฟ (วนซ้ำเมื่อชุดข้อมูลเกินจำนวน) */
  PALETTE: ['#E4002B', '#2563EB', '#059669', '#D97706', '#7C3AED',
            '#0891B2', '#DB2777', '#65A30D', '#EA580C', '#475569'],

  /** ป้ายกำกับระดับความเร่งด่วน */
  ALERT_LABEL: {
    normal:   'ปกติ',
    warning:  'ใกล้หมดอายุ',
    critical: 'เลยกำหนดแจ้งต่อสัญญา',
    expired:  'หมดอายุแล้ว',
    closed:   'ปิดสัญญา',
    unknown:  'ไม่ระบุวันที่'
  },

  /** สี badge ตามสถานะสัญญาในชีต */
  STATUS_CLASS: {
    'Active':        'b-ok',
    'New':           'b-info',
    'Write Off':     'b-off',
    'Change to LED': 'b-led'
  },

  /** ตัวเลือก "สถานะการต่อสัญญา" (ต้องตรงกับ RENEW_STATUSES ใน backend/Config.gs) */
  RENEW_STATUSES: ['Complete', 'On Process', 'Not Renew'],
  /** สถานะที่ถือว่าจบแล้ว — ไม่ต้องเตือน */
  RENEW_DONE: ['Complete', 'Not Renew'],
  /** ความยาวสูงสุด "สถานะเอกสาร" */
  DOC_STATUS_MAX: 100
};
