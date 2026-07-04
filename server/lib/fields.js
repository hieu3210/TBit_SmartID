const { getSetting, setSetting } = require('../db');

const MAX_CUSTOM = 10;
const MAX_LABEL_LENGTH = 40;

/* ============================================================
   TRƯỜNG DANH SÁCH (phiên "theo danh sách")
   Admin cấu hình mỗi trường: enabled (có trong template/mặc định)
   và required (bắt buộc nhập khi chuẩn bị danh sách).
   ============================================================ */

// Trường lõi — lưu vào cột riêng của attendees. Trường khác (custom) lưu trong JSONB extra.
const LIST_CORE = [
  { key: 'cccd', label: 'Số CCCD' },
  { key: 'full_name', label: 'Họ và tên' },
  { key: 'unit', label: 'Đơn vị' },
  { key: 'phone', label: 'Số điện thoại' },
  { key: 'email', label: 'Email' },
];
const CORE_KEYS = LIST_CORE.map((f) => f.key);
const CORE_LABEL = new Map(LIST_CORE.map((f) => [f.key, f.label]));

// Nhận diện cột theo tiêu đề (không phân biệt hoa thường) khi đọc file upload
const HEADER_MATCH = {
  cccd: (h) => h.includes('cccd') || h.includes('căn cước') || h.includes('cmnd') || h.includes('cmt'),
  full_name: (h) => h.startsWith('họ') || h.includes('họ tên') || h === 'tên',
  unit: (h) => h.includes('đơn vị') || h.includes('cơ quan'),
  phone: (h) => h.includes('điện thoại') || h === 'sđt' || h.includes('phone'),
  email: (h) => h.includes('email') || h.includes('thư điện tử'),
};

const DEFAULT_LIST_FIELDS = [
  { key: 'cccd', label: 'Số CCCD', enabled: true, required: true },
  { key: 'full_name', label: 'Họ và tên', enabled: true, required: false },
  { key: 'unit', label: 'Đơn vị', enabled: true, required: false },
  { key: 'phone', label: 'Số điện thoại', enabled: true, required: true },
  { key: 'email', label: 'Email', enabled: true, required: false },
];

function cloneDefault() {
  return DEFAULT_LIST_FIELDS.map((f) => ({ ...f }));
}

// Đưa cấu hình về dạng hợp lệ, đủ trường lõi, full_name luôn bật+bắt buộc, ≥1 định danh
function normalizeListFields(list) {
  const byKey = new Map();
  const custom = [];
  (Array.isArray(list) ? list : []).forEach((f) => {
    if (!f || !f.key) return;
    const key = String(f.key).trim();
    const entry = {
      key,
      label: CORE_LABEL.get(key) || String(f.label || key).trim().slice(0, MAX_LABEL_LENGTH),
      enabled: f.enabled !== false,
      required: !!f.required,
    };
    if (CORE_KEYS.includes(key)) byKey.set(key, entry);
    else if (entry.label) custom.push(entry);
  });
  // Trường lõi thiếu → bổ sung theo mặc định
  const result = LIST_CORE.map((c) => byKey.get(c.key)
    || { key: c.key, label: c.label, enabled: true, required: c.key === 'cccd' || c.key === 'phone' });
  // Cần ít nhất 1 định danh (CCCD hoặc SĐT) để tìm người trong danh sách
  if (!result.find((f) => (f.key === 'cccd' || f.key === 'phone') && f.enabled)) {
    result.find((f) => f.key === 'cccd').enabled = true;
  }
  return [...result, ...custom.slice(0, MAX_CUSTOM)];
}

async function getListFields() {
  try {
    const raw = await getSetting('list_fields');
    if (raw) return normalizeListFields(JSON.parse(raw));
  } catch (e) { /* rơi xuống mặc định */ }
  // Di trú từ cấu hình cũ (chỉ có danh sách trường bổ sung dạng chuỗi)
  try {
    const legacy = await getSetting('excel_extra_fields');
    const extra = legacy ? JSON.parse(legacy) : [];
    if (Array.isArray(extra) && extra.length) {
      return normalizeListFields([
        ...cloneDefault(),
        ...extra.filter((s) => typeof s === 'string' && s.trim())
          .map((label) => ({ key: label.trim(), label: label.trim(), enabled: true, required: false })),
      ]);
    }
  } catch (e) { /* bỏ qua */ }
  return cloneDefault();
}

