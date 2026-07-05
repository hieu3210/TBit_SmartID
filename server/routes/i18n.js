const express = require('express');
const { LANGS, dictFor } = require('../lib/i18n');

const router = express.Router();

// Từ điển công khai cho một ngôn ngữ (client tải để dịch giao diện)
router.get('/api/i18n', async (req, res, next) => {
  try {
    const lang = LANGS.includes(req.query.lang) ? req.query.lang : 'vi';
    res.set('Cache-Control', 'no-store');
    res.json({ lang, dict: await dictFor(lang) });
  } catch (e) { next(e); }
});

module.exports = router;
