const { query, nowVN } = require('../db');

// Hai loại đối tượng chia sẻ dùng chung cấu trúc bảng (khoá đối tượng + user_id).
// Tên bảng/cột lấy từ bảng tra cứu cố định này nên nội suy vào SQL là an toàn.
const KINDS = {
  session: { table: 'session_shares', key: 'session_id' },
  list: { table: 'list_shares', key: 'list_id' },
};

// Người dùng đang được chia sẻ một phiên / danh sách
async function listShares(kind, id) {
  const k = KINDS[kind];
  const { rows } = await query(
    `SELECT u.id, u.username, u.full_name, s.created_at
     FROM ${k.table} s JOIN users u ON u.id = s.user_id
     WHERE s.${k.key} = $1 ORDER BY COALESCE(u.full_name, u.username), u.username`, [id]);
  return rows;
}

// Đặt lại toàn bộ danh sách người được chia sẻ (bỏ chủ sở hữu và id không tồn tại)
async function setShares(kind, id, userIds, ownerId) {
  const k = KINDS[kind];
  const wanted = [...new Set((Array.isArray(userIds) ? userIds : [])
    .map((v) => parseInt(v, 10))
    .filter((v) => Number.isInteger(v) && v !== ownerId))];
  let valid = [];
  if (wanted.length) {
    const { rows } = await query('SELECT id FROM users WHERE id = ANY($1::int[])', [wanted]);
    valid = rows.map((r) => r.id);
  }
  await query(`DELETE FROM ${k.table} WHERE ${k.key} = $1`, [id]);
  if (valid.length) {
    await query(
      `INSERT INTO ${k.table} (${k.key}, user_id, created_at)
       SELECT $1, uid, $2 FROM UNNEST($3::int[]) AS uid`, [id, nowVN(), valid]);
  }
  return valid;
}

// Người dùng này có được chia sẻ đối tượng không?
async function isSharedWith(kind, id, userId) {
  const k = KINDS[kind];
  const { rows } = await query(
    `SELECT 1 FROM ${k.table} WHERE ${k.key} = $1 AND user_id = $2`, [id, userId]);
  return rows.length > 0;
}

module.exports = { listShares, setShares, isSharedWith };
