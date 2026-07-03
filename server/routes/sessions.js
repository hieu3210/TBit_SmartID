const express = require('express');
const crypto = require('crypto');
const multer = require('multer');
const QRCode = require('qrcode');
const { query, pool, nowVN } = require('../db');
const { requireAuth, loadOwnedSession } = require('../middleware');
const { buildTemplate, parseAttendees, buildExport } = require('../lib/excel');
const { currentCode, secondsLeft, ROTATE_SECONDS } = require('../lib/qrtoken');

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

// Tải template Excel
router.get('/template', (req, res) => {
  res.setHeader('Content-Disposition', 'attachment; filename="template_diem_danh.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buildTemplate());
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
    const name = String((req.body || {}).name || '').trim();
    if (!name) return res.status(400).json({ error: 'Vui lòng nhập tên sự kiện' });
    const token = crypto.randomBytes(16).toString('hex');
    const { rows } = await query(
      'INSERT INTO sessions (name, token, owner_id, created_at) VALUES ($1, $2, $3, $4) RETURNING id',
      [name, token, req.session.user.id, nowVN()]
    );
    res.json({ id: rows[0].id, name, token, status: 'draft' });
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
  if (s.status !== 'draft') return res.status(400).json({ error: 'Chỉ upload được khi phiên chưa bắt đầu điểm danh' });
  if (!req.file) return res.status(400).json({ error: 'Chưa chọn file' });

  let parsed;
  try {
    parsed = parseAttendees(req.file.buffer);
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
        const base = j * 7;
        values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`);
        params.push(s.id, r.stt, r.cccd, r.full_name, r.unit, r.phone, r.email);
      });
      await client.query(
        `INSERT INTO attendees (session_id, stt, cccd, full_name, unit, phone, email) VALUES ${values.join(', ')}`,
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
    if (!(await statsFor(s.id)).total) return res.status(400).json({ error: 'Chưa có danh sách — hãy upload file Excel trước' });
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
    const code = currentCode(s.token);
    const url = `${baseUrl(req)}/checkin/${s.token}?c=${code}`;
    const dataUrl = await QRCode.toDataURL(url, { width: 640, margin: 1 });
    res.json({ dataUrl, url, code, secondsLeft: secondsLeft(), rotateSeconds: ROTATE_SECONDS, stats: await statsFor(s.id) });
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
    const r = action === 'approve'
      ? await query(`UPDATE attendees SET flag = 'ok' WHERE id = $1 AND session_id = $2 AND flag = 'review'`,
          [req.params.aid, req.attSession.id])
      : await query(`UPDATE attendees SET flag = 'ok', status = 'absent', checked_in_at = NULL, checkin_type = NULL WHERE id = $1 AND session_id = $2 AND flag = 'review'`,
          [req.params.aid, req.attSession.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'Không tìm thấy lượt cần xác nhận' });
    res.json({ ok: true, stats: await statsFor(req.attSession.id) });
  } catch (e) { next(e); }
});

// Xuất Excel kết quả
router.get('/:id/export', loadOwnedSession, async (req, res, next) => {
  try {
    const s = req.attSession;
    const { rows: attendees } = await query('SELECT * FROM attendees WHERE session_id = $1 ORDER BY stt', [s.id]);
    const buffer = buildExport(s, attendees, await statsFor(s.id));
    const safeName = s.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '_');
    res.setHeader('Content-Disposition', `attachment; filename="ket_qua_${safeName || 'diem_danh'}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (e) { next(e); }
});

module.exports = router;
