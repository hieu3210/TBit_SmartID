const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../db');
const { requireAuth, rateLimit } = require('../middleware');

const router = express.Router();

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
    const { rows } = await query('SELECT id, username, role, must_change_password FROM users WHERE id = $1', [req.session.user.id]);
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

module.exports = router;
