// Thành phần dùng chung cho mọi trang: menu Giới thiệu / Hướng dẫn + footer
(function () {
  /* ---------- Menu trên thanh điều hướng ---------- */
  const topbar = document.querySelector('.topbar');
  if (topbar) {
    const nav = document.createElement('nav');
    nav.className = 'topbar-menu';
    nav.innerHTML = `
      <button class="link" type="button" data-modal="aboutModal">Giới thiệu</button>
      <button class="link" type="button" data-modal="guideModal">Hướng dẫn</button>`;
    const actions = topbar.querySelector('.actions');
    topbar.insertBefore(nav, actions);
  }

  /* ---------- Footer ---------- */
  const footer = document.createElement('footer');
  footer.className = 'site-footer';
  footer.innerHTML = '© 2026 TBit SmartID - Ứng dụng điểm danh thông minh. Phát triển bởi <a href="https://tbit.vn" target="_blank" rel="noopener">TBit</a>';
  document.body.appendChild(footer);

  /* ---------- Modal Giới thiệu ---------- */
  const modals = document.createElement('div');
  modals.innerHTML = `
  <div class="modal-overlay hidden" id="aboutModal">
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="aboutTitle">
      <div class="modal-head">
        <h2 id="aboutTitle">Giới thiệu TBit SmartID</h2>
        <button class="modal-close" type="button" data-close aria-label="Đóng">×</button>
      </div>
      <div class="modal-body">
        <p><b>TBit SmartID</b> là ứng dụng điểm danh sự kiện thông minh bằng <b>mã QR động</b>:
        ban tổ chức nhập danh sách đại biểu từ Excel, chiếu mã QR lên màn hình,
        đại biểu quét mã và nhập CCCD + số điện thoại để xác nhận có mặt.
        Mã QR tự đổi liên tục giúp chống điểm danh hộ từ xa; hệ thống thống kê
        và xuất kết quả Excel ngay khi kết thúc.</p>
        <h3>Bản quyền</h3>
        <p>Ứng dụng được cung cấp <b>miễn phí</b> (free) cho các đơn vị, tổ chức có nhu cầu điểm danh sự kiện.</p>
        <h3>Tác giả</h3>
        <p><b>Nguyễn Duy Hiếu</b></p>
        <h3>Liên hệ tạo tài khoản người dùng</h3>
        <p>Để được cấp tài khoản sử dụng hệ thống, vui lòng liên hệ:</p>
        <ul>
          <li>Email: <a href="mailto:hieund@utb.edu.vn">hieund@utb.edu.vn</a></li>
          <li>Email: <a href="mailto:hieu3210@gmail.com">hieu3210@gmail.com</a></li>
        </ul>
      </div>
    </div>
  </div>

  <div class="modal-overlay hidden" id="guideModal">
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="guideTitle">
      <div class="modal-head">
        <h2 id="guideTitle">Hướng dẫn sử dụng</h2>
        <button class="modal-close" type="button" data-close aria-label="Đóng">×</button>
      </div>
      <div class="modal-body">
        <h3>1. Tạo phiên — chọn 1 trong 2 loại</h3>
        <ul>
          <li>Đăng nhập → bấm <b>＋ Tạo phiên mới</b>, đặt tên sự kiện và chọn loại phiên:</li>
          <li><b>Theo danh sách đã có</b>: tải <b>template Excel</b>, điền danh sách đại biểu (CCCD, họ tên, đơn vị, SĐT — cột CCCD và SĐT để dạng <b>Text</b> để không mất số 0 đầu), kéo-thả file .xlsx vào ô tải lên và kiểm tra bảng xem trước.</li>
          <li><b>Không theo danh sách (ghi danh tự do)</b>: chọn các trường thông tin người tham dự cần điền (mặc định hoặc thêm trường riêng), đánh dấu trường <b>bắt buộc</b>. Người tham dự quét QR, tự điền thông tin và hệ thống ghi nhận vào danh sách ghi danh.</li>
        </ul>
        <h3>2. Điểm danh bằng QR</h3>
        <ul>
          <li>Bấm <b>▶ Bắt đầu</b> rồi chiếu mã QR lên màn hình lớn.</li>
          <li>Đại biểu quét mã bằng camera điện thoại → nhập <b>CCCD + SĐT</b> (phiên theo danh sách) hoặc <b>điền form ghi danh</b> (phiên tự do).</li>
          <li>Mã QR <b>tự đổi sau mỗi 10 giây</b> để chống điểm danh hộ từ xa; bộ đếm số người cập nhật trực tiếp.</li>
        </ul>
        <h3>3. Tích tay &amp; duyệt cảnh báo</h3>
        <ul>
          <li>Đại biểu không có điện thoại: tìm tên trong mục <b>Tích tay</b> và bấm <b>✓ Có mặt</b>.</li>
          <li>Lượt điểm danh nghi vấn (một thiết bị điểm danh cho nhiều người) sẽ vào mục <b>⚠ Cần xác nhận</b> — bấm <b>Duyệt</b> hoặc <b>Từ chối</b>.</li>
        </ul>
        <h3>4. Kết thúc &amp; thống kê</h3>
        <ul>
          <li>Bấm <b>⏹ Kết thúc điểm danh</b> để xem tỉ lệ tham gia, danh sách có mặt / vắng mặt.</li>
          <li><b>＋ Điểm danh bổ sung</b>: mở lại QR cho người đến muộn.</li>
          <li><b>⬇ Xuất Excel</b>: tải kết quả điểm danh đầy đủ.</li>
        </ul>
        <h3>5. Quản lý người dùng (quản trị viên)</h3>
        <ul>
          <li>Menu <b>Quản lý người dùng</b>: thêm / xoá tài khoản, đặt lại mật khẩu. Tài khoản mới phải đổi mật khẩu ở lần đăng nhập đầu.</li>
          <li>Mục <b>Trường thông tin file Excel</b>: bổ sung trường riêng (VD: Chức vụ) ngoài các trường mặc định — trường bổ sung tự có trong template, bảng xem trước và file kết quả; bấm <b>↺ Về mặc định</b> để bỏ hết trường bổ sung.</li>
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
    overlay.querySelector('[data-close]').addEventListener('click', closeModals);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModals(); });
})();
