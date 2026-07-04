const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

// Ưu tiên DATABASE_URL; POSTGRES_URL là biến do tích hợp Vercel ↔ Supabase tự tạo
const rawConnectionString = process.env.DATABASE_URL
  || process.env.POSTGRES_URL
  || 'postgres://tbit:tbit@localhost:5432/tbit_smartid';

// Bỏ tham số sslmode trong URL (tích hợp Vercel thêm sẵn "?sslmode=require"):
// nó đè cấu hình ssl bên dưới và bắt xác thực chứng chỉ đầy đủ, trong khi pooler
// của Supabase dùng chứng chỉ self-signed → lỗi "self-signed certificate in certificate chain".
function stripSslMode(cs) {
  try {
    const u = new URL(cs);
    u.searchParams.delete('sslmode');
    return u.toString();
  } catch (e) { return cs; }
}
const connectionString = stripSslMode(rawConnectionString);

// Supabase/cloud cần SSL; Postgres local (localhost hoặc service "postgres" trong Docker) thì không
const isLocal = /@(localhost|127\.0\.0\.1|postgres)[:/]/.test(connectionString);
const pool = new Pool({
  connectionString,
  ssl: isLocal ? undefined : { rejectUnauthorized: false },
  max: parseInt(process.env.PG_POOL_MAX || '3', 10), // nhỏ để hợp với serverless + pooler của Supabase
  idleTimeoutMillis: 30000,
});

function query(text, params) {
  return pool.query(text, params);
}

// Thời gian hiển thị theo giờ Việt Nam, không phụ thuộc múi giờ máy chủ
function nowVN() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(new Date());
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  must_change_password BOOLEAN NOT NULL DEFAULT false,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  owner_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  opened_at TEXT,
  closed_at TEXT
);

CREATE TABLE IF NOT EXISTS attendees (
  id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  stt INTEGER,
  cccd TEXT NOT NULL,
  full_name TEXT NOT NULL,
  unit TEXT,
  phone TEXT,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'absent',
  checked_in_at TEXT,
  checkin_type TEXT,
  device_id TEXT,
  client_ip TEXT,
  flag TEXT NOT NULL DEFAULT 'ok',
  UNIQUE(session_id, cccd)
);

CREATE INDEX IF NOT EXISTS idx_attendees_session ON attendees(session_id);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

ALTER TABLE attendees ADD COLUMN IF NOT EXISTS extra JSONB;

-- Phiên ghi danh tự do (không theo danh sách): type = 'open', fields = cấu hình form ghi danh
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'list';
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS fields JSONB;
ALTER TABLE attendees ALTER COLUMN cccd DROP NOT NULL;

-- Hồ sơ người dùng (đặt lại mật khẩu, nhận email hệ thống)
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;

-- Tự kết thúc phiên (ends_at, giờ VN) và chu kỳ QR riêng (NULL = mặc định hệ thống, 0 = cố định)
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS ends_at TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS qr_seconds INTEGER;

-- Phiên theo danh sách: trường bắt buộc nhập để điểm danh + cho phép ghi danh tự do (walk-in)
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS checkin_fields JSONB;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS allow_open BOOLEAN NOT NULL DEFAULT false;
-- Đánh dấu người ghi danh tự do (không có trong danh sách gốc)
ALTER TABLE attendees ADD COLUMN IF NOT EXISTS self_registered BOOLEAN NOT NULL DEFAULT false;
-- Họ và tên không còn bắt buộc (có thể điểm danh chỉ bằng SĐT/CCCD)
ALTER TABLE attendees ALTER COLUMN full_name DROP NOT NULL;

-- Danh sách đại biểu lưu sẵn để dùng lại
CREATE TABLE IF NOT EXISTS saved_lists (
  id SERIAL PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  data JSONB NOT NULL,
  created_at TEXT NOT NULL
);
`;

async function getSetting(key) {
  const { rows } = await query('SELECT value FROM settings WHERE key = $1', [key]);
  return rows.length ? rows[0].value : null;
}

async function setSetting(key, value) {
  await query(
    'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
    [key, value]
  );
}

async function doInit() {
  await query(SCHEMA);
  const { rows } = await query("SELECT 1 FROM users WHERE role = 'admin' LIMIT 1");
  if (!rows.length) {
    await query(
      'INSERT INTO users (username, password_hash, role, must_change_password, created_at) VALUES ($1, $2, $3, true, $4)',
      ['admin', bcrypt.hashSync('admin123', 10), 'admin', nowVN()]
    );
    console.log('Đã tạo tài khoản mặc định admin / admin123 (bắt buộc đổi mật khẩu khi đăng nhập lần đầu)');
  }
}

// Khởi tạo một lần cho mỗi instance (hợp với cold start serverless)
let initPromise = null;
function init() {
  if (!initPromise) initPromise = doInit();
  return initPromise;
}

module.exports = { query, pool, init, nowVN, getSetting, setSetting };
