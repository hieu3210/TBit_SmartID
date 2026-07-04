const express = require('express');
const crypto = require('crypto');
const { query, nowVN } = require('../db');
const { rateLimit } = require('../middleware');
const { verifyCode } = require('../lib/qrtoken');
const { normalizeCccd, normalizePhone, isValidCccd, isValidPhone } = require('../lib/normalize');
const { DEFAULT_OPEN_FIELDS } = require('../lib/fields');
const { qrSecondsFor } = require('../lib/sysconfig');
const { maybeAutoClose } = require('../lib/autoclose');

const router = express.Router();

const DEVICE_COOKIE = 'tbit_did';
const ONE_YEAR = 365 * 24 * 3600 * 1000;

async function getSessionByToken(token) {
  const { rows } = await query('SELECT * FROM sessions WHERE token = $1', [token]);
  return maybeAutoClose(rows[0]); // hết giờ hẹn thì tự kết thúc ngay khi được truy cập
}

// Thông tin công khai của phiên (tên, trạng thái) cho trang điểm danh
router.get('/api/checkin/:token/info', rateLimit(60), async (req, res, next) => {
  try {
    const s = await getSessionByToken(req.params.token);
    if (!s) return res.status(404).json({ error: 'Không tìm thấy phiên điểm danh' });
    res.json({
      name: s.name, status: s.status, type: s.type,
      fields: s.type === 'open' ? (s.fields || DEFAULT_OPEN_FIELDS) : undefined,
    });
  } catch (e) { next(e); }
});

// Lấy/tạo mã thiết bị từ cookie ký (ràng buộc thiết bị chống điểm danh hộ)
function deviceIdOf(req, res) {
  let did = req.signedCookies[DEVICE_COOKIE];
  if (!did) {
    did = crypto.randomUUID();
    res.cookie(DEVICE_COOKIE, did, { signed: true, httpOnly: true, sameSite: 'lax', maxAge: ONE_YEAR });
  }
  return did;
}

// Ghi danh tự do (phiên không theo danh sách)
async function openCheckin(s, req, res) {
  const values = (req.body || {}).values || {};
  const fields = s.fields || DEFAULT_OPEN_FIELDS;
  const core = { full_name: null, cccd: null, phone: null, unit: null, email: null };
  const extra = {};

  for (const f of fields) {
    let v = String(values[f.key] == null ? '' : values[f.key]).trim();
    if (f.key === 'cccd') v = normalizeCccd(v);
    if (f.key === 'phone') v = normalizePhone(v);
    if (!v) {
      if (f.required) return res.status(400).json({ error: `Vui lòng điền ${f.label}` });
      continue;
    }
    if (f.key === 'cccd' && !isValidCccd(v)) return res.status(400).json({ error: 'Số CCCD không hợp lệ (cần đủ 12 chữ số)' });
    if (f.key === 'phone' && !isValidPhone(v)) return res.status(400).json({ error: 'Số điện thoại không hợp lệ' });
    if (v.length > 200) v = v.slice(0, 200);
    if (f.key in core) core[f.key] = v;
    else extra[f.label] = v;
  }

  // Chặn ghi danh trùng theo SĐT / CCCD
  if (core.phone) {
    const { rows } = await query('SELECT checked_in_at FROM attendees WHERE session_id = $1 AND phone = $2 LIMIT 1', [s.id, core.phone]);
    if (rows.length) return res.status(400).json({ error: `Số điện thoại này đã ghi danh lúc ${rows[0].checked_in_at}` });
  }
  if (core.cccd) {
    const { rows } = await query('SELECT checked_in_at FROM attendees WHERE session_id = $1 AND cccd = $2 LIMIT 1', [s.id, core.cccd]);
    if (rows.length) return res.status(400).json({ error: `Số CCCD này đã ghi danh lúc ${rows[0].checked_in_at}` });
  }

  // Ràng buộc thiết bị: từ lượt thứ 2 trên cùng máy thì gắn cờ chờ BTC duyệt
  const did = deviceIdOf(req, res);
  const usedBefore = (await query(
    `SELECT COUNT(*)::int AS n FROM attendees WHERE session_id = $1 AND device_id = $2 AND status = 'present'`,
    [s.id, did])).rows[0].n;
  const flag = usedBefore >= 1 ? 'review' : 'ok';

  const type = s.status === 'supplement' ? 'supplement' : 'qr';
  const checkedInAt = nowVN();
  await query(
    `INSERT INTO attendees (session_id, stt, cccd, full_name, unit, phone, email, extra, status, checked_in_at, checkin_type, device_id, client_ip, flag)
     VALUES ($1, (SELECT COALESCE(MAX(stt), 0) + 1 FROM attendees WHERE session_id = $1),
             $2, $3, $4, $5, $6, $7, 'present', $8, $9, $10, $11, $12)`,
    [s.id, core.cccd, core.full_name, core.unit, core.phone, core.email,
      Object.keys(extra).length ? JSON.stringify(extra) : null,
      checkedInAt, type, did, req.ip, flag]
  );

  res.json({
    ok: true,
    full_name: core.full_name,
    unit: core.unit,
    checked_in_at: checkedInAt,
    flagged: flag === 'review',
    message: flag === 'review'
      ? 'Đã ghi nhận, tuy nhiên thiết bị này vừa ghi danh cho người khác nên lượt của bạn cần ban tổ chức xác nhận.'
      : 'Ghi danh thành công. Chào mừng bạn đến với sự kiện!',
  });
}

// Điểm danh
router.post('/api/checkin/:token', rateLimit(15), async (req, res, next) => {
  try {
    const s = await getSessionByToken(req.params.token);
    if (!s) return res.status(404).json({ error: 'Không tìm thấy phiên điểm danh' });
    if (s.status !== 'open' && s.status !== 'supplement') {
      return res.status(400).json({ error: 'Phiên chưa mở hoặc đã kết thúc điểm danh' });
    }

    // Lớp 1: mã QR động — ảnh chụp QR cũ hết hạn ngay sau chu kỳ đổi mã
    const { cccd, phone, c } = req.body || {};
    if (!verifyCode(s.token, String(c || ''), await qrSecondsFor(s))) {
      return res.status(400).json({ error: 'Mã QR đã hết hạn — vui lòng quét lại mã đang hiển thị trên màn hình' });
    }

    // Phiên ghi danh tự do: không đối chiếu danh sách, tạo bản ghi mới
    if (s.type === 'open') return await openCheckin(s, req, res);

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
    const did = deviceIdOf(req, res);
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
