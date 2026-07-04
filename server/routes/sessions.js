const express = require('express');
const crypto = require('crypto');
const multer = require('multer');
const QRCode = require('qrcode');
const { query, pool, nowVN } = require('../db');
const { requireAuth, loadOwnedSession } = require('../middleware');
const { buildTemplate, parseAttendees, buildExport } = require('../lib/excel');
const { getExtraFields, DEFAULT_OPEN_FIELDS, validateOpenFields } = require('../lib/fields');

// Nhãn các trường tự đặt của phiên ghi danh (nằm trong JSONB extra)
function customLabelsOf(session) {
  const coreKeys = ['full_name', 'phone', 'cccd', 'unit', 'email'];
  return (session.fields || []).filter((f) => !coreKeys.includes(f.key)).map((f) => f.label);
}
const { currentCode, secondsLeft } = require('../lib/qrtoken');
const { qrSecondsFor } = require('../lib/sysconfig');
const { normalizeCccd, normalizePhone, isValidCccd, isValidPhone } = require('../lib/normalize');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.use(requireAuth);

async function statsFor(sessionId) {
  const { rows: [r] } = await query(`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE status = 'present')::int AS present,
           COUNT(*) FILTER (WHERE flag = 'review')::int AS flagged
    FROM attendees WHERE session_id = $1`, [sessionId]);
  return {
    total: r.total, present: r.present, absent: r.total - r.present, flagged: r.flagged,
    rate: r.total ? Math.round((r.present / r.total) * 1000) / 10 : 0,
  };
}

function baseUrl(req) {
  return process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
}

