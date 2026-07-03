// Chuẩn hoá CCCD: giữ lại chữ số
function normalizeCccd(value) {
  return String(value == null ? '' : value).replace(/\D/g, '');
}

// Chuẩn hoá SĐT: +84xxx / 84xxx -> 0xxx, bỏ ký tự thừa
function normalizePhone(value) {
  let digits = String(value == null ? '' : value).replace(/\D/g, '');
  if (digits.startsWith('84') && digits.length >= 10) digits = '0' + digits.slice(2);
  return digits;
}

function isValidCccd(cccd) {
  return /^\d{12}$/.test(cccd);
}

function isValidPhone(phone) {
  return /^0\d{9,10}$/.test(phone);
}

module.exports = { normalizeCccd, normalizePhone, isValidCccd, isValidPhone };
