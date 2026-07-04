const express = require('express');
const bcrypt = require('bcryptjs');
const { query, nowVN } = require('../db');
const { requireAdmin } = require('../middleware');

const router = express.Router();
router.use(requireAdmin);

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT id, username, full_name, email, role, created_at FROM users ORDER BY id');
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { username, password, role, full_name, email } = req.body || {};
    const name = String(username || '').trim();
    const fullName = String(full_name || '').trim();
    const mail = String(email || '').trim().toLowerCase();
    if (!/^[a-zA-Z0-9_.-]{3,30}$/.test(name)) return res.status(400).json({ error: 'Tên đăng nhập 3-30 ký tự, chỉ gồm chữ, số, dấu . _ -' });
    if (!fullName) return res.status(400).json({ error: 'Vui lòng nhập họ và tên' });
    if (!validEmail(mail)) return res.status(400).json({ error: 'Email không hợp lệ' });
    if (!password || String(password).length < 6) return res.status(400).json({ error: 'Mật khẩu phải có ít nhất 6 ký tự' });
    const r = role === 'admin' ? 'admin' : 'user';
    const { rows } = await query(
      'INSERT INTO users (username, password_hash, role, must_change_password, created_at, full_name, email) VALUES ($1, $2, $3, true, $4, $5, $6) RETURNING id',
      [name, bcrypt.hashSync(String(password), 10), r, nowVN(), fullName, mail]
    );
    res.json({ id: rows[0].id, username: name, role: r, full_name: fullName, email: mail });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Tên đăng nhập đã tồn tại' });
    next(e);
  }
});

// Sửa họ tên / email / vai trò
router.put('/:id', async (req, res, next) => {
  try {
    const { full_name, email, role } = req.body || {};
    const fullName = String(full_name || '').trim();
    const mail = String(email || '').trim().toLowerCase();
    if (!fullName) return res.status(400).json({ error: 'Vui lòng nhập họ và tên' });
    if (!validEmail(mail)) return res.status(400).json({ error: 'Email không hợp lệ' });
    const r = role === 'admin' ? 'admin' : 'user';
    if (Number(req.params.id) === req.session.user.id && r !== 'admin') {
      return res.status(400).json({ error: 'Không thể tự hạ quyền tài khoản đang đăng nhập' });
    }
    const q = await query('UPDATE users SET full_name = $1, email = $2, role = $3 WHERE id = $4',
      [fullName, mail, r, req.params.id]);
    if (!q.rowCount) return res.status(404).json({ error: 'Không tìm thấy người dùng' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Đặt lại mật khẩu
router.put('/:id/password', async (req, res, next) => {
  try {
    const { password } = req.body || {};
    if (!password || String(password).length < 6) return res.status(400).json({ error: 'Mật khẩu phải có ít nhất 6 ký tự' });
    const r = await query('UPDATE users SET password_hash = $1, must_change_password = true WHERE id = $2',
      [bcrypt.hashSync(String(password), 10), req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'Không tìm thấy người dùng' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM users WHERE id = $1', [req.params.id]);
    const target = rows[0];
    if (!target) return res.status(404).json({ error: 'Không tìm thấy người dùng' });
    if (target.id === req.session.user.id) return res.status(400).json({ error: 'Không thể tự xoá tài khoản đang đăng nhập' });
    const owns = (await query('SELECT COUNT(*)::int AS n FROM sessions WHERE owner_id = $1', [target.id])).rows[0].n;
    if (owns > 0) return res.status(400).json({ error: `Người dùng đang sở hữu ${owns} phiên điểm danh, không thể xoá` });
    await query('DELETE FROM users WHERE id = $1', [target.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
