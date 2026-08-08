// Bộ chọn người dùng để chia sẻ phiên điểm danh / danh sách đã lưu.
// Dùng chung một API cho cả hai:
//   GET  <url> → { can_manage, owner_id, shares: [{ id, username, full_name }] }
//   PUT  <url> ← { user_ids: [...] }
(function () {
  const t = window.t || ((k, fb) => fb || k);
  let directory = null;      // danh bạ người dùng, tải một lần cho mỗi trang
  let selected = new Set();
  let ctx = null;            // { url, onSaved }
  let canManage = false;
  let shares = [];           // người đang được chia sẻ (dùng cho chế độ chỉ xem)

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay hidden';
  overlay.innerHTML = `
    <div class="modal" style="max-width:520px;">
      <div class="modal-hero">
        <div><h2 id="sharePickTitle"></h2><p id="sharePickSub"></p></div>
        <button class="modal-close" type="button" data-close aria-label="${t('common.close', 'Đóng')}">×</button>
      </div>
      <div class="modal-body">
        <div id="sharePickAlert" class="alert hidden"></div>
        <input id="sharePickSearch" placeholder="${t('share.searchPh', 'Tìm theo họ tên hoặc tên đăng nhập…')}">
        <div id="sharePickUsers" style="max-height:320px;overflow-y:auto;"></div>
        <button class="btn full mt" id="sharePickSave">${t('share.save', '💾 Lưu chia sẻ')}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const $ = (id) => document.getElementById(id);
  const close = () => overlay.classList.add('hidden');
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('[data-close]').addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function render() {
    const q = $('sharePickSearch').value.trim().toLowerCase();
    const box = $('sharePickUsers');
    // Chỉ xem: liệt kê người đang được chia sẻ, không cho sửa
    const users = canManage
      ? directory.filter((u) => !q || `${u.full_name || ''} ${u.username}`.toLowerCase().includes(q))
      : shares;

    if (!users.length) {
      box.innerHTML = `<p class="muted">${canManage ? t('share.noUsers', 'Không có người dùng phù hợp.') : t('share.none', 'Chưa chia sẻ cho ai.')}</p>`;
      return;
    }
    box.innerHTML = users.map((u) => {
      const name = esc(u.full_name || u.username);
      const sub = `<span class="muted">${esc(u.username)}${u.role === 'admin' ? ' · admin' : ''}</span>`;
      if (!canManage) return `<div style="padding:8px 0;border-bottom:1px solid var(--border);"><b>${name}</b><br>${sub}</div>`;
      return `<label class="radio" style="margin:0;padding:6px 0;">
          <input type="checkbox" class="sharePickCb" value="${u.id}" ${selected.has(u.id) ? 'checked' : ''}>
          <span><b>${name}</b><br>${sub}</span>
        </label>`;
    }).join('');
    box.querySelectorAll('.sharePickCb').forEach((cb) => {
      cb.onchange = () => { cb.checked ? selected.add(Number(cb.value)) : selected.delete(Number(cb.value)); };
    });
  }

  $('sharePickSearch').addEventListener('input', render);

  $('sharePickSave').addEventListener('click', async () => {
    clearAlert('sharePickAlert');
    try {
      await api(ctx.url, { method: 'PUT', body: { user_ids: [...selected] } });
      close();
      if (ctx.onSaved) ctx.onSaved();
    } catch (e) { showAlert('sharePickAlert', e.message); }
  });

  // options: { title, subtitle, url, onSaved }
  window.openSharePicker = async function (options) {
    ctx = options;
    $('sharePickTitle').textContent = options.title;
    $('sharePickSub').textContent = options.subtitle || '';
    $('sharePickSearch').value = '';
    clearAlert('sharePickAlert');
    $('sharePickUsers').innerHTML = `<p class="muted">${t('share.loading', 'Đang tải…')}</p>`;
    overlay.classList.remove('hidden');
    try {
      if (!directory) directory = await api('/api/users/directory');
      const info = await api(options.url);
      canManage = !!info.can_manage;
      shares = info.shares || [];
      selected = new Set(shares.map((s) => s.id));
      // Người được chia sẻ chỉ xem được danh sách, không sửa
      $('sharePickSearch').classList.toggle('hidden', !canManage);
      $('sharePickSave').classList.toggle('hidden', !canManage);
      if (!canManage) showAlert('sharePickAlert', t('share.readonly', 'Chỉ người tạo mới thay đổi được danh sách chia sẻ.'), 'warn');
      render();
    } catch (e) {
      $('sharePickUsers').innerHTML = '';
      showAlert('sharePickAlert', e.message);
    }
  };
})();
