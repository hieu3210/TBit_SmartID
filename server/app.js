const express = require('express');
const cookieSession = require('cookie-session');
const cookieParser = require('cookie-parser');
const path = require('path');
const { query, init } = require('./db');
const { sessionSecret, cookieSecret } = require('./lib/secrets');

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

app.set('trust proxy', 1);
app.use(express.json());
app.use(cookieParser(cookieSecret));
// Phiên đăng nhập nằm trong cookie ký (stateless) — chạy được trên serverless
app.use(cookieSession({
  name: 'tbit_sess',
  keys: [sessionSecret],
  httpOnly: true,
  sameSite: 'lax',
  maxAge: 12 * 3600 * 1000,
}));

// Khởi tạo schema + seed admin một lần cho mỗi instance
app.use(async (req, res, next) => {
  try { await init(); next(); } catch (e) { next(e); }
});

app.use(express.static(path.join(__dirname, '..', 'public')));

app.use(require('./routes/i18n'));
app.use('/api', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/lists', require('./routes/lists'));
app.use('/api/sessions', require('./routes/sessions'));
app.use(require('./routes/checkin'));

// Trang điểm danh của người tham dự (link trong QR)
app.get('/checkin/:token', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT 1 FROM sessions WHERE token = $1', [req.params.token]);
    if (!rows.length) return res.status(404).send('Không tìm thấy phiên điểm danh');
    res.sendFile(path.join(__dirname, '..', 'public', 'checkin.html'));
  } catch (e) { next(e); }
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Lỗi hệ thống, vui lòng thử lại' });
});

// Chạy trực tiếp (local/Docker) thì listen; trên Vercel chỉ export app
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`TBit SmartID đang chạy tại http://localhost:${PORT}`);
  });
}

module.exports = app;
