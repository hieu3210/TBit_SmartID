const crypto = require('crypto');
const { qrSecret } = require('./secrets');

const ROTATE_SECONDS = parseInt(process.env.QR_ROTATE_SECONDS || '30', 10);

function codeFor(token, windowIndex) {
  return crypto.createHmac('sha256', qrSecret)
    .update(`${token}:${windowIndex}`)
    .digest('hex')
    .slice(0, 8);
}

function currentWindow() {
  return Math.floor(Date.now() / 1000 / ROTATE_SECONDS);
}

function currentCode(token) {
  return codeFor(token, currentWindow());
}

function secondsLeft() {
  return ROTATE_SECONDS - (Math.floor(Date.now() / 1000) % ROTATE_SECONDS);
}

// Chấp nhận mã của cửa sổ hiện tại và cửa sổ liền trước (người quét sát lúc đổi mã)
function verifyCode(token, code) {
  if (!code) return false;
  const w = currentWindow();
  return code === codeFor(token, w) || code === codeFor(token, w - 1);
}

module.exports = { ROTATE_SECONDS, currentCode, secondsLeft, verifyCode };
