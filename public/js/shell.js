// Thành phần dùng chung cho mọi trang: favicon, logo, menu Giới thiệu / Hướng dẫn + footer
(function () {
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

  /* ---------- Menu trên thanh điều hướng ---------- */
  const topbar = document.querySelector('.topbar');
  if (topbar) {
    const nav = document.createElement('nav');
    nav.className = 'topbar-menu';
    nav.innerHTML = `
      <button class="link theme-toggle" type="button" id="btnTheme" title="Chế độ sáng/tối" aria-label="Chuyển chế độ sáng/tối"></button>
      <button class="link" type="button" data-modal="aboutModal">Giới thiệu</button>
      <button class="link" type="button" data-modal="guideModal">Hướng dẫn</button>`;
    const actions = topbar.querySelector('.actions');
    topbar.insertBefore(nav, actions);
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
  footer.innerHTML = '© 2026 TBit SmartID - Ứng dụng điểm danh thông minh. Phát triển bởi <a href="https://tbit.vn" target="_blank" rel="noopener">TBit</a>';
  document.body.appendChild(footer);

  /* ---------- Modal Giới thiệu + Hướng dẫn ---------- */
  const modals = document.createElement('div');
  modals.innerHTML = `
  <div class="modal-overlay hidden" id="aboutModal">
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="aboutTitle">
      <div class="modal-hero">
        <img src="/img/logo.svg" alt="TBit">
        <div>
          <h2 id="aboutTitle">TBit SmartID</h2>
          <p>Ứng dụng điểm danh sự kiện thông minh</p>
        </div>
        <button class="modal-close" type="button" data-close aria-label="Đóng">×</button>
      </div>
      <div class="modal-body">
        <p><b>TBit SmartID</b> giúp điểm danh sự kiện đông người bằng <b>mã QR động</b>:
        ban tổ chức chuẩn bị danh sách từ Excel (hoặc mở ghi danh tự do), chiếu mã QR lên màn hình,
        người tham dự quét mã và xác nhận trong vài giây — không cần cài app.
        Mã QR tự đổi liên tục chống điểm danh hộ từ xa; kết quả được thống kê và xuất Excel ngay khi kết thúc.</p>
        <div class="feature-grid">
          <div class="feature">📱 <b>Không cần app</b><br>Quét bằng camera điện thoại</div>
          <div class="feature">🔒 <b>Chống gian lận</b><br>QR động + ràng buộc thiết bị</div>
          <div class="feature">📊 <b>Thống kê tức thì</b><br>Tỉ lệ tham gia, xuất Excel</div>
          <div class="feature">📝 <b>2 hình thức</b><br>Theo danh sách / ghi danh tự do</div>
        </div>
        <h3>Bản quyền</h3>
        <p>Ứng dụng được cung cấp <b>miễn phí</b> cho các đơn vị, tổ chức có nhu cầu điểm danh sự kiện.</p>
        <h3>Tác giả &amp; liên hệ</h3>
        <div class="contact-box">
          <div class="contact-name">Nguyễn Duy Hiếu</div>
          <div>Liên hệ để được cấp tài khoản sử dụng giải pháp:</div>
          <div>📞 Điện thoại / Zalo: <a href="tel:0972782203">0972782203</a></div>
          <div>✉️ <a href="mailto:hieund@utb.edu.vn">hieund@utb.edu.vn</a> · <a href="mailto:hieu3210@gmail.com">hieu3210@gmail.com</a></div>
        </div>
      </div>
    </div>
  </div>

  <div class="modal-overlay hidden" id="guideModal">
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="guideTitle">
      <div class="modal-hero">
        <img src="/img/logo.svg" alt="TBit">
        <div>
          <h2 id="guideTitle">Hướng dẫn sử dụng</h2>
          <p>Toàn bộ chức năng điểm danh trong 5 bước</p>
        </div>
        <button class="modal-close" type="button" data-close aria-label="Đóng">×</button>
      </div>
      <div class="modal-body guide">
        <h3><span class="step-n">1</span>Tạo phiên — chọn 1 trong 2 loại</h3>
        <ul>
          <li>Bấm <b>＋ Tạo phiên mới</b>, đặt tên sự kiện, chọn loại phiên; có thể đặt <b>thời gian tự kết thúc</b> và <b>chu kỳ đổi mã QR</b> riêng (hoặc mã cố định).</li>
          <li><b>Theo danh sách đã có</b>: tải <b>template Excel</b>, điền danh sách (cột CCCD và SĐT để dạng <b>Text</b> để không mất số 0 đầu), kéo-thả file vào ô tải lên — hoặc <b>chọn danh sách đã lưu</b> từ lần trước. Có thể <b>thêm / sửa / xoá</b> từng người và <b>lưu danh sách</b> để dùng lại. Khi tạo, chọn <b>trường bắt buộc để điểm danh</b> (VD chỉ cần SĐT) và có thể bật <b>ghi danh tự do</b> cho người ngoài danh sách.</li>
          <li><b>Không theo danh sách (ghi danh tự do)</b>: chọn các trường người tham dự cần điền, đánh dấu trường <b>bắt buộc</b>; người tham dự quét QR và tự ghi danh.</li>
        </ul>
        <h3><span class="step-n">2</span>Điểm danh bằng QR</h3>
        <ul>
          <li>Bấm <b>▶ Bắt đầu</b> rồi chiếu mã QR lên màn hình lớn; bộ đếm cập nhật trực tiếp.</li>
          <li>Người tham dự quét mã → nhập <b>CCCD + SĐT</b> (phiên theo danh sách) hoặc <b>điền form ghi danh</b> (phiên tự do).</li>
          <li>Mã QR tự đổi theo chu kỳ đã đặt để chống điểm danh hộ từ xa; hết thời gian đã hẹn, phiên <b>tự kết thúc</b> và gửi email tổng hợp cho người tạo.</li>
        </ul>
        <h3><span class="step-n">3</span>Tích tay &amp; xử lý tình huống</h3>
        <ul>
          <li>Người không có điện thoại: tìm tên trong mục <b>Tích tay</b> và bấm <b>✓ Có mặt</b>; có thể <b>thêm người mới</b> hoặc sửa thông tin người chưa điểm danh ngay lúc đang điểm danh.</li>
          <li>Lượt nghi vấn (một thiết bị điểm danh nhiều người) vào mục <b>⚠ Cần xác nhận</b> — bấm <b>Duyệt</b> hoặc <b>Từ chối</b>.</li>
        </ul>
        <h3><span class="step-n">4</span>Kết thúc &amp; thống kê</h3>
        <ul>
          <li>Bấm <b>⏹ Kết thúc</b> (hoặc để hệ thống tự kết thúc đúng giờ) → xem tỉ lệ tham gia, danh sách có mặt / vắng mặt.</li>
          <li><b>▶ Mở lại phiên</b> để tiếp tục điểm danh cho người đến muộn, có thể đặt lại giờ kết thúc; <b>⬇ Xuất Excel</b> tải kết quả đầy đủ.</li>
        </ul>
        <h3><span class="step-n">5</span>Quản trị hệ thống (quản trị viên)</h3>
        <ul>
          <li>Menu <b>Quản trị</b>: quản lý người dùng (họ tên, email, vai trò), cấu hình <b>trường danh sách</b> (trường nào có trong mẫu / bắt buộc nhập), <b>chu kỳ QR mặc định</b> và <b>máy chủ email (SMTP)</b>.</li>
          <li>Quên mật khẩu? Bấm <b>Quên mật khẩu</b> ở màn đăng nhập — hệ thống gửi link đặt lại qua email.</li>
        </ul>
      </div>
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
