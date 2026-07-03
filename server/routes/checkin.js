const express = require('express');
const crypto = require('crypto');
const { query, nowVN } = require('../db');
const { rateLimit } = require('../middleware');
const { verifyCode } = require('../lib/qrtoken');
const { normalizeCccd, normalizePhone } = require('../lib/normalize');

const router = express.Router();

const DEVICE_COOKIE = 'tbit_did';
const ONE_YEAR = 365 * 24 * 3600 * 1000;

async function getSessionByToken(token) {
  const { rows } = await query('SELECT * FROM sessions WHERE token = $1', [token]);
  return rows[0];
}

// Thông tin công khai của phiên (tên, trạng thái) cho trang điểm danh
router.get('/api/checkin/:token/info', rateLimit(60), async (req, res, next) => {
  try {
    const s = await getSessionByToken(req.params.token);
    if (!s) return res.status(404).json({ error: 'Không tìm thấy phiên điểm danh' });
    res.json({ name: s.name, status: s.status });
  } catch (e) { next(e); }
});

// Điểm danh
router.post('/api/checkin/:token', rateLimit(15), async (req, res, next) => {
  try {
    const s = await getSessionByToken(req.params.token);
    if (!s) return res.status(404).json({ error: 'Không tìm thấy phiên điểm danh' });
    if (s.status !== 'open' && s.status !== 'supplement') {
      return res.status(400).json({ error: 'Phiên chưa mở hoặc đã kết thúc điểm danh' });
    }

    // Lớp 1: mã QR động — ảnh chụp QR cũ hết hạn sau ~1 phút
    const { cccd, phone, c } = req.body || {};
    if (!verifyCode(s.token, String(c || ''))) {
      return res.status(400).json({ error: 'Mã QR đã hết hạn — vui lòng quét lại mã đang hiển thị trên màn hình' });
    }

    const nCccd = normalizeCccd(cccd);
    const nPhone = normalizePhone(phone);
    if (!nCccd || !nPhone) return res.status(400).json({ error: 'Vui lòng nhập đủ số CCCD và số điện thoại' });

    const { rows } = await query('SELECT * FROM attendees WHERE session_id = $1 AND cccd = $2', [s.id, nCccd]);
    const a = rows[0];
    if (!a) return res.status(404).json({ error: 'Số CCCD không có trong danh sách sự kiện — vui lòng liên hệ ban tổ chức' });
    if (normalizePhone(a.phone) !== nPhone) return res.status(400).json({ error: 'Số điện thoại không khớp với danh sách đăng ký' });
    if (a.status === 'present') {
      return res.status(400).json({ error: `Bạn đã điểm danh lúc ${a.checked_in_at}` });
    }

    // Lớp 1: ràng buộc thiết bị — thiết bị thứ 2 trở đi bị gắn cờ chờ BTC duyệt
    let did = req.signedCookies[DEVICE_COOKIE];
    if (!did) {
      did = crypto.randomUUID();
      res.cookie(DEVICE_COOKIE, did, { signed: true, httpOnly: true, sameSite: 'lax', maxAge: ONE_YEAR });
    }
    const usedBefore = (await query(
      `SELECT COUNT(*)::int AS n FROM attendees WHERE session_id = $1 AND device_id = $2 AND status = 'present'`,
      [s.id, did])).rows[0].n;
    const flag = usedBefore >= 1 ? 'review' : 'ok';

    const type = s.status === 'supplement' ? 'supplement' : 'qr';
    const checkedInAt = nowVN();
    await query(
      `UPDATE attendees SET status = 'present', checked_in_at = $1, checkin_type = $2, device_id = $3, client_ip = $4, flag = $5 WHERE id = $6`,
      [checkedInAt, type, did, req.ip, flag, a.id]
    );

    res.json({
      ok: true,
      full_name: a.full_name,
      unit: a.unit,
      checked_in_at: checkedInAt,
      flagged: flag === 'review',
      message: flag === 'review'
        ? 'Đã ghi nhận, tuy nhiên thiết bị này vừa điểm danh cho người khác nên lượt của bạn cần ban tổ chức xác nhận.'
        : 'Điểm danh thành công. Chào mừng bạn đến với sự kiện!',
    });
  } catch (e) { next(e); }
});

module.exports = router;
