const crypto = require('crypto');
const { qrSecret } = require('./secrets');

function codeFor(token, windowIndex) {
  return crypto.createHmac('sha256', qrSecret)
    .update(`${token}:${windowIndex}`)
    .digest('hex')
    .slice(0, 8);
}

function currentWindow(rotateSeconds) {
  return Math.floor(Date.now() / 1000 / rotateSeconds);
}

// rotateSeconds = 0 → mã cố định (không đổi theo thời gian)
function currentCode(token, rotateSeconds) {
  if (!rotateSeconds) return codeFor(token, 'fixed');
  return codeFor(token, currentWindow(rotateSeconds));
}

function secondsLeft(rotateSeconds) {
  if (!rotateSeconds) return 0;
  return rotateSeconds - (Math.floor(Date.now() / 1000) % rotateSeconds);
}

// Chấp nhận mã của cửa sổ hiện tại và cửa sổ liền trước (người quét sát lúc đổi mã)
function verifyCode(token, code, rotateSeconds) {
  if (!code) return false;
  if (!rotateSeconds) return code === codeFor(token, 'fixed');
  const w = currentWindow(rotateSeconds);
  return code === codeFor(token, w) || code === codeFor(token, w - 1);
}

module.exports = { currentCode, secondsLeft, verifyCode };
