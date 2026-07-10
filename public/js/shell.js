// Thành phần dùng chung cho mọi trang: favicon, logo, menu, ngôn ngữ, chủ đề, footer, modal
(function () {
  const t = window.t || ((k, fb) => fb || k);
  const LANG_META = { vi: { flag: '🇻🇳', label: 'Tiếng Việt' }, en: { flag: '🇬🇧', label: 'English' } };
  const curLang = window.I18N_LANG || 'vi';
  /* ---------- Favicon ---------- */
  const fav = document.createElement('link');
  fav.rel = 'icon';
  fav.type = 'image/svg+xml';
  fav.href = '/img/logo.svg';
  document.head.appendChild(fav);

  /* ---------- Logo trước tên ứng dụng ---------- */
  const brand = document.querySelector('.topbar .brand');
  if (brand) {
    brand.innerHTML = '<img class="brand-logo" src="/img/logo.svg" alt=""> ' + brand.textContent.replace('📋', '').trim();
  }

  /* ---------- Menu trên thanh điều hướng (sticky + off-canvas mobile) ---------- */
  const topbar = document.querySelector('.topbar');
  if (topbar) {
    const nav = document.createElement('nav');
    nav.className = 'topbar-menu';
    const langItems = Object.keys(LANG_META)
      .map((l) => `<button type="button" data-lang="${l}" class="${l === curLang ? 'active' : ''}">${LANG_META[l].flag} ${LANG_META[l].label}</button>`).join('');
    // Thứ tự: Giới thiệu → Hướng dẫn → Ngôn ngữ → Sáng/Tối
    nav.innerHTML = `
      <button class="link" type="button" data-modal="aboutModal">ℹ️ ${t('nav.about', 'Giới thiệu')}</button>
      <button class="link" type="button" data-modal="guideModal">📖 ${t('nav.guide', 'Hướng dẫn')}</button>
      <div class="lang-switch">
        <button class="link lang-btn" id="langBtn" type="button" aria-label="${LANG_META[curLang].label}" title="${LANG_META[curLang].label}">${LANG_META[curLang].flag}</button>
        <div class="lang-menu hidden" id="langMenu">${langItems}</div>
      </div>
      <button class="link theme-toggle" type="button" id="btnTheme" title="${t('nav.theme', 'Chế độ sáng/tối')}" aria-label="${t('nav.theme', 'Chế độ sáng/tối')}"></button>`;
    const actions = topbar.querySelector('.actions');

    // Gom actions (lời chào/đăng xuất/Quản trị) + menu vào một khối để trượt off-canvas trên điện thoại.
    // Thứ tự tổng: [actions] rồi [nav] → Xin chào(Đăng xuất) → Quản trị → Giới thiệu → Hướng dẫn → Ngôn ngữ → Sáng/Tối
    const right = document.createElement('div');
    right.className = 'topbar-right';
    if (actions) topbar.insertBefore(right, actions); else topbar.appendChild(right);
    if (actions) right.appendChild(actions);
    right.appendChild(nav);

    const toggle = document.createElement('button');
    toggle.className = 'nav-toggle';
    toggle.type = 'button';
    toggle.setAttribute('aria-label', 'Mở menu');
    toggle.innerHTML = '☰';
    topbar.appendChild(toggle);

    const backdrop = document.createElement('div');
    backdrop.className = 'nav-backdrop';
    topbar.appendChild(backdrop);

    const closeNav = () => topbar.classList.remove('nav-open');
    toggle.addEventListener('click', () => topbar.classList.toggle('nav-open'));
    backdrop.addEventListener('click', closeNav);
    right.addEventListener('click', (e) => {
      // Không đóng off-canvas khi bấm mở menu ngôn ngữ
      if (e.target.closest('#langBtn, #langMenu')) return;
      if (e.target.closest('a, button')) closeNav();
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeNav(); });

    /* ---------- Chuyển ngôn ngữ ---------- */
    const langBtn = document.getElementById('langBtn');
    const langMenu = document.getElementById('langMenu');
    langBtn.addEventListener('click', (e) => { e.stopPropagation(); langMenu.classList.toggle('hidden'); });
    langMenu.querySelectorAll('[data-lang]').forEach((b) => {
      b.addEventListener('click', () => { if (window.setLang) window.setLang(b.dataset.lang); });
    });
    document.addEventListener('click', () => langMenu.classList.add('hidden'));
  }

  /* ---------- Chế độ sáng / tối ---------- */
  function currentTheme() {
    return document.documentElement.getAttribute('data-theme')
      || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  }
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem('tbit-theme', t); } catch (e) { /* bỏ qua */ }
    const b = document.getElementById('btnTheme');
    if (b) b.textContent = t === 'dark' ? '☀️' : '🌙';
  }
  const themeBtn = document.getElementById('btnTheme');
  if (themeBtn) {
    themeBtn.textContent = currentTheme() === 'dark' ? '☀️' : '🌙';
    themeBtn.addEventListener('click', () => applyTheme(currentTheme() === 'dark' ? 'light' : 'dark'));
  }

  /* ---------- Footer ---------- */
  const footer = document.createElement('footer');
  footer.className = 'site-footer';
  footer.innerHTML = `${t('footer.text', '© 2026 TBit SmartID - Ứng dụng điểm danh thông minh. Phát triển bởi')} <a href="https://tbit.vn" target="_blank" rel="noopener">TBit</a>`;
  document.body.appendChild(footer);

  /* ---------- Modal Giới thiệu + Hướng dẫn (nội dung theo ngôn ngữ) ---------- */
  const modals = document.createElement('div');
  modals.innerHTML = `
  <div class="modal-overlay hidden" id="aboutModal">
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="aboutTitle">
      <div class="modal-hero">
        <img src="/img/logo.svg" alt="TBit">
        <div><h2 id="aboutTitle">${t('about.title', 'TBit SmartID')}</h2><p>${t('about.sub', '')}</p></div>
        <button class="modal-close" type="button" data-close aria-label="${t('common.close', 'Đóng')}">×</button>
      </div>
      <div class="modal-body">${t('about.body', '')}</div>
    </div>
  </div>

  <div class="modal-overlay hidden" id="guideModal">
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="guideTitle">
      <div class="modal-hero">
        <img src="/img/logo.svg" alt="TBit">
        <div><h2 id="guideTitle">${t('guide.title', 'Hướng dẫn sử dụng')}</h2><p>${t('guide.sub', '')}</p></div>
        <button class="modal-close" type="button" data-close aria-label="${t('common.close', 'Đóng')}">×</button>
      </div>
      <div class="modal-body guide">${t('guide.body', '')}</div>
    </div>
  </div>`;
  while (modals.firstElementChild) document.body.appendChild(modals.firstElementChild);

  /* ---------- Mở / đóng modal ---------- */
  function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
  function closeModals() {
    document.querySelectorAll('.modal-overlay').forEach((m) => m.classList.add('hidden'));
  }

  document.querySelectorAll('[data-modal]').forEach((btn) => {
    btn.addEventListener('click', () => openModal(btn.dataset.modal));
  });
  document.querySelectorAll('.modal-overlay').forEach((overlay) => {
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModals(); });
    const closeBtn = overlay.querySelector('[data-close]');
    if (closeBtn) closeBtn.addEventListener('click', closeModals);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModals(); });
})();
