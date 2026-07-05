const { getSetting, setSetting } = require('../db');

const MAX_CUSTOM = 10;
const MAX_LABEL_LENGTH = 40;

/* ============================================================
   TRƯỜNG DANH SÁCH (phiên "theo danh sách")
   Admin cấu hình mỗi trường: enabled (có trong template/mặc định)
   và required (bắt buộc nhập khi chuẩn bị danh sách).
   ============================================================ */

// Trường lõi — lưu vào cột riêng của attendees. Trường khác (custom) lưu trong JSONB extra.
// Mỗi trường có nhãn song ngữ vi/en.
const LIST_CORE = [
  { key: 'cccd', vi: 'Số CCCD', en: 'ID number' },
  { key: 'full_name', vi: 'Họ và tên', en: 'Full name' },
  { key: 'unit', vi: 'Đơn vị', en: 'Unit' },
  { key: 'phone', vi: 'Số điện thoại', en: 'Phone' },
  { key: 'email', vi: 'Email', en: 'Email' },
];
const CORE_KEYS = LIST_CORE.map((f) => f.key);
const CORE_LABELS = new Map(LIST_CORE.map((f) => [f.key, { vi: f.vi, en: f.en }]));

// Nhận diện cột lõi theo tiêu đề (không phân biệt hoa thường) khi đọc file upload
const HEADER_MATCH = {
  cccd: (h) => h.includes('cccd') || h.includes('căn cước') || h.includes('cmnd') || h.includes('cmt') || h.includes('id number') || h.includes('identity'),
  full_name: (h) => h.startsWith('họ') || h.includes('họ tên') || h === 'tên' || h.includes('full name') || h === 'name',
  unit: (h) => h.includes('đơn vị') || h.includes('cơ quan') || h === 'unit' || h.includes('organization'),
  phone: (h) => h.includes('điện thoại') || h === 'sđt' || h.includes('phone') || h.includes('mobile'),
  email: (h) => h.includes('email') || h.includes('thư điện tử'),
};

const DEFAULT_LIST_FIELDS = [
  { key: 'cccd', enabled: true, required: true },
  { key: 'full_name', enabled: true, required: false },
  { key: 'unit', enabled: true, required: false },
  { key: 'phone', enabled: true, required: true },
  { key: 'email', enabled: true, required: false },
];

function cloneDefault() {
  return DEFAULT_LIST_FIELDS.map((f) => ({ ...f }));
}

// Nhãn của một trường theo ngôn ngữ
function labelOf(f, lang) {
  if (CORE_LABELS.has(f.key)) return CORE_LABELS.get(f.key)[lang === 'en' ? 'en' : 'vi'];
  const vi = f.label_vi || f.label || f.key;
  const en = f.label_en || f.label_vi || f.label || f.key;
  return lang === 'en' ? en : vi;
}

// Sinh khoá ổn định (không dấu) cho trường custom từ nhãn tiếng Việt
function slugKey(label, taken) {
  let base = String(label || 'field').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').toLowerCase();
  if (!base) base = 'field';
  let key = base; let n = 1;
  while (taken.has(key) || CORE_KEYS.includes(key)) key = `${base}_${++n}`;
  taken.add(key);
  return key;
}

