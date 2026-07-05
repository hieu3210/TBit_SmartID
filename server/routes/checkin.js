const express = require('express');
const crypto = require('crypto');
const { query, nowVN } = require('../db');
const { rateLimit } = require('../middleware');
const { verifyCode } = require('../lib/qrtoken');
const { normalizeCccd, normalizePhone, isValidCccd, isValidPhone } = require('../lib/normalize');
const { getListFields, checkinFieldDefs, sessionFieldConfig, formFields } = require('../lib/fields');
const { qrSecondsFor } = require('../lib/sysconfig');
const { maybeAutoClose } = require('../lib/autoclose');

const router = express.Router();

const DEVICE_COOKIE = 'tbit_did';
const ONE_YEAR = 365 * 24 * 3600 * 1000;
const CORE_KEYS = ['cccd', 'full_name', 'unit', 'phone', 'email'];

async function getSessionByToken(token) {
  const { rows } = await query('SELECT * FROM sessions WHERE token = $1', [token]);
  return maybeAutoClose(rows[0]); // hết giờ hẹn thì tự kết thúc ngay khi được truy cập
}

// Thông tin công khai của phiên cho trang điểm danh
router.get('/api/checkin/:token/info', rateLimit(60), async (req, res, next) => {
  try {
    const s = await getSessionByToken(req.params.token);
    if (!s) return res.status(404).json({ error: 'Không tìm thấy phiên điểm danh' });
    const lang = req.query.lang === 'en' ? 'en' : 'vi';
    const global = await getListFields();
    const out = { name: s.name, status: s.status, type: s.type };
    if (s.type === 'open') {
      out.fields = formFields(sessionFieldConfig(s, global), lang);
    } else {
      out.checkin_fields = checkinFieldDefs(s, global, lang);
      out.allow_open = !!s.allow_open;
      if (s.allow_open) out.open_fields = formFields(sessionFieldConfig(s, global), lang);
    }
    res.json(out);
  } catch (e) { next(e); }
});

function deviceIdOf(req, res) {
  let did = req.signedCookies[DEVICE_COOKIE];
  if (!did) {
    did = crypto.randomUUID();
    res.cookie(DEVICE_COOKIE, did, { signed: true, httpOnly: true, sameSite: 'lax', maxAge: ONE_YEAR });
  }
  return did;
}

async function deviceFlag(sessionId, did) {
  const usedBefore = (await query(
    `SELECT COUNT(*)::int AS n FROM attendees WHERE session_id = $1 AND device_id = $2 AND status = 'present'`,
    [sessionId, did])).rows[0].n;
  return usedBefore >= 1 ? 'review' : 'ok';
}

// Tên hiển thị: ưu tiên Họ và tên, không có thì dùng SĐT/CCCD
function displayName(a) {
  return (a && (a.full_name || a.phone || a.cccd)) || 'Bạn';
}

function successPayload(fullName, unit, checkedInAt, flag, verb) {
  return {
    ok: true, full_name: fullName, unit: unit || '', checked_in_at: checkedInAt,
    flagged: flag === 'review',
    message: flag === 'review'
      ? `Đã ghi nhận, tuy nhiên thiết bị này vừa ${verb} cho người khác nên lượt của bạn cần ban tổ chức xác nhận.`
      : `${verb === 'ghi danh' ? 'Ghi danh' : 'Điểm danh'} thành công. Chào mừng bạn đến với sự kiện!`,
  };
}

// Ghi danh tự do: phiên "không theo danh sách", hoặc nhánh walk-in của phiên theo danh sách.
// self = true khi là walk-in trên phiên danh sách (đánh dấu ghi danh thêm).
async function openCheckin(s, req, res, { self = false } = {}) {
  const values = (req.body || {}).values || {};
  const fields = formFields(sessionFieldConfig(s, await getListFields()));
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
    v = v.slice(0, 200);
    if (f.key in core) core[f.key] = v;
    else extra[f.key] = v; // trường custom lưu theo khoá ổn định
  }

  // Đã có trong danh sách (theo CCCD/SĐT)? Nếu chưa điểm danh thì đánh dấu có mặt, tránh trùng.
  let existing = null;
  if (core.cccd) existing = (await query('SELECT * FROM attendees WHERE session_id = $1 AND cccd = $2 LIMIT 1', [s.id, core.cccd])).rows[0] || null;
  if (!existing && core.phone) existing = (await query('SELECT * FROM attendees WHERE session_id = $1 AND phone = $2 LIMIT 1', [s.id, core.phone])).rows[0] || null;
  if (existing && existing.status === 'present') {
    return res.status(400).json({ error: `Thông tin này đã ${self ? 'ghi danh' : 'điểm danh'} lúc ${existing.checked_in_at}` });
  }

  const did = deviceIdOf(req, res);
  const flag = await deviceFlag(s.id, did);
  const type = s.status === 'supplement' ? 'supplement' : 'qr';
  const checkedInAt = nowVN();

  if (existing) {
    await query(
      `UPDATE attendees SET status = 'present', checked_in_at = $1, checkin_type = $2, device_id = $3, client_ip = $4, flag = $5 WHERE id = $6`,
      [checkedInAt, type, did, req.ip, flag, existing.id]);
    return res.json(successPayload(displayName(existing), existing.unit, checkedInAt, flag, 'điểm danh'));
  }
  await query(
    `INSERT INTO attendees (session_id, stt, cccd, full_name, unit, phone, email, extra, status, checked_in_at, checkin_type, device_id, client_ip, flag, self_registered)
     VALUES ($1, (SELECT COALESCE(MAX(stt), 0) + 1 FROM attendees WHERE session_id = $1),
             $2, $3, $4, $5, $6, $7, 'present', $8, $9, $10, $11, $12, $13)`,
    [s.id, core.cccd, core.full_name, core.unit, core.phone, core.email,
      Object.keys(extra).length ? JSON.stringify(extra) : null,
      checkedInAt, type, did, req.ip, flag, self]
  );
  return res.json(successPayload(displayName(core), core.unit, checkedInAt, flag, 'ghi danh'));
}

