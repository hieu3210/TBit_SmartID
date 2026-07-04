const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { query } = require('../db');
const { requireAuth, rateLimit } = require('../middleware');
const { resetSecret } = require('../lib/secrets');
const { sendMail, emailLayout } = require('../lib/mailer');

const router = express.Router();

/* Token đặt lại mật khẩu: stateless, ký HMAC kèm password_hash hiện tại
   → token tự vô hiệu sau khi đổi mật khẩu, không cần bảng lưu token. */
const RESET_TTL_MS = 30 * 60 * 1000; // 30 phút

function signReset(userId, exp, passwordHash) {
  return crypto.createHmac('sha256', resetSecret).update(`${userId}.${exp}.${passwordHash}`).digest('hex');
}

function makeResetToken(user) {
  const exp = Date.now() + RESET_TTL_MS;
  return `${user.id}.${exp}.${signReset(user.id, exp, user.password_hash)}`;
}

async function verifyResetToken(token) {
  const [idStr, expStr, sig] = String(token || '').split('.');
  const id = parseInt(idStr, 10);
  const exp = parseInt(expStr, 10);
  if (!id || !exp || !sig || Date.now() > exp) return null;
  const { rows } = await query('SELECT * FROM users WHERE id = $1', [id]);
  if (!rows.length) return null;
  const expected = signReset(id, exp, rows[0].password_hash);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  return rows[0];
}

router.post('/login', rateLimit(20), async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    const { rows } = await query('SELECT * FROM users WHERE username = $1', [String(username || '').trim()]);
    const user = rows[0];
    if (!user || !bcrypt.compareSync(String(password || ''), user.password_hash)) {
      return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' });
    }
    req.session.user = { id: user.id, username: user.username, role: user.role };
    res.json({ id: user.id, username: user.username, role: user.role, must_change_password: user.must_change_password });
  } catch (e) { next(e); }
});

router.post('/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query('SELECT id, username, full_name, email, role, must_change_password FROM users WHERE id = $1', [req.session.user.id]);
    if (!rows.length) { req.session = null; return res.status(401).json({ error: 'Tài khoản không còn tồn tại' }); }
    res.json(rows[0]);
  } catch (e) { next(e); }
});

router.post('/change-password', requireAuth, async (req, res, next) => {
  try {
    const { old_password, new_password } = req.body || {};
    if (!new_password || String(new_password).length < 6) {
      return res.status(400).json({ error: 'Mật khẩu mới phải có ít nhất 6 ký tự' });
    }
    const { rows } = await query('SELECT * FROM users WHERE id = $1', [req.session.user.id]);
    if (!rows.length || !bcrypt.compareSync(String(old_password || ''), rows[0].password_hash)) {
      return res.status(400).json({ error: 'Mật khẩu hiện tại không đúng' });
    }
    await query('UPDATE users SET password_hash = $1, must_change_password = false WHERE id = $2',
      [bcrypt.hashSync(String(new_password), 10), rows[0].id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Quên mật khẩu: gửi link đặt lại qua email (nhập username hoặc email)
router.post('/forgot', rateLimit(5), async (req, res) => {
  const generic = { ok: true, message: 'Nếu tài khoản tồn tại và có email, hệ thống đã gửi link đặt lại mật khẩu. Vui lòng kiểm tra hộp thư (kể cả mục Spam).' };
  try {
    const ident = String((req.body || {}).username || '').trim().toLowerCase();
    if (!ident) return res.json(generic);
    const { rows } = await query(
      'SELECT * FROM users WHERE LOWER(username) = $1 OR LOWER(email) = $1 ORDER BY id LIMIT 1', [ident]);
    const user = rows[0];
    if (!user || !user.email) return res.json(generic); // không tiết lộ tài khoản nào tồn tại
    const base = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    const link = `${base}/reset.html?token=${encodeURIComponent(makeResetToken(user))}`;
    await sendMail({
      to: user.email,
      subject: '[TBit SmartID] Đặt lại mật khẩu',
      html: emailLayout('Đặt lại mật khẩu', `
        <p>Xin chào <b>${user.full_name || user.username}</b>,</p>
        <p>Bạn (hoặc ai đó) vừa yêu cầu đặt lại mật khẩu cho tài khoản <b>${user.username}</b>.</p>
        <p style="margin:18px 0;"><a href="${link}" style="background:#1a56db;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold;">Đặt lại mật khẩu</a></p>
        <p>Link có hiệu lực trong <b>30 phút</b> và chỉ dùng được một lần. Nếu không phải bạn yêu cầu, hãy bỏ qua email này.</p>`),
    });
    res.json(generic);
  } catch (e) {
    // Lỗi SMTP → báo rõ để người dùng liên hệ quản trị viên
    res.status(400).json({ error: e.message });
  }
});

// Đặt mật khẩu mới bằng token trong email
router.post('/reset', rateLimit(10), async (req, res, next) => {
  try {
    const { token, password } = req.body || {};
    if (!password || String(password).length < 6) {
      return res.status(400).json({ error: 'Mật khẩu mới phải có ít nhất 6 ký tự' });
    }
    const user = await verifyResetToken(token);
    if (!user) return res.status(400).json({ error: 'Link đặt lại không hợp lệ hoặc đã hết hạn — hãy yêu cầu lại' });
    await query('UPDATE users SET password_hash = $1, must_change_password = false WHERE id = $2',
      [bcrypt.hashSync(String(password), 10), user.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