// Chuẩn hoá cấu hình — GIỮ NGUYÊN thứ tự và việc admin/người dùng đã xoá trường lõi.
// Không tự thêm lại trường lõi (admin có thể xoá trường mặc định).
function normalizeListFields(list) {
  const out = [];
  const takenKeys = new Set();
  let customCount = 0;
  (Array.isArray(list) ? list : []).forEach((f) => {
    if (!f) return;
    const key = String(f.key || '').trim();
    if (key && CORE_KEYS.includes(key)) {
      if (takenKeys.has(key)) return;
      takenKeys.add(key);
      out.push({ key, enabled: f.enabled !== false, required: !!f.required });
      return;
    }
    if (customCount >= MAX_CUSTOM) return;
    const labelVi = String(f.label_vi || f.label || key).trim().slice(0, MAX_LABEL_LENGTH);
    const labelEn = String(f.label_en || f.label_vi || f.label || key).trim().slice(0, MAX_LABEL_LENGTH);
    if (!labelVi) return;
    let k = key;
    if (!k || CORE_KEYS.includes(k) || takenKeys.has(k)) k = slugKey(labelVi, takenKeys); else takenKeys.add(k);
    out.push({ key: k, enabled: f.enabled !== false, required: !!f.required, label_vi: labelVi, label_en: labelEn });
    customCount += 1;
  });
  return out;
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
          .map((label) => ({ key: label.trim(), label_vi: label.trim(), label_en: label.trim(), enabled: true, required: false })),
      ]);
    }
  } catch (e) { /* bỏ qua */ }
  return cloneDefault();
}

// type = 'list' (cần ≥1 định danh CCCD/SĐT) | 'open' (cần ≥1 trường Họ tên/SĐT/CCCD)
function validateSessionFields(input, type = 'list') {
  if (!Array.isArray(input)) return { error: 'Dữ liệu không hợp lệ' };
  const isEnabled = (key) => { const it = input.find((f) => f && f.key === key); return !!it && it.enabled !== false; };
  if (type === 'list') {
    if (!isEnabled('cccd') && !isEnabled('phone')) {
      return { error: 'Phải bật ít nhất một trong hai trường định danh: Số CCCD hoặc Số điện thoại' };
    }
  } else if (!isEnabled('full_name') && !isEnabled('phone') && !isEnabled('cccd')) {
    return { error: 'Cần bật ít nhất một trong các trường: Họ và tên, Số điện thoại hoặc Số CCCD' };
  }
  const seen = new Set();
  const coreLabelsLower = new Set();
  CORE_LABELS.forEach((v) => { coreLabelsLower.add(v.vi.toLowerCase()); coreLabelsLower.add(v.en.toLowerCase()); });
  let customCount = 0;
  for (const item of input) {
    const key = String((item && item.key) || '').trim();
    if (CORE_KEYS.includes(key)) continue;
    const labelVi = String((item && (item.label_vi || item.label || item.key)) || '').trim().replace(/\s+/g, ' ');
    if (!labelVi) continue;
    if (labelVi.length > MAX_LABEL_LENGTH) return { error: `Tên trường "${labelVi.slice(0, 20)}…" quá dài (tối đa ${MAX_LABEL_LENGTH} ký tự)` };
    const lower = labelVi.toLowerCase();
    if (coreLabelsLower.has(lower) || seen.has(lower)) return { error: `Trường "${labelVi}" bị trùng` };
    seen.add(lower);
    customCount += 1;
  }
  if (customCount > MAX_CUSTOM) return { error: `Tối đa ${MAX_CUSTOM} trường bổ sung` };
  const fields = normalizeListFields(input);
  if (!fields.some((f) => f.enabled)) return { error: 'Chọn ít nhất một trường thông tin' };
  return { fields };
}

// Admin cấu hình mặc định hệ thống (luôn là phiên danh sách)
function validateListFields(input) { return validateSessionFields(input, 'list'); }

async function saveListFields(fields) {
  await setSetting('list_fields', JSON.stringify(fields));
}

// Các cột đang bật (đúng thứ tự) — nhãn theo ngôn ngữ; matchNames để đọc file (custom)
function enabledColumns(listFields, lang = 'vi') {
  return listFields.filter((f) => f.enabled).map((f) => {
    const kind = CORE_KEYS.includes(f.key) ? 'core' : 'custom';
    return {
      key: f.key, label: labelOf(f, lang), required: !!f.required, kind,
      matchNames: kind === 'custom' ? [f.label_vi, f.label_en].filter(Boolean).map((s) => s.toLowerCase()) : null,
    };
  });
}

