const { query, nowVN } = require('../db');
const { buildExport } = require('./excel');
const { getListFields, columnsForSession } = require('./fields');
const { sendMail, emailLayout } = require('./mailer');

// Hết giờ ends_at thì tự kết thúc điểm danh và gửi email tổng hợp cho người tạo phiên.
// Được gọi "lười" mỗi khi phiên được truy cập (hợp môi trường serverless, không cần cron).
async function maybeAutoClose(session) {
  if (!session) return session;
  const active = session.status === 'open' || session.status === 'supplement';
  if (!active || !session.ends_at || nowVN() < session.ends_at) return session;

  // Chỉ instance đầu tiên đóng được phiên mới gửi email (tránh gửi trùng)
  const r = await query(
    `UPDATE sessions SET status = 'closed', closed_at = $1 WHERE id = $2 AND status IN ('open','supplement')`,
    [nowVN(), session.id]
  );
  session.status = 'closed';
  session.closed_at = session.closed_at || nowVN();
  if (r.rowCount) sendSummary(session).catch((e) => console.error('Không gửi được email tổng hợp:', e.message));
  return session;
}

async function statsOf(sessionId) {
  const { rows: [r] } = await query(`
    SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status = 'present')::int AS present
    FROM attendees WHERE session_id = $1`, [sessionId]);
  return {
    total: r.total, present: r.present, absent: r.total - r.present,
    rate: r.total ? Math.round((r.present / r.total) * 1000) / 10 : 0,
  };
}

async function sendSummary(session) {
  const { rows: [owner] } = await query('SELECT * FROM users WHERE id = $1', [session.owner_id]);
  if (!owner || !owner.email) return;

  const stats = await statsOf(session.id);
  const { rows: attendees } = await query('SELECT * FROM attendees WHERE session_id = $1 ORDER BY stt', [session.id]);
  const isOpen = session.type === 'open';
  const columns = columnsForSession(session, await getListFields());
  const excel = buildExport(session, attendees, stats, columns);

  const rows = isOpen
    ? `<tr><td style="padding:4px 12px 4px 0;">Số người đã ghi danh</td><td><b>${stats.present}</b></td></tr>`
    : `<tr><td style="padding:4px 12px 4px 0;">Có mặt</td><td><b style="color:#057a55;">${stats.present}</b> / ${stats.total} (${stats.rate}%)</td></tr>
       <tr><td style="padding:4px 12px 4px 0;">Vắng mặt</td><td><b style="color:#c81e1e;">${stats.absent}</b></td></tr>`;

  await sendMail({
    to: owner.email,
    subject: `[TBit SmartID] Phiên "${session.name}" đã kết thúc — ${isOpen ? `${stats.present} người ghi danh` : `${stats.present}/${stats.total} có mặt`}`,
    html: emailLayout('Kết thúc điểm danh', `
      <p>Xin chào <b>${owner.full_name || owner.username}</b>,</p>
      <p>Phiên điểm danh <b>${session.name}</b> đã tự động kết thúc lúc <b>${session.closed_at}</b> theo thời gian bạn đã hẹn.</p>
      <table style="font-size:14px;border-collapse:collapse;">${rows}</table>
      <p>Danh sách chi tiết ở file Excel đính kèm. Bạn cũng có thể đăng nhập hệ thống để xem thống kê hoặc mở điểm danh bổ sung.</p>`),
    attachments: [{
      filename: 'ket_qua_diem_danh.xlsx',
      content: excel,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }],
  });
}

module.exports = { maybeAutoClose };
