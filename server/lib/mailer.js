const nodemailer = require('nodemailer');
const { getSmtp } = require('./sysconfig');

// Gửi email qua SMTP do admin cấu hình trong Quản trị
async function sendMail({ to, subject, html, attachments }) {
  const cfg = await getSmtp();
  if (!cfg) throw new Error('Hệ thống chưa được cấu hình SMTP — liên hệ quản trị viên');
  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
  });
  return transport.sendMail({
    from: cfg.from || cfg.user,
    to, subject, html, attachments,
  });
}

async function smtpConfigured() {
  return !!(await getSmtp());
}

// Khung email chung của hệ thống
function emailLayout(title, bodyHtml) {
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
    <div style="background:#1a56db;color:#fff;padding:16px 22px;font-size:17px;font-weight:bold;">TBit SmartID — ${title}</div>
    <div style="padding:20px 22px;font-size:14px;color:#111827;line-height:1.6;">${bodyHtml}</div>
    <div style="padding:12px 22px;background:#f3f4f6;color:#6b7280;font-size:12px;">
      © 2026 TBit SmartID — Ứng dụng điểm danh thông minh. Email tự động, vui lòng không trả lời.
    </div>
  </div>`;
}

module.exports = { sendMail, smtpConfigured, emailLayout };
