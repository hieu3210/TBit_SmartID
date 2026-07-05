const express = require('express');
const { requireAuth, requireAdmin } = require('../middleware');
const { getListFields, validateListFields, saveListFields, enabledColumns, fieldsWithLabels } = require('../lib/fields');
const { systemQrSeconds, saveSystemQrSeconds, getSmtp, saveSmtp } = require('../lib/sysconfig');
const { sendMail, emailLayout } = require('../lib/mailer');
const { LANGS, DEFAULTS, getOverrides, saveOverrides } = require('../lib/i18n');

const router = express.Router();

// Bản dịch cho trình sửa của admin (mặc định + ghi đè)
router.get('/i18n', requireAdmin, async (req, res, next) => {
  try {
    res.json({ langs: LANGS, defaults: DEFAULTS, overrides: await getOverrides() });
  } catch (e) { next(e); }
});
router.put('/i18n', requireAdmin, async (req, res, next) => {
  try {
    await saveOverrides((req.body || {}).overrides || {});
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Cấu hình trường danh sách: ai đăng nhập cũng xem được (để dựng cột xem trước / form)
router.get('/list-fields', requireAuth, async (req, res, next) => {
  try {
    const lang = req.query.lang === 'en' ? 'en' : 'vi';
    const fields = await getListFields();
    res.json({ fields: fieldsWithLabels(fields), columns: enabledColumns(fields, lang) });
  } catch (e) { next(e); }
});

// Chỉ admin được thay đổi trường mặc định / bắt buộc / nhãn song ngữ
router.put('/list-fields', requireAdmin, async (req, res, next) => {
  try {
    const lang = req.query.lang === 'en' ? 'en' : 'vi';
    const { fields, error } = validateListFields((req.body || {}).fields);
    if (error) return res.status(400).json({ error });
    await saveListFields(fields);
    res.json({ fields: fieldsWithLabels(fields), columns: enabledColumns(fields, lang) });
  } catch (e) { next(e); }
});

/* ===== Cấu hình hệ thống (chỉ admin) ===== */

// Trả về cấu hình chung; mật khẩu SMTP không gửi về client
router.get('/system', requireAdmin, async (req, res, next) => {
  try {
    const smtp = await getSmtp();
    res.json({
      qr_rotate_seconds: await systemQrSeconds(),
      smtp: smtp
        ? { host: smtp.host, port: smtp.port, user: smtp.user, from: smtp.from, has_pass: !!smtp.pass }
        : { host: '', port: 587, user: '', from: '', has_pass: false },
    });
  } catch (e) { next(e); }
});

router.put('/system', requireAdmin, async (req, res, next) => {
  try {
    const b = req.body || {};
    if (b.qr_rotate_seconds != null) await saveSystemQrSeconds(b.qr_rotate_seconds);
    if (b.smtp) await saveSmtp(b.smtp); // mật khẩu bỏ trống = giữ mật khẩu cũ
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Gửi email thử để kiểm tra SMTP
router.post('/test-email', requireAdmin, async (req, res, next) => {
  try {
    const to = String((req.body || {}).to || '').trim();
    if (!to) return res.status(400).json({ error: 'Vui lòng nhập email nhận thử' });
    await sendMail({
      to,
      subject: '[TBit SmartID] Email kiểm tra cấu hình SMTP',
      html: emailLayout('Kiểm tra SMTP', '<p>Cấu hình SMTP của hệ thống hoạt động tốt. 🎉</p>'),
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: `Gửi thất bại: ${e.message}` });
  }
});

module.exports = router;
