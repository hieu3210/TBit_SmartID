const express = require('express');
const { query } = require('../db');
const { requireAuth } = require('../middleware');

const router = express.Router();
router.use(requireAuth);

// Danh sách đã lưu của chính người dùng
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, name, created_at, jsonb_array_length(data) AS count
       FROM saved_lists WHERE owner_id = $1 ORDER BY id DESC`,
      [req.session.user.id]);
    res.json(rows);
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const r = await query('DELETE FROM saved_lists WHERE id = $1 AND owner_id = $2',
      [req.params.id, req.session.user.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'Không tìm thấy danh sách đã lưu' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
