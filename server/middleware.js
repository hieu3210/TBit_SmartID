const { query } = require('./db');
const { maybeAutoClose } = require('./lib/autoclose');
const { isSharedWith } = require('./lib/shares');

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Chưa đăng nhập' });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Chưa đăng nhập' });
  if (req.session.user.role !== 'admin') return res.status(403).json({ error: 'Cần quyền quản trị' });
  next();
}

// Nạp phiên điểm danh theo :id, kiểm tra quyền sở hữu (admin xem được tất cả).
// Người được chia sẻ có toàn quyền quản lý phiên như người tạo; riêng việc đổi
// danh sách chia sẻ vẫn thuộc về người tạo (hoặc admin) — xem requireSessionOwner.
async function loadOwnedSession(req, res, next) {
  try {
    const { rows } = await query('SELECT * FROM sessions WHERE id = $1', [req.params.id]);
    const s = rows[0];
    if (!s) return res.status(404).json({ error: 'Không tìm thấy phiên điểm danh' });
    const u = req.session.user;
    const isOwner = s.owner_id === u.id;
    const shared = !isOwner && await isSharedWith('session', s.id, u.id);
    if (!isOwner && !shared && u.role !== 'admin') return res.status(403).json({ error: 'Bạn không có quyền với phiên này' });
    req.attSession = await maybeAutoClose(s);
    req.sessionShared = shared;                            // đang xem phiên được chia sẻ
    req.canManageShares = isOwner || u.role === 'admin';   // được sửa danh sách chia sẻ
    next();
  } catch (e) { next(e); }
}

// Chỉ người tạo phiên (hoặc admin) mới đổi được danh sách chia sẻ
function requireSessionOwner(req, res, next) {
  if (!req.canManageShares) return res.status(403).json({ error: 'Chỉ người tạo phiên mới thay đổi được chia sẻ' });
  next();
}

// Rate-limit đơn giản theo IP (chống dò CCCD). Lưu ý: đếm theo từng instance —
// trên serverless chỉ mang tính giảm thiểu, đủ dùng cho quy mô sự kiện.
const buckets = new Map();
function rateLimit(maxPerMinute) {
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip;
    let b = buckets.get(key);
    if (!b || now - b.start > 60000) { b = { start: now, count: 0 }; buckets.set(key, b); }
    b.count += 1;
    if (b.count > maxPerMinute) return res.status(429).json({ error: 'Thao tác quá nhanh, vui lòng thử lại sau ít phút' });
    next();
  };
}

module.exports = { requireAuth, requireAdmin, loadOwnedSession, requireSessionOwner, rateLimit };
