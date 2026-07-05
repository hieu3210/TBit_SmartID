// Gọi API JSON, tự chuyển về trang đăng nhập khi hết phiên
async function api(path, options = {}) {
  const opts = { headers: {}, ...options };
  if (opts.body && !(opts.body instanceof FormData)) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.body);
  }
  const res = await fetch(path, opts);
  let data = null;
  try { data = await res.json(); } catch (e) { /* file/binary */ }
  if (res.status === 401 && !path.startsWith('/api/checkin')) {
    // Chỉ chuyển về trang đăng nhập khi đang ở trang trong (tránh vòng lặp reload ở trang chủ)
    const p = location.pathname;
    if (p !== '/' && p !== '/index.html' && !p.startsWith('/checkin')) location.href = '/';
    throw new Error('Chưa đăng nhập');
  }
  if (!res.ok) throw new Error((data && data.error) || 'Có lỗi xảy ra, vui lòng thử lại');
  return data;
}

function el(id) { return document.getElementById(id); }

function show(id) { el(id).classList.remove('hidden'); }
function hide(id) { el(id).classList.add('hidden'); }

function showAlert(id, message, type = 'error') {
  const box = el(id);
  box.textContent = message;
  box.className = `alert ${type}`;
}
function clearAlert(id) { el(id).className = 'alert hidden'; }

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const _t = (k, fb) => (window.t ? window.t(k, fb) : fb);
const STATUS_LABEL = {
  draft: _t('status.draft', 'Chuẩn bị'),
  open: _t('status.open', 'Đang điểm danh'),
  closed: _t('status.closed', 'Đã kết thúc'),
  supplement: _t('status.supplement', 'Điểm danh bổ sung'),
};
