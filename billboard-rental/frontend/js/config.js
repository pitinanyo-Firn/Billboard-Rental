/* ============================================================
   PLAN B — BILLBOARD RENTAL HUB  |  js/config.js
   ตั้งค่าเดียวที่ต้องแก้หลัง deploy Apps Script
   ============================================================ */

const CONFIG = {
  /**
   * URL ของ Apps Script Web App (ลงท้ายด้วย /exec)
   * ได้จาก: Apps Script → Deploy → New deployment → Web app → Web app URL
   */
  API_URL: 'https://script.google.com/macros/s/XXXX/exec',

  /** ชื่อ key ที่ใช้เก็บ session token ใน sessionStorage */
  TOKEN_KEY: 'pb_billboard_token',

  /** สีของกราฟ (วนซ้ำเมื่อชุดข้อมูลเกินจำนวน) */
  PALETTE: ['#E4002B', '#2563EB', '#059669', '#D97706', '#7C3AED',
            '#0891B2', '#DB2777', '#65A30D', '#EA580C', '#475569'],

  /** ป้ายกำกับระดับการจ่าย (payAlert จาก backend) */
  PAY_LABEL: {
    overdue: 'เลยกำหนดจ่าย',
    due3:    'ภายใน 3 วัน',
    soon:    'ใกล้ครบกำหนด',
    normal:  'ยังไม่ถึงกำหนด',
    paid:    'เบิกแล้ว',
    unknown: 'ไม่ระบุวันที่'
  },

  /** ป้ายกำกับอายุสัญญา (expireAlert) */
  EXPIRE_LABEL: {
    expired: 'หมดอายุแล้ว',
    warning: 'ใกล้หมดอายุ',
    normal:  'ปกติ',
    unknown: 'ไม่ระบุวันที่'
  },

  /** สี badge ตาม Status Payment ในชีต */
  STATUS_CLASS: {
    'เบิกแล้ว': 'b-ok',
    'รอเบิก':   'b-warn'
  },

  /** ตัวเลือก Status Payment (ต้องตรงกับ PAY_STATUSES ใน backend/Config.gs) */
  PAY_STATUSES: ['เบิกแล้ว', 'รอเบิก'],

  /** ป้ายระดับปัญหาข้อมูล */
  LEVEL_LABEL: { high: 'สำคัญ', medium: 'ควรตรวจ', low: 'เล็กน้อย' },

  /** ชื่อคอลัมน์ในชีต (แสดงในแท็บตรวจสอบข้อมูล) */
  FIELD_LABEL: {
    no: 'ลำดับ', rentalYear: 'Rental Year', payment: 'Payment', company: 'Company', mediaType: 'Media Type',
    mediaSite: 'Media Site', epicoreCode: 'Epicore Code', vendorNo: 'Vendor No.', vendorName: 'Vendor name',
    partDesc: 'Part Description', partCode: 'Part Code', contractNo: 'Contract No.', startDate: 'Start Contract',
    endDate: 'End Contract', period: 'Period', contractStatus: 'Status Contract', rent: 'Rent',
    paymentTerm: 'Payment term', amountMonth: 'Amount/Month', amountYear: 'Amount/Year', adjust: 'Up or CN [Amount]',
    month: 'Month', dueDate: 'ว/ด/ป ชำระตามสัญญา', periodStart: 'รอบการจ่าย (เริ่มต้น)', periodEnd: 'รอบการจ่าย (สิ้นสุด)',
    payStatus: 'Status Payment', docType: 'รูปแบบ', sentDate: 'วันที่ส่งจัดซื้อ', pr: 'PR', po: 'PO',
    memoInv: 'MEMO/INV No.', docPeriod: 'รอบจ่ายตามเอกสาร', chequeDate: 'เช็คลงวันที่', ecmSent: 'Send ECM',
    ecmNo: 'ECM No.', remark: 'Remark'
  }
};
