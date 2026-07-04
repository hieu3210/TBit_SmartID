const express = require('express');
const { requireAuth, requireAdmin } = require('../middleware');
const { HEADERS } = require('../lib/excel');
const { getExtraFields, validateExtraFields, saveExtraFields } = require('../lib/fields');

const router = express.Router();

// Cấu hình trường Excel: ai đăng nhập cũng xem được (để hiển thị cột xem trước)
router.get('/excel-fields', requireAuth, async (req, res, next) => {
  try { res.json({ core: HEADERS, extra: await getExtraFields() }); }
  catch (e) { next(e); }
});

// Chỉ admin được thay đổi; gửi extra: [] để về mặc định
router.put('/excel-fields', requireAdmin, async (req, res, next) => {
  try {
    const { fields, error } = validateExtraFields((req.body || {}).extra);
    if (error) return res.status(400).json({ error });
    await saveExtraFields(fields);
    res.json({ core: HEADERS, extra: fields });
  } catch (e) { next(e); }
});

module.exports = router;