// Cấu hình đầy đủ (kèm nhãn vi/en) cho trình sửa của admin
function fieldsWithLabels(listFields) {
  return listFields.map((f) => ({
    key: f.key,
    enabled: !!f.enabled,
    required: !!f.required,
    kind: CORE_KEYS.includes(f.key) ? 'core' : 'custom',
    label_vi: labelOf(f, 'vi'),
    label_en: labelOf(f, 'en'),
  }));
}

/* ===== Trường bắt buộc nhập ĐỂ ĐIỂM DANH (phiên theo danh sách) ===== */

// Mặc định: chỉ cần Số điện thoại (nếu bật), nếu không thì Số CCCD
function defaultCheckinFields(listFields) {
  const enabled = new Set(listFields.filter((f) => f.enabled).map((f) => f.key));
  if (enabled.has('phone')) return ['phone'];
  if (enabled.has('cccd')) return ['cccd'];
  return [[...enabled][0]];
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

// Định nghĩa đầy đủ (key, label) của các trường điểm danh theo cấu hình phiên + ngôn ngữ
function checkinFieldDefs(session, globalFields, lang = 'vi') {
  const config = sessionFieldConfig(session, globalFields);
  const keys = (session.checkin_fields && session.checkin_fields.length)
    ? session.checkin_fields : defaultCheckinFields(config);
  const byKey = new Map(enabledColumns(config, lang).map((c) => [c.key, c.label]));
  return keys.filter((k) => byKey.has(k)).map((k) => ({ key: k, label: byKey.get(k) }));
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

const DEFAULT_OPEN_CONFIG = [
  { key: 'full_name', enabled: true, required: true },
  { key: 'phone', enabled: true, required: true },
];

// Chuyển cấu hình form ghi danh cũ ({key,label,required}) sang cấu hình trường mới
function convertLegacyOpenFields(fields) {
  const taken = new Set();
  return (fields || []).map((f) => {
    const key = String(f.key || '').trim();
    if (CORE_KEYS.includes(key)) { taken.add(key); return { key, enabled: true, required: !!f.required }; }
    const label = String(f.label || key).trim();
    return { key: slugKey(label, taken), enabled: true, required: !!f.required, label_vi: label, label_en: label };
  });
}

// Cấu hình trường hiệu lực của một phiên: ưu tiên list_fields riêng, rồi (open cũ) fields, cuối cùng mặc định hệ thống
function sessionFieldConfig(session, globalFields) {
  if (session.list_fields && session.list_fields.length) return normalizeListFields(session.list_fields);
  if (session.type === 'open') {
    if (session.fields && session.fields.length) return convertLegacyOpenFields(session.fields);
    return DEFAULT_OPEN_CONFIG.map((f) => ({ ...f }));
  }
  return globalFields;
}

// Trường của form nhập (ghi danh tự do / walk-in): các trường đang bật + cờ bắt buộc
function formFields(config, lang = 'vi') {
  return enabledColumns(config, lang).map((c) => ({ key: c.key, label: c.label, required: c.required, kind: c.kind }));
}

/* ===== Cột dữ liệu của một phiên (template/xem trước/xuất Excel) theo cấu hình phiên ===== */
function columnsForSession(session, globalFields, lang = 'vi') {
  return enabledColumns(sessionFieldConfig(session, globalFields), lang).map((c) => ({ key: c.key, label: c.label }));
}

module.exports = {
  CORE_KEYS, LIST_CORE, HEADER_MATCH,
  getListFields, saveListFields, validateListFields, validateSessionFields, enabledColumns, fieldsWithLabels,
  defaultCheckinFields, validateCheckinFields, checkinFieldDefs,
  OPEN_CORE_FIELDS, DEFAULT_OPEN_FIELDS, validateOpenFields,
  sessionFieldConfig, formFields, columnsForSession,
};