// Tải template Excel (kèm các trường bổ sung do admin cấu hình)
router.get('/template', async (req, res, next) => {
  try {
    res.setHeader('Content-Disposition', 'attachment; filename="template_diem_danh.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buildTemplate(await getExtraFields()));
  } catch (e) { next(e); }
});

router.get('/', async (req, res, next) => {
  try {
    const u = req.session.user;
    const cond = u.role === 'admin' ? '' : 'WHERE s.owner_id = $1';
    const params = u.role === 'admin' ? [] : [u.id];
    const { rows } = await query(`
      SELECT s.*, u.username AS owner,
             COALESCE(a.total, 0) AS total, COALESCE(a.present, 0) AS present, COALESCE(a.flagged, 0) AS flagged
      FROM sessions s
      JOIN users u ON u.id = s.owner_id
      LEFT JOIN (
        SELECT session_id, COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE status = 'present')::int AS present,
               COUNT(*) FILTER (WHERE flag = 'review')::int AS flagged
        FROM attendees GROUP BY session_id
      ) a ON a.session_id = s.id
      ${cond} ORDER BY s.id DESC`, params);
    res.json(rows.map((s) => ({
      ...s,
      stats: { total: s.total, present: s.present, absent: s.total - s.present, flagged: s.flagged,
               rate: s.total ? Math.round((s.present / s.total) * 1000) / 10 : 0 },
    })));
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const b = req.body || {};
    const name = String(b.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Vui lòng nhập tên sự kiện' });
    const type = b.type === 'open' ? 'open' : 'list';

    // Thời gian tự kết thúc (tuỳ chọn): 'YYYY-MM-DDTHH:mm' từ input datetime-local, giờ VN
    let endsAt = null;
    if (b.ends_at) {
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(b.ends_at)) return res.status(400).json({ error: 'Thời gian kết thúc không hợp lệ' });
      endsAt = b.ends_at.replace('T', ' ') + ':00';
      if (endsAt <= nowVN()) return res.status(400).json({ error: 'Thời gian kết thúc phải ở tương lai' });
    }

    // Chu kỳ QR riêng (tuỳ chọn): null = mặc định hệ thống, 0 = mã cố định, 5–300 giây
    let qrSeconds = null;
    if (b.qr_seconds != null && b.qr_seconds !== '') {
      qrSeconds = parseInt(b.qr_seconds, 10);
      if (!Number.isFinite(qrSeconds) || (qrSeconds !== 0 && (qrSeconds < 5 || qrSeconds > 300))) {
        return res.status(400).json({ error: 'Chu kỳ đổi QR phải là 0 (cố định) hoặc từ 5 đến 300 giây' });
      }
    }

    const token = crypto.randomBytes(16).toString('hex');
    const { rows } = await query(
      `INSERT INTO sessions (name, token, owner_id, created_at, type, fields, ends_at, qr_seconds)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [name, token, req.session.user.id, nowVN(), type,
        type === 'open' ? JSON.stringify(DEFAULT_OPEN_FIELDS) : null, endsAt, qrSeconds]
    );
    res.json({ id: rows[0].id, name, token, status: 'draft', type });
  } catch (e) { next(e); }
});

// Cấu hình form ghi danh (chỉ phiên ghi danh, khi còn nháp)
router.put('/:id/fields', loadOwnedSession, async (req, res, next) => {
  try {
    const s = req.attSession;
    if (s.type !== 'open') return res.status(400).json({ error: 'Chỉ phiên ghi danh mới cấu hình được form' });
    if (s.status !== 'draft') return res.status(400).json({ error: 'Chỉ sửa được form khi phiên chưa bắt đầu' });
    const { fields, error } = validateOpenFields((req.body || {}).fields);
    if (error) return res.status(400).json({ error });
    await query('UPDATE sessions SET fields = $1 WHERE id = $2', [JSON.stringify(fields), s.id]);
    res.json({ ok: true, fields });
  } catch (e) { next(e); }
});

router.get('/:id', loadOwnedSession, async (req, res, next) => {
  try { res.json({ ...req.attSession, stats: await statsFor(req.attSession.id) }); }
  catch (e) { next(e); }
});

router.delete('/:id', loadOwnedSession, async (req, res, next) => {
  try {
    await query('DELETE FROM sessions WHERE id = $1', [req.attSession.id]); // attendees xoá theo CASCADE
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Upload danh sách Excel (chỉ khi phiên còn ở trạng thái nháp)
router.post('/:id/upload', loadOwnedSession, upload.single('file'), async (req, res, next) => {
  const s = req.attSession;
  if (s.type === 'open') return res.status(400).json({ error: 'Phiên ghi danh tự do không dùng danh sách Excel' });
  if (s.status !== 'draft') return res.status(400).json({ error: 'Chỉ upload được khi phiên chưa bắt đầu điểm danh' });
  if (!req.file) return res.status(400).json({ error: 'Chưa chọn file' });

  let parsed;
  try {
    parsed = parseAttendees(req.file.buffer, await getExtraFields());
  } catch (e) {
    return res.status(400).json({ error: 'Không đọc được file — hãy dùng file .xlsx theo template' });
  }
  const { rows, errors } = parsed;
  if (rows.length === 0) return res.status(400).json({ error: 'File không có dòng dữ liệu hợp lệ nào', errors });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM attendees WHERE session_id = $1', [s.id]);
    // Chèn theo lô 200 dòng/câu lệnh
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      const values = [];
      const params = [];
      chunk.forEach((r, j) => {
        const base = j * 8;
        values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8})`);
        params.push(s.id, r.stt, r.cccd, r.full_name, r.unit, r.phone, r.email, r.extra ? JSON.stringify(r.extra) : null);
      });
      await client.query(
        `INSERT INTO attendees (session_id, stt, cccd, full_name, unit, phone, email, extra) VALUES ${values.join(', ')}`,
        params
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    client.release();
    return next(e);
  }
  client.release();
  res.json({ imported: rows.length, errors });
});