// So khớp giá trị theo loại trường
function normField(key, v) {
  if (key === 'cccd') return normalizeCccd(v);
  if (key === 'phone') return normalizePhone(v);
  return String(v == null ? '' : v).trim().toLowerCase();
}
function storedField(a, key) {
  return CORE_KEYS.includes(key) ? a[key] : (a.extra && a.extra[key]);
}

// Điểm danh theo danh sách: khớp các trường bắt buộc do phiên cấu hình
async function listCheckin(s, req, res) {
  const defs = checkinFieldDefs(s, await getListFields());
  const body = req.body || {};
  // Nhận values{...}; tương thích ngược với trang cũ gửi cccd/phone rời
  const values = body.values || { cccd: body.cccd, phone: body.phone };

  const entered = {};
  for (const f of defs) {
    const v = normField(f.key, values[f.key]);
    if (!v) return res.status(400).json({ error: `Vui lòng nhập ${f.label}` });
    entered[f.key] = v;
  }

  // Tìm theo trường định danh chính (CCCD ưu tiên, rồi SĐT), sau đó đối chiếu các trường còn lại
  const primary = defs.find((f) => f.key === 'cccd') || defs.find((f) => f.key === 'phone') || defs[0];
  const col = primary.key; // 'cccd' hoặc 'phone' (đã đảm bảo ở cấu hình)
  const { rows: candidates } = await query(
    `SELECT * FROM attendees WHERE session_id = $1 AND ${col} = $2`, [s.id, entered[col]]);

  const matched = candidates.filter((a) => defs.every((f) => normField(f.key, storedField(a, f.key)) === entered[f.key]));
  if (matched.length === 0) {
    return res.status(404).json({ error: 'Không tìm thấy thông tin trong danh sách sự kiện — vui lòng kiểm tra lại hoặc liên hệ ban tổ chức' });
  }
  if (matched.length > 1) {
    return res.status(400).json({ error: 'Thông tin trùng với nhiều người trong danh sách — vui lòng liên hệ ban tổ chức' });
  }
  const a = matched[0];
  if (a.status === 'present') return res.status(400).json({ error: `Bạn đã điểm danh lúc ${a.checked_in_at}` });

  const did = deviceIdOf(req, res);
  const flag = await deviceFlag(s.id, did);
  const type = s.status === 'supplement' ? 'supplement' : 'qr';
  const checkedInAt = nowVN();
  await query(
    `UPDATE attendees SET status = 'present', checked_in_at = $1, checkin_type = $2, device_id = $3, client_ip = $4, flag = $5 WHERE id = $6`,
    [checkedInAt, type, did, req.ip, flag, a.id]);
  res.json(successPayload(displayName(a), a.unit, checkedInAt, flag, 'điểm danh'));
}

// Điểm danh / ghi danh
router.post('/api/checkin/:token', rateLimit(15), async (req, res, next) => {
  try {
    const s = await getSessionByToken(req.params.token);
    if (!s) return res.status(404).json({ error: 'Không tìm thấy phiên điểm danh' });
    if (s.status !== 'open' && s.status !== 'supplement') {
      return res.status(400).json({ error: 'Phiên chưa mở hoặc đã kết thúc điểm danh' });
    }

    // Lớp 1: mã QR động — ảnh chụp QR cũ hết hạn ngay sau chu kỳ đổi mã
    if (!verifyCode(s.token, String((req.body || {}).c || ''), await qrSecondsFor(s))) {
      return res.status(400).json({ error: 'Mã QR đã hết hạn — vui lòng quét lại mã đang hiển thị trên màn hình' });
    }

    if (s.type === 'open') return await openCheckin(s, req, res);
    // Phiên theo danh sách: nhánh ghi danh tự do (người không có trong danh sách)
    if ((req.body || {}).mode === 'open') {
      if (!s.allow_open) return res.status(400).json({ error: 'Phiên này không cho phép ghi danh tự do' });
      return await openCheckin(s, req, res, { self: true });
    }
    return await listCheckin(s, req, res);
  } catch (e) { next(e); }
});

module.exports = router;
