const { query } = require('./db');
const { maybeAutoClose } = require('./lib/autoclose');

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Chưa đăng nhập' });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Chưa đăng nhập' });
  if (req.session.user.role !== 'admin') return res.status(403).json({ error: 'Cần quyền quản trị' });
  next();
}

// Nạp phiên điểm danh theo :id, kiểm tra quyền sở hữu (admin xem được tất cả)
async function loadOwnedSession(req, res, next) {
  try {
    const { rows } = await query('SELECT * FROM sessions WHERE id = $1', [req.params.id]);
    const s = rows[0];
    if (!s) return res.status(404).json({ error: 'Không tìm thấy phiên điểm danh' });
    const u = req.session.user;
    if (s.owner_id !== u.id && u.role !== 'admin') return res.status(403).json({ error: 'Bạn không có quyền với phiên này' });
    req.attSession = await maybeAutoClose(s);
    next();
  } catch (e) { next(e); }
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

module.exports = { requireAuth, requireAdmin, loadOwnedSession, rateLimit };
