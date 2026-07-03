// Đặt lại mật khẩu admin về admin123 (chạy khi quên mật khẩu): npm run reset-admin
const bcrypt = require('bcryptjs');
const { query, nowVN, pool } = require('./db');

(async () => {
  const r = await query("UPDATE users SET password_hash = $1, must_change_password = true WHERE username = 'admin'",
    [bcrypt.hashSync('admin123', 10)]);
  if (r.rowCount) {
    console.log('Đã đặt lại mật khẩu: admin / admin123 (bắt buộc đổi khi đăng nhập)');
  } else {
    await query("INSERT INTO users (username, password_hash, role, must_change_password, created_at) VALUES ('admin', $1, 'admin', true, $2)",
      [bcrypt.hashSync('admin123', 10), nowVN()]);
    console.log('Đã tạo lại tài khoản admin / admin123');
  }
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
