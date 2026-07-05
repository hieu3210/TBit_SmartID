const { getSetting, setSetting } = require('../db');

const ENV_QR_SECONDS = parseInt(process.env.QR_ROTATE_SECONDS || '30', 10);

// Chu kỳ đổi QR mặc định của hệ thống (admin đặt trong Quản trị; fallback biến môi trường)
async function systemQrSeconds() {
  const v = parseInt(await getSetting('qr_rotate_seconds'), 10);
  return Number.isFinite(v) && v >= 5 && v <= 300 ? v : ENV_QR_SECONDS;
}

async function saveSystemQrSeconds(v) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n) || n < 5 || n > 300) throw new Error('Chu kỳ đổi QR phải từ 5 đến 300 giây');
  await setSetting('qr_rotate_seconds', String(n));
  return n;
}

// Chu kỳ QR của một phiên: qr_seconds riêng (0 = mã cố định) hoặc mặc định hệ thống
async function qrSecondsFor(session) {
  if (session.qr_seconds != null) return session.qr_seconds;
  return systemQrSeconds();
}

/* ===== SMTP ===== */

async function getSmtp() {
  try {
    const raw = await getSetting('smtp');
    const cfg = raw ? JSON.parse(raw) : null;
    return cfg && cfg.host ? cfg : null;
  } catch (e) { return null; }
}

async function saveSmtp(input) {
  const cfg = {
    host: String((input || {}).host || '').trim(),
    port: parseInt((input || {}).port, 10) || 587,
    user: String((input || {}).user || '').trim(),
    pass: String((input || {}).pass || ''),
    from: String((input || {}).from || '').trim(),
  };
  if (!cfg.host) throw new Error('Vui lòng nhập máy chủ SMTP');
  // Không nhập mật khẩu mới thì giữ mật khẩu cũ
  if (!cfg.pass) {
    const old = await getSmtp();
    if (old && old.pass) cfg.pass = old.pass;
  }
  await setSetting('smtp', JSON.stringify(cfg));
  return cfg;
}

module.exports = { systemQrSeconds, saveSystemQrSeconds, qrSecondsFor, getSmtp, saveSmtp };
