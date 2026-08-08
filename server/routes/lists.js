const express = require('express');
const { query } = require('../db');
const { requireAuth } = require('../middleware');
const { listShares, setShares } = require('../lib/shares');

const router = express.Router();
router.use(requireAuth);

// Nạp danh sách đã lưu theo :id kèm quyền: chủ sở hữu / admin mới sửa được chia sẻ
async function loadList(req, res) {
  const u = req.session.user;
  const { rows } = await query(
    `SELECT sl.*, (ls.user_id IS NOT NULL) AS shared_with_me
     FROM saved_lists sl
     LEFT JOIN list_shares ls ON ls.list_id = sl.id AND ls.user_id = $2
     WHERE sl.id = $1 AND (sl.owner_id = $2 OR ls.user_id IS NOT NULL OR $3)`,
    [req.params.id, u.id, u.role === 'admin']);
  if (!rows.length) {
    res.status(404).json({ error: 'Không tìm thấy danh sách đã lưu' });
    return null;
  }
  return rows[0];
}

// Danh sách của chính mình + danh sách được người khác chia sẻ
router.get('/', async (req, res, next) => {
  try {
    const u = req.session.user;
    const { rows } = await query(
      `SELECT sl.id, sl.name, sl.created_at, sl.owner_id,
              jsonb_array_length(sl.data) AS count,
              o.username AS owner, o.full_name AS owner_name,
              (sl.owner_id <> $1) AS shared_with_me,
              (SELECT COUNT(*) FROM list_shares x WHERE x.list_id = sl.id)::int AS share_count
       FROM saved_lists sl
       JOIN users o ON o.id = sl.owner_id
       LEFT JOIN list_shares ls ON ls.list_id = sl.id AND ls.user_id = $1
       WHERE sl.owner_id = $1 OR ls.user_id IS NOT NULL
       ORDER BY sl.id DESC`,
      [u.id]);
    res.json(rows);
  } catch (e) { next(e); }
});

// Người được chia sẻ chỉ dùng lại danh sách, không xoá được của người khác
router.delete('/:id', async (req, res, next) => {
  try {
    const u = req.session.user;
    const cond = u.role === 'admin' ? '' : ' AND owner_id = $2';
    const params = u.role === 'admin' ? [req.params.id] : [req.params.id, u.id];
    const r = await query(`DELETE FROM saved_lists WHERE id = $1${cond}`, params);
    if (!r.rowCount) return res.status(404).json({ error: 'Không tìm thấy danh sách đã lưu của bạn' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* ===== Chia sẻ danh sách đã lưu ===== */

router.get('/:id/shares', async (req, res, next) => {
  try {
    const list = await loadList(req, res);
    if (!list) return;
    res.json({
      can_manage: list.owner_id === req.session.user.id || req.session.user.role === 'admin',
      owner_id: list.owner_id,
      shares: await listShares('list', list.id),
    });
  } catch (e) { next(e); }
});

// Đặt lại toàn bộ danh sách người được chia sẻ (chỉ chủ sở hữu / admin)
router.put('/:id/shares', async (req, res, next) => {
  try {
    const list = await loadList(req, res);
    if (!list) return;
    if (list.owner_id !== req.session.user.id && req.session.user.role !== 'admin') {
      return res.status(403).json({ error: 'Chỉ người lưu danh sách mới thay đổi được chia sẻ' });
    }
    await setShares('list', list.id, (req.body || {}).user_ids, list.owner_id);
    res.json({ ok: true, shares: await listShares('list', list.id) });
  } catch (e) { next(e); }
});

module.exports = router;