function validateListFields(input) {
  if (!Array.isArray(input)) return { error: 'Dữ liệu không hợp lệ' };
  // Cần ≥1 định danh (CCCD hoặc SĐT) bật để còn tìm người trong danh sách
  const isEnabled = (key) => { const it = input.find((f) => f && f.key === key); return !it || it.enabled !== false; };
  if (!isEnabled('cccd') && !isEnabled('phone')) {
    return { error: 'Phải bật ít nhất một trong hai trường định danh: Số CCCD hoặc Số điện thoại' };
  }
  const seen = new Set();
  const coreLabelsLower = new Set([...CORE_LABEL.values()].map((l) => l.toLowerCase()));
  let customCount = 0;
  for (const item of input) {
    const key = String((item && item.key) || '').trim();
    if (CORE_KEYS.includes(key)) continue;
    const label = String((item && (item.label || item.key)) || '').trim().replace(/\s+/g, ' ');
    if (!label) continue;
    if (label.length > MAX_LABEL_LENGTH) return { error: `Tên trường "${label.slice(0, 20)}…" quá dài (tối đa ${MAX_LABEL_LENGTH} ký tự)` };
    const lower = label.toLowerCase();
    if (coreLabelsLower.has(lower) || seen.has(lower)) return { error: `Trường "${label}" bị trùng` };
    seen.add(lower);
    customCount += 1;
  }
  if (customCount > MAX_CUSTOM) return { error: `Tối đa ${MAX_CUSTOM} trường bổ sung` };
  return { fields: normalizeListFields(input) };
}

async function saveListFields(fields) {
  await setSetting('list_fields', JSON.stringify(fields));
}

// Các cột đang bật (đúng thứ tự) — dùng cho template, xem trước, xuất Excel
function enabledColumns(listFields) {
  return listFields.filter((f) => f.enabled).map((f) => ({
    key: f.key, label: f.label, required: !!f.required,
    kind: CORE_KEYS.includes(f.key) ? 'core' : 'custom',
  }));
}

/* ===== Trường bắt buộc nhập ĐỂ ĐIỂM DANH (phiên theo danh sách) ===== */

// Mặc định: CCCD + SĐT nếu đang bật, nếu không lấy định danh còn lại
function defaultCheckinFields(listFields) {
  const enabled = new Set(listFields.filter((f) => f.enabled).map((f) => f.key));
  const picks = ['cccd', 'phone'].filter((k) => enabled.has(k));
  return picks.length ? picks : [[...enabled][0]];
}

// input = mảng key; giữ các key đang bật, đảm bảo ≥1 định danh (cccd/phone)
function validateCheckinFields(input, listFields) {
  const enabled = enabledColumns(listFields);
  const enabledKeys = new Set(enabled.map((c) => c.key));
  const picked = (Array.isArray(input) ? input : []).map(String).filter((k) => enabledKeys.has(k));
  const uniq = [...new Set(picked)];
  if (!uniq.some((k) => k === 'cccd' || k === 'phone')) {
    return { error: 'Cần ít nhất một trường định danh (Số CCCD hoặc Số điện thoại) để tìm người trong danh sách' };
  }
  return { fields: uniq };
}

// Định nghĩa đầy đủ (key, label) của các trường điểm danh theo cấu hình phiên
function checkinFieldDefs(session, listFields) {
  const keys = (session.checkin_fields && session.checkin_fields.length)
    ? session.checkin_fields : defaultCheckinFields(listFields);
  const labelOf = new Map(enabledColumns(listFields).map((c) => [c.key, c.label]));
  return keys.filter((k) => labelOf.has(k)).map((k) => ({ key: k, label: labelOf.get(k) }));
}

/* ============================================================
   TRƯỜNG FORM GHI DANH TỰ DO (phiên "không theo danh sách"
   và nhánh ghi danh tự do của phiên theo danh sách)
   ============================================================ */

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
  if (!fields.length) return { error: 'Chọn ít nhất một trường thông tin' };
  // Cần ít nhất một trường định danh/hiển thị để ghi nhận người tham dự
  if (!fields.some((f) => ['full_name', 'phone', 'cccd'].includes(f.key))) {
    return { error: 'Cần ít nhất một trong các trường: Họ và tên, Số điện thoại hoặc Số CCCD' };
  }
  if (fields.length > 15) return { error: 'Tối đa 15 trường trên form ghi danh' };
  return { fields };
}

/* ===== Cột dữ liệu của một phiên (dùng cho xuất Excel/email tổng hợp) ===== */
function columnsForSession(session, listFields) {
  if (session.type === 'open') {
    const f = (session.fields && session.fields.length) ? session.fields : DEFAULT_OPEN_FIELDS;
    return f.map((x) => ({ key: x.key, label: x.label }));
  }
  return enabledColumns(listFields).map((c) => ({ key: c.key, label: c.label }));
}

module.exports = {
  CORE_KEYS, LIST_CORE, HEADER_MATCH,
  getListFields, saveListFields, validateListFields, enabledColumns,
  defaultCheckinFields, validateCheckinFields, checkinFieldDefs,
  OPEN_CORE_FIELDS, DEFAULT_OPEN_FIELDS, validateOpenFields,
  columnsForSession,
};
