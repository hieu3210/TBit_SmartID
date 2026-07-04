const crypto = require('crypto');

// SESSION_SECRET là khoá gốc duy nhất cần cấu hình khi triển khai.
// Không đặt thì tự sinh mỗi lần khởi động (chỉ phù hợp chạy thử local —
// trên Vercel/production BẮT BUỘC đặt để cookie đăng nhập và QR không bị vô hiệu mỗi lần cold start).
const ROOT_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

function derive(purpose) {
  return crypto.createHmac('sha256', ROOT_SECRET).update(purpose).digest('hex');
}

module.exports = {
  sessionSecret: ROOT_SECRET,
  cookieSecret: derive('cookie'),
  qrSecret: derive('qr'),
  resetSecret: derive('password-reset'),
};