// Chuyển trạng thái
router.post('/:id/open', loadOwnedSession, async (req, res, next) => {
  try {
    const s = req.attSession;
    if (s.status !== 'draft') return res.status(400).json({ error: 'Phiên đã bắt đầu trước đó' });
    if (s.type !== 'open' && !(await statsFor(s.id)).total) return res.status(400).json({ error: 'Chưa có danh sách — hãy upload file Excel trước' });
    await query("UPDATE sessions SET status = 'open', opened_at = $1 WHERE id = $2", [nowVN(), s.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/:id/close', loadOwnedSession, async (req, res, next) => {
  try {
    const s = req.attSession;
    if (s.status !== 'open' && s.status !== 'supplement') return res.status(400).json({ error: 'Phiên không ở trạng thái điểm danh' });
    await query("UPDATE sessions SET status = 'closed', closed_at = $1 WHERE id = $2", [nowVN(), s.id]);
    res.json({ ok: true, stats: await statsFor(s.id) });
  } catch (e) { next(e); }
});

router.post('/:id/supplement', loadOwnedSession, async (req, res, next) => {
  try {
    const s = req.attSession;
    if (s.status !== 'closed') return res.status(400).json({ error: 'Chỉ mở điểm danh bổ sung sau khi đã kết thúc' });
    await query("UPDATE sessions SET status = 'supplement' WHERE id = $1", [s.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.get('/:id/stats', loadOwnedSession, async (req, res, next) => {
  try { res.json(await statsFor(req.attSession.id)); }
  catch (e) { next(e); }
});

// QR động: trả về ảnh QR + số giây còn lại của cửa sổ hiện tại
router.get('/:id/qr', loadOwnedSession, async (req, res, next) => {
  try {
    const s = req.attSession;
    if (s.status !== 'open' && s.status !== 'supplement') return res.status(400).json({ error: 'Phiên không ở trạng thái điểm danh' });
    const rotateSeconds = await qrSecondsFor(s); // 0 = mã cố định
    const code = currentCode(s.token, rotateSeconds);
    const url = `${baseUrl(req)}/checkin/${s.token}?c=${code}`;
    const dataUrl = await QRCode.toDataURL(url, { width: 640, margin: 1 });
    res.json({ dataUrl, url, code, secondsLeft: secondsLeft(rotateSeconds), rotateSeconds, stats: await statsFor(s.id) });
  } catch (e) { next(e); }
});

// Danh sách chi tiết, lọc theo trạng thái / tìm kiếm / cờ
router.get('/:id/attendees', loadOwnedSession, async (req, res, next) => {
  try {
    const { status, q, flag } = req.query;
    let sql = 'SELECT * FROM attendees WHERE session_id = $1';
    const params = [req.attSession.id];
    if (status === 'present' || status === 'absent') { params.push(status); sql += ` AND status = $${params.length}`; }
    if (flag === 'review') sql += " AND flag = 'review'";
    if (q) {
      params.push(`%${q}%`);
      sql += ` AND (full_name ILIKE $${params.length} OR cccd LIKE $${params.length} OR unit ILIKE $${params.length})`;
    }
    sql += ' ORDER BY stt';
    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (e) { next(e); }
});

// BTC tích tay / bỏ tích
router.post('/:id/attendees/:aid/mark', loadOwnedSession, async (req, res, next) => {
  try {
    const { status } = req.body || {};
    if (status !== 'present' && status !== 'absent') return res.status(400).json({ error: 'Trạng thái không hợp lệ' });
    const r = status === 'present'
      ? await query(`UPDATE attendees SET status = 'present', checked_in_at = $1, checkin_type = 'manual', flag = 'ok' WHERE id = $2 AND session_id = $3`,
          [nowVN(), req.params.aid, req.attSession.id])
      : await query(`UPDATE attendees SET status = 'absent', checked_in_at = NULL, checkin_type = NULL, flag = 'ok' WHERE id = $1 AND session_id = $2`,
          [req.params.aid, req.attSession.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'Không tìm thấy người trong danh sách' });
    res.json({ ok: true, stats: await statsFor(req.attSession.id) });
  } catch (e) { next(e); }
});

// Duyệt / từ chối lượt bị gắn cờ ⚠ (cùng thiết bị điểm danh nhiều người)
router.post('/:id/attendees/:aid/resolve', loadOwnedSession, async (req, res, next) => {
  try {
    const { action } = req.body || {};
    if (action !== 'approve' && action !== 'reject') return res.status(400).json({ error: 'Hành động không hợp lệ' });
    let r;
    if (action === 'approve') {
      r = await query(`UPDATE attendees SET flag = 'ok' WHERE id = $1 AND session_id = $2 AND flag = 'review'`,
        [req.params.aid, req.attSession.id]);
    } else if (req.attSession.type === 'open') {
      // Phiên ghi danh: từ chối là xoá hẳn bản ghi (không có khái niệm "vắng")
      r = await query(`DELETE FROM attendees WHERE id = $1 AND session_id = $2 AND flag = 'review'`,
        [req.params.aid, req.attSession.id]);
    } else {
      r = await query(`UPDATE attendees SET flag = 'ok', status = 'absent', checked_in_at = NULL, checkin_type = NULL WHERE id = $1 AND session_id = $2 AND flag = 'review'`,
        [req.params.aid, req.attSession.id]);
    }
    if (!r.rowCount) return res.status(404).json({ error: 'Không tìm thấy lượt cần xác nhận' });
    res.json({ ok: true, stats: await statsFor(req.attSession.id) });
  } catch (e) { next(e); }
});

/* ===== Thêm / sửa / xoá thành viên thủ công (phiên theo danh sách) ===== */

// Kiểm tra + chuẩn hoá dữ liệu một thành viên từ form
function parseMember(b) {
  const cccd = normalizeCccd((b || {}).cccd);
  const fullName = String((b || {}).full_name || '').trim();
  const phone = normalizePhone((b || {}).phone);
  if (!fullName) return { error: 'Vui lòng nhập họ và tên' };
  if (!isValidCccd(cccd)) return { error: 'CCCD phải đủ 12 chữ số' };
  if (!isValidPhone(phone)) return { error: 'Số điện thoại không hợp lệ' };
  const extra = {};
  Object.entries((b || {}).extra || {}).forEach(([k, v]) => {
    const val = String(v == null ? '' : v).trim();
    if (val) extra[String(k).slice(0, 40)] = val.slice(0, 200);
  });
  return { member: {
    cccd, full_name: fullName, phone,
    unit: String((b || {}).unit || '').trim() || null,
    email: String((b || {}).email || '').trim() || null,
    extra: Object.keys(extra).length ? extra : null,
  } };
}

function canEditMembers(s) {
  return s.type !== 'open' && ['draft', 'open', 'supplement'].includes(s.status);
}

// Thêm thành viên (khi nháp hoặc đang điểm danh)
router.post('/:id/attendees', loadOwnedSession, async (req, res, next) => {
  try {
    const s = req.attSession;
    if (!canEditMembers(s)) return res.status(400).json({ error: 'Phiên không cho phép sửa danh sách lúc này' });
    const { member, error } = parseMember(req.body);
    if (error) return res.status(400).json({ error });
    const dup = await query('SELECT 1 FROM attendees WHERE session_id = $1 AND cccd = $2', [s.id, member.cccd]);
    if (dup.rows.length) return res.status(400).json({ error: 'CCCD này đã có trong danh sách' });
    await query(
      `INSERT INTO attendees (session_id, stt, cccd, full_name, unit, phone, email, extra)
       VALUES ($1, (SELECT COALESCE(MAX(stt), 0) + 1 FROM attendees WHERE session_id = $1), $2, $3, $4, $5, $6, $7)`,
      [s.id, member.cccd, member.full_name, member.unit, member.phone, member.email,
        member.extra ? JSON.stringify(member.extra) : null]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Sửa thành viên (không sửa được người đã điểm danh)
router.put('/:id/attendees/:aid', loadOwnedSession, async (req, res, next) => {
  try {
    const s = req.attSession;
    if (!canEditMembers(s)) return res.status(400).json({ error: 'Phiên không cho phép sửa danh sách lúc này' });
    const { rows } = await query('SELECT * FROM attendees WHERE id = $1 AND session_id = $2', [req.params.aid, s.id]);
    if (!rows.length) return res.status(404).json({ error: 'Không tìm thấy người trong danh sách' });
    if (rows[0].status === 'present') return res.status(400).json({ error: 'Không thể sửa người đã điểm danh' });
    const { member, error } = parseMember(req.body);
    if (error) return res.status(400).json({ error });
    const dup = await query('SELECT 1 FROM attendees WHERE session_id = $1 AND cccd = $2 AND id <> $3',
      [s.id, member.cccd, req.params.aid]);
    if (dup.rows.length) return res.status(400).json({ error: 'CCCD này đã có trong danh sách' });
    await query(
      `UPDATE attendees SET cccd = $1, full_name = $2, unit = $3, phone = $4, email = $5, extra = $6 WHERE id = $7`,
      [member.cccd, member.full_name, member.unit, member.phone, member.email,
        member.extra ? JSON.stringify(member.extra) : null, req.params.aid]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Xoá thành viên / bản ghi danh.
// Phiên ghi danh: xoá được mọi bản ghi (loại lượt rác). Phiên danh sách: chỉ xoá người CHƯA điểm danh.
router.delete('/:id/attendees/:aid', loadOwnedSession, async (req, res, next) => {
  try {
    const s = req.attSession;
    const { rows } = await query('SELECT * FROM attendees WHERE id = $1 AND session_id = $2', [req.params.aid, s.id]);
    if (!rows.length) return res.status(404).json({ error: 'Không tìm thấy người trong danh sách' });
    if (s.type !== 'open') {
      if (!canEditMembers(s)) return res.status(400).json({ error: 'Phiên không cho phép sửa danh sách lúc này' });
      if (rows[0].status === 'present') return res.status(400).json({ error: 'Không thể xoá người đã điểm danh' });
    }
    await query('DELETE FROM attendees WHERE id = $1', [req.params.aid]);
    res.json({ ok: true, stats: await statsFor(s.id) });
  } catch (e) { next(e); }
});

/* ===== Lưu / tái sử dụng danh sách ===== */

// Lưu danh sách hiện tại của phiên để dùng lại
router.post('/:id/save-list', loadOwnedSession, async (req, res, next) => {
  try {
    const s = req.attSession;
    if (s.type === 'open') return res.status(400).json({ error: 'Phiên ghi danh không có danh sách để lưu' });
    const name = String((req.body || {}).name || '').trim();
    if (!name || name.length > 80) return res.status(400).json({ error: 'Vui lòng đặt tên danh sách (tối đa 80 ký tự)' });
    const { rows } = await query(
      'SELECT stt, cccd, full_name, unit, phone, email, extra FROM attendees WHERE session_id = $1 ORDER BY stt', [s.id]);
    if (!rows.length) return res.status(400).json({ error: 'Chưa có danh sách để lưu' });
    const { rows: [saved] } = await query(
      'INSERT INTO saved_lists (owner_id, name, data, created_at) VALUES ($1, $2, $3, $4) RETURNING id',
      [req.session.user.id, name, JSON.stringify(rows), nowVN()]);
    res.json({ ok: true, id: saved.id, name, count: rows.length });
  } catch (e) { next(e); }
});

// Nạp danh sách đã lưu vào phiên (thay thế danh sách hiện tại, chỉ khi nháp)
router.post('/:id/use-list', loadOwnedSession, async (req, res, next) => {
  try {
    const s = req.attSession;
    if (s.type === 'open') return res.status(400).json({ error: 'Phiên ghi danh không dùng danh sách' });
    if (s.status !== 'draft') return res.status(400).json({ error: 'Chỉ nạp danh sách khi phiên chưa bắt đầu' });
    const { rows } = await query('SELECT * FROM saved_lists WHERE id = $1 AND owner_id = $2',
      [(req.body || {}).list_id, req.session.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'Không tìm thấy danh sách đã lưu' });
    const members = rows[0].data || [];

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM attendees WHERE session_id = $1', [s.id]);
      for (let i = 0; i < members.length; i += 200) {
        const chunk = members.slice(i, i + 200);
        const values = [];
        const params = [];
        chunk.forEach((m, j) => {
          const base = j * 8;
          values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8})`);
          params.push(s.id, i + j + 1, m.cccd, m.full_name, m.unit, m.phone, m.email,
            m.extra ? JSON.stringify(m.extra) : null);
        });
        await client.query(
          `INSERT INTO attendees (session_id, stt, cccd, full_name, unit, phone, email, extra) VALUES ${values.join(', ')}`,
          params);
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      client.release();
      return next(e);
    }
    client.release();
    res.json({ ok: true, imported: members.length });
  } catch (e) { next(e); }
});

// Xuất Excel kết quả
router.get('/:id/export', loadOwnedSession, async (req, res, next) => {
  try {
    const s = req.attSession;
    const { rows: attendees } = await query('SELECT * FROM attendees WHERE session_id = $1 ORDER BY stt', [s.id]);
    const buffer = buildExport(s, attendees, await statsFor(s.id),
      s.type === 'open' ? customLabelsOf(s) : await getExtraFields());
    const safeName = s.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '_');
    res.setHeader('Content-Disposition', `attachment; filename="ket_qua_${safeName || 'diem_danh'}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (e) { next(e); }
});

module.exports = router;
