const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const connectionString = process.env.DATABASE_URL || 'postgres://tbit:tbit@localhost:5432/tbit_smartid';

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
`;

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

module.exports = { query, pool, init, nowVN };
