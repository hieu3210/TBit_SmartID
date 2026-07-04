const { getSetting, setSetting } = require('../db');
const { HEADERS } = require('./excel');

const KEY = 'excel_extra_fields';
const MAX_FIELDS = 10;
const MAX_LABEL_LENGTH = 40;

// Danh sách trường bổ sung do admin cấu hình (mặc định: không có)
async function getExtraFields() {
  try {
    const raw = await getSetting(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((f) => typeof f === 'string' && f.trim()) : [];
  } catch (e) {
    return [];
  }
}

// Kiểm tra + chuẩn hoá danh sách trường; trả về { fields } hoặc { error }
function validateExtraFields(input) {
  if (!Array.isArray(input)) return { error: 'Dữ liệu không hợp lệ' };
  const fields = [];
  const seen = new Set(HEADERS.map((h) => h.toLowerCase()));
  seen.add('sđt'); // tên rút gọn của "Số điện thoại" mà parser cũng nhận
  for (const item of input) {
    const label = String(item || '').trim().replace(/\s+/g, ' ');
    if (!label) continue;
    if (label.length > MAX_LABEL_LENGTH) return { error: `Tên trường "${label.slice(0, 20)}…" quá dài (tối đa ${MAX_LABEL_LENGTH} ký tự)` };
    const lower = label.toLowerCase();
    if (seen.has(lower)) return { error: `Trường "${label}" trùng với trường đã có` };
    if (lower.startsWith('họ') || lower.startsWith('đơn vị') || lower.startsWith('số điện thoại')) {
      return { error: `Trường "${label}" dễ nhầm với trường mặc định — hãy đặt tên khác` };
    }
    seen.add(lower);
    fields.push(label);
  }
  if (fields.length > MAX_FIELDS) return { error: `Tối đa ${MAX_FIELDS} trường bổ sung` };
  return { fields };
}

async function saveExtraFields(fields) {
  await setSetting(KEY, JSON.stringify(fields));
}

/* ===== Trường cho phiên ghi danh tự do (không theo danh sách) ===== */

// Các trường cơ bản, lưu vào cột riêng của attendees; trường khác lưu vào JSONB extra
const OPEN_CORE_FIELDS = [
  { key: 'full_name', label: 'Họ và tên' },
  { key: 'phone', label: 'Số điện thoại' },
  { key: 'cccd', label: 'Số CCCD' },
  { key: 'unit', label: 'Đơn vị' },
  { key: 'email', label: 'Email' },
];

const DEFAULT_OPEN_FIELDS = [
  { key: 'full_name', label: 'Họ và tên', required: true },
  { key: 'phone', label: 'Số điện thoại', required: true },
  { key: 'unit', label: 'Đơn vị', required: false },
];

// Kiểm tra + chuẩn hoá cấu hình form ghi danh; trả về { fields } hoặc { error }
function validateOpenFields(input) {
  if (!Array.isArray(input)) return { error: 'Cấu hình trường không hợp lệ' };
  const coreLabel = new Map(OPEN_CORE_FIELDS.map((f) => [f.key, f.label]));
  const fields = [];
  const seen = new Set();
  for (const item of input) {
    const required = !!(item && item.required);
    const rawKey = String((item && item.key) || '').trim();
    if (coreLabel.has(rawKey)) {
      if (seen.has(rawKey)) continue;
      seen.add(rawKey);
      fields.push({ key: rawKey, label: coreLabel.get(rawKey), required });
    } else {
      // Trường tự đặt: dùng nhãn làm khoá, lưu vào extra
      const label = String((item && (item.label || item.key)) || '').trim().replace(/\s+/g, ' ');
      if (!label) continue;
      if (label.length > MAX_LABEL_LENGTH) return { error: `Tên trường "${label.slice(0, 20)}…" quá dài (tối đa ${MAX_LABEL_LENGTH} ký tự)` };
      const lower = label.toLowerCase();
      if (seen.has(lower) || [...coreLabel.values()].some((l) => l.toLowerCase() === lower)) {
        return { error: `Trường "${label}" bị trùng` };
      }
      seen.add(lower);
      fields.push({ key: label, label, required });
    }
  }
  // Họ và tên luôn có mặt và bắt buộc (cần để hiển thị ai đã ghi danh)
  const nameField = fields.find((f) => f.key === 'full_name');
  if (nameField) nameField.required = true;
  else fields.unshift({ key: 'full_name', label: 'Họ và tên', required: true });
  if (fields.length > 15) return { error: 'Tối đa 15 trường trên form ghi danh' };
  return { fields };
}

module.exports = {
  getExtraFields, validateExtraFields, saveExtraFields,
  OPEN_CORE_FIELDS, DEFAULT_OPEN_FIELDS, validateOpenFields,
};
