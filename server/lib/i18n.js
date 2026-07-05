const { getSetting, setSetting } = require('../db');

const LANGS = ['vi', 'en'];

// Từ điển mặc định. Khoá phẳng, nhóm theo tiền tố. Admin có thể ghi đè trong Quản trị.
const DEFAULTS = {
  vi: {
    'app.name': 'TBit SmartID',
    'app.tagline': 'Điểm danh sự kiện thông minh',
    'nav.about': 'Giới thiệu',
    'nav.guide': 'Hướng dẫn',
    'nav.admin': 'Quản trị',
    'nav.logout': 'Đăng xuất',
    'nav.login': 'Đăng nhập',
    'nav.back': '← Danh sách phiên',
    'footer.text': '© 2026 TBit SmartID - Ứng dụng điểm danh thông minh. Phát triển bởi',

    'landing.eyebrow': 'Giải pháp điểm danh sự kiện',
    'landing.title': 'Điểm danh sự kiện <span class="accent">thông minh</span> bằng mã QR động',
    'landing.lead': 'TBit SmartID giúp ban tổ chức điểm danh nhanh, chính xác và chống gian lận cho hội nghị, sự kiện đông người — người tham dự chỉ cần quét QR bằng điện thoại, không cần cài ứng dụng.',
    'landing.loginBtn': 'Đăng nhập hệ thống',
    'landing.guideBtn': 'Xem hướng dẫn',
    'landing.note': 'Chưa có tài khoản? <a href="#contact">Liên hệ tác giả</a> để được cấp quyền sử dụng giải pháp.',
    'landing.features.title': 'Vì sao chọn TBit SmartID?',
    'landing.features.sub': 'Đơn giản cho người tham dự, mạnh mẽ cho ban tổ chức.',
    'landing.f1.title': 'Không cần cài app', 'landing.f1.desc': 'Người tham dự quét QR bằng camera điện thoại và xác nhận trong vài giây.',
    'landing.f2.title': 'Chống điểm danh hộ', 'landing.f2.desc': 'Mã QR tự đổi liên tục, ràng buộc thiết bị và giới hạn tần suất chống gian lận.',
    'landing.f3.title': 'Hai hình thức', 'landing.f3.desc': 'Điểm danh theo danh sách có sẵn hoặc ghi danh tự do cho sự kiện mở.',
    'landing.f4.title': 'Thống kê tức thì', 'landing.f4.desc': 'Tỉ lệ tham gia, danh sách có mặt/vắng mặt và xuất Excel ngay khi kết thúc.',
    'landing.f5.title': 'Tự kết thúc & email', 'landing.f5.desc': 'Hẹn giờ đóng điểm danh; hệ thống tự tổng hợp và gửi email kết quả cho bạn.',
    'landing.f6.title': 'Lưu & dùng lại', 'landing.f6.desc': 'Lưu danh sách người tham dự để tái sử dụng; thêm/sửa thành viên mọi lúc.',
    'landing.steps.title': 'Chỉ 3 bước',
    'landing.steps.sub': 'Từ chuẩn bị đến báo cáo, tất cả trong một hệ thống.',
    'landing.s1.title': 'Chuẩn bị', 'landing.s1.desc': 'Tạo phiên, tải danh sách từ Excel hoặc mở ghi danh tự do. Cấu hình trường thông tin theo nhu cầu.',
    'landing.s2.title': 'Điểm danh', 'landing.s2.desc': 'Chiếu mã QR lên màn hình; người tham dự quét và xác nhận. Bộ đếm cập nhật trực tiếp.',
    'landing.s3.title': 'Tổng hợp', 'landing.s3.desc': 'Kết thúc phiên để xem thống kê, xuất Excel và nhận email báo cáo tự động.',
    'landing.contact.title': 'Nhận tài khoản sử dụng giải pháp',
    'landing.contact.desc': 'Liên hệ tác giả Nguyễn Duy Hiếu để được cấp tài khoản và hỗ trợ triển khai.',

    'login.title': 'Đăng nhập hệ thống',
    'login.sub': 'TBit SmartID — Điểm danh sự kiện',
    'login.username': 'Tên đăng nhập',
    'login.password': 'Mật khẩu',
    'login.submit': 'Đăng nhập',
    'login.forgot': 'Quên mật khẩu?',
    'login.forgotUser': 'Tên đăng nhập hoặc email',
    'login.forgotSubmit': 'Gửi link',
    'login.noAccount': 'Chưa có tài khoản? Liên hệ Zalo 0972782203 hoặc email hieund@utb.edu.vn',

    'cp.title': 'Đổi mật khẩu',
    'cp.desc': 'Bạn cần đổi mật khẩu trước khi sử dụng hệ thống.',
    'cp.old': 'Mật khẩu hiện tại',
    'cp.new': 'Mật khẩu mới (ít nhất 6 ký tự)',
    'cp.new2': 'Nhập lại mật khẩu mới',
    'cp.submit': 'Cập nhật mật khẩu',

    'sessions.title': 'Phiên điểm danh',
    'sessions.template': '⬇ Tải template Excel',
    'sessions.new': '＋ Tạo phiên mới',
    'sessions.empty': 'Chưa có phiên điểm danh nào.',
    'sessions.emptyHint': 'Bấm ＋ Tạo phiên mới để bắt đầu.',
    'sessions.present': 'Có mặt',
    'sessions.registered': 'Đã ghi danh',
    'sessions.noList': 'Chưa có danh sách',
    'sessions.noReg': 'Chưa có người ghi danh',

    'create.name': 'Tên sự kiện',
    'create.namePh': 'VD: Hội nghị tổng kết năm 2026',
    'create.type': 'Loại phiên',
    'create.typeList': 'Theo danh sách đã có',
    'create.typeListDesc': '— upload danh sách Excel, người tham dự quét QR để xác nhận có mặt',
    'create.typeOpen': 'Không theo danh sách (ghi danh tự do)',
    'create.typeOpenDesc': '— người tham dự quét QR và tự điền thông tin ghi danh',
    'create.checkinBy': 'Điểm danh bằng cách nhập',
    'create.checkinByHint': '(chọn ≥1 trường định danh)',
    'create.allowOpen': 'Cho phép ghi danh tự do',
    'create.allowOpenDesc': '— người không có trong danh sách vẫn quét QR và tự ghi danh',
    'create.endsAt': 'Tự kết thúc lúc',
    'create.optional': '(tuỳ chọn)',
    'create.qr': 'Mã QR',
    'create.qrDefault': 'Đổi theo mặc định hệ thống',
    'create.qrCustom': 'Đổi theo số giây tự chọn…',
    'create.qrFixed': 'Cố định (không đổi mã)',
    'create.qrSeconds': 'Số giây (5–300)',
    'create.note': 'Nếu không chọn thời gian tự kết thúc, phiên chỉ kết thúc khi bạn bấm nút Kết thúc. Khi có hẹn giờ, hết giờ hệ thống tự kết thúc và gửi email tổng hợp cho bạn. Mã QR cố định tiện in ra giấy nhưng giảm khả năng chống điểm danh hộ.',
    'create.submit': 'Tạo phiên',
    'create.cancel': 'Huỷ',

    'status.draft': 'Chuẩn bị',
    'status.open': 'Đang điểm danh',
    'status.closed': 'Đã kết thúc',
    'status.supplement': 'Điểm danh bổ sung',
    'badge.reg': 'Ghi danh',
    'badge.hasReg': 'Có ghi danh',
    'badge.walkin': 'Ghi danh thêm',

    'checkin.sub': 'Nhập thông tin để xác nhận có mặt',
    'checkin.subOpen': 'Điền thông tin để ghi danh tham dự sự kiện',
    'checkin.subWalkin': 'Bạn không có trong danh sách — điền thông tin để ghi danh',
    'checkin.submit': '✓ Điểm danh',
    'checkin.submitReg': '✓ Ghi danh',
    'checkin.processing': 'Đang xử lý…',
    'checkin.optional': '(không bắt buộc)',
    'checkin.notInList': 'Không có trong danh sách?',
    'checkin.regHere': 'Ghi danh tại đây »',
    'checkin.closedTitle': 'Phiên điểm danh chưa mở',
    'checkin.closedDesc': 'Phiên chưa bắt đầu hoặc đã kết thúc điểm danh. Vui lòng liên hệ ban tổ chức.',
    'checkin.notFound': 'Không tìm thấy phiên điểm danh',
    'checkin.time': 'Thời gian',

    'admin.title': 'Quản trị hệ thống',
    'admin.sys.title': 'Thiết lập hệ thống',
    'admin.sys.qr': 'Chu kỳ đổi mã QR mặc định (giây)',
    'admin.sys.qrHint': 'Áp dụng cho phiên không đặt chu kỳ riêng (5–300 giây).',
    'admin.smtp.title': 'Máy chủ email (SMTP)',
    'admin.smtp.save': '💾 Lưu thiết lập',
    'admin.smtp.testTo': 'Email nhận thử',
    'admin.smtp.test': '✉ Gửi email thử',
    'admin.fields.title': 'Trường thông tin danh sách điểm danh',
    'admin.fields.colField': 'Trường',
    'admin.fields.colInTemplate': 'Có trong mẫu',
    'admin.fields.colRequired': 'Bắt buộc',
    'admin.fields.addPh': 'Thêm trường riêng — VD: Chức vụ',
    'admin.fields.add': '＋ Thêm trường',
    'admin.fields.save': '💾 Lưu cấu hình trường',
    'admin.fields.default': '↺ Về mặc định',
    'admin.users.addTitle': 'Thêm người dùng',
    'admin.users.listTitle': 'Danh sách người dùng',
    'admin.users.fullName': 'Họ và tên',
    'admin.users.email': 'Email',
    'admin.users.username': 'Tên đăng nhập',
    'admin.users.initPass': 'Mật khẩu ban đầu',
    'admin.users.role': 'Vai trò',
    'admin.users.roleUser': 'Người dùng',
    'admin.users.roleAdmin': 'Quản trị',
    'admin.users.add': '＋ Thêm',
    'admin.i18n.title': 'Ngôn ngữ / Language',
    'admin.i18n.desc': 'Chỉnh nhãn giao diện cho từng ngôn ngữ. Để trống một ô sẽ dùng bản mặc định.',
    'admin.i18n.key': 'Khoá',
    'admin.i18n.save': '💾 Lưu bản dịch',
    'admin.i18n.reset': '↺ Về mặc định',

    'common.save': 'Lưu',
    'common.cancel': 'Huỷ',
    'common.close': 'Đóng',
    'common.delete': 'Xoá',
    'common.edit': 'Sửa',
    'common.search': 'Tìm kiếm…',

    'about.title': 'TBit SmartID',
    'about.sub': 'Ứng dụng điểm danh sự kiện thông minh',
    'about.body': '<p><b>TBit SmartID</b> giúp điểm danh sự kiện đông người bằng <b>mã QR động</b>: ban tổ chức chuẩn bị danh sách từ Excel (hoặc mở ghi danh tự do), chiếu mã QR lên màn hình, người tham dự quét mã và xác nhận trong vài giây — không cần cài app. Mã QR tự đổi liên tục chống điểm danh hộ từ xa; kết quả được thống kê và xuất Excel ngay khi kết thúc.</p>'
      + '<div class="feature-grid"><div class="feature">📱 <b>Không cần app</b><br>Quét bằng camera điện thoại</div><div class="feature">🔒 <b>Chống gian lận</b><br>QR động + ràng buộc thiết bị</div><div class="feature">📊 <b>Thống kê tức thì</b><br>Tỉ lệ tham gia, xuất Excel</div><div class="feature">📝 <b>2 hình thức</b><br>Theo danh sách / ghi danh tự do</div></div>'
      + '<h3>Bản quyền</h3><p>Ứng dụng được cung cấp <b>miễn phí</b> cho các đơn vị, tổ chức có nhu cầu điểm danh sự kiện.</p>'
      + '<h3>Tác giả &amp; liên hệ</h3><div class="contact-box"><div class="contact-name">Nguyễn Duy Hiếu</div><div>Liên hệ để được cấp tài khoản sử dụng giải pháp:</div><div>📞 Điện thoại / Zalo: <a href="tel:0972782203">0972782203</a></div><div>✉️ <a href="mailto:hieund@utb.edu.vn">hieund@utb.edu.vn</a> · <a href="mailto:hieu3210@gmail.com">hieu3210@gmail.com</a></div></div>',
    'guide.title': 'Hướng dẫn sử dụng',
    'guide.sub': 'Toàn bộ chức năng điểm danh trong 5 bước',
    'guide.body': '<h3><span class="step-n">1</span>Tạo phiên — chọn 1 trong 2 loại</h3><ul>'
      + '<li>Bấm <b>＋ Tạo phiên mới</b>, đặt tên sự kiện, chọn loại phiên; có thể đặt <b>thời gian tự kết thúc</b> và <b>chu kỳ đổi mã QR</b> riêng (hoặc mã cố định).</li>'
      + '<li><b>Theo danh sách đã có</b>: tải <b>template Excel</b>, điền danh sách, kéo-thả file — hoặc <b>chọn danh sách đã lưu</b>. Có thể <b>thêm / sửa / xoá</b> từng người và <b>lưu danh sách</b> để dùng lại. Khi tạo, chọn <b>trường bắt buộc để điểm danh</b> (VD chỉ cần SĐT) và có thể bật <b>ghi danh tự do</b>.</li>'
      + '<li><b>Không theo danh sách (ghi danh tự do)</b>: chọn các trường người tham dự cần điền, đánh dấu trường <b>bắt buộc</b>.</li></ul>'
      + '<h3><span class="step-n">2</span>Điểm danh bằng QR</h3><ul>'
      + '<li>Bấm <b>▶ Bắt đầu</b> rồi chiếu mã QR lên màn hình lớn; bộ đếm cập nhật trực tiếp.</li>'
      + '<li>Người tham dự quét mã → nhập thông tin điểm danh hoặc điền form ghi danh.</li>'
      + '<li>Mã QR tự đổi theo chu kỳ đã đặt; hết thời gian đã hẹn, phiên <b>tự kết thúc</b> và gửi email tổng hợp cho người tạo.</li></ul>'
      + '<h3><span class="step-n">3</span>Tích tay &amp; xử lý tình huống</h3><ul>'
      + '<li>Người không có điện thoại: tìm tên trong mục <b>Tích tay</b> và bấm <b>✓ Có mặt</b>; có thể <b>thêm người mới</b> ngay lúc đang điểm danh.</li>'
      + '<li>Lượt nghi vấn (một thiết bị điểm danh nhiều người) vào mục <b>⚠ Cần xác nhận</b> — hệ thống ghi rõ trùng với ai để bạn <b>Duyệt</b> hoặc <b>Từ chối</b>.</li></ul>'
      + '<h3><span class="step-n">4</span>Kết thúc &amp; thống kê</h3><ul>'
      + '<li>Bấm <b>⏹ Kết thúc</b> (hoặc để hệ thống tự kết thúc đúng giờ) → xem tỉ lệ tham gia, danh sách có mặt / vắng mặt.</li>'
      + '<li><b>▶ Mở lại phiên</b> để điểm danh tiếp và đặt lại giờ kết thúc; <b>⬇ Xuất Excel</b> tải kết quả.</li></ul>'
      + '<h3><span class="step-n">5</span>Quản trị hệ thống (quản trị viên)</h3><ul>'
      + '<li>Menu <b>Quản trị</b>: quản lý người dùng, cấu hình <b>trường danh sách</b>, <b>chu kỳ QR mặc định</b>, <b>SMTP</b> và <b>ngôn ngữ</b>.</li>'
      + '<li>Quên mật khẩu? Bấm <b>Quên mật khẩu</b> ở màn đăng nhập.</li></ul>',
  },
  en: {
    'app.name': 'TBit SmartID',
    'app.tagline': 'Smart event attendance',
    'nav.about': 'About',
    'nav.guide': 'Guide',
    'nav.admin': 'Admin',
    'nav.logout': 'Sign out',
    'nav.login': 'Sign in',
    'nav.back': '← Sessions',
    'footer.text': '© 2026 TBit SmartID - Smart attendance app. Developed by',

    'landing.eyebrow': 'Event attendance solution',
    'landing.title': 'Smart event attendance with <span class="accent">dynamic QR</span> codes',
    'landing.lead': 'TBit SmartID helps organizers take attendance quickly, accurately and fraud-resistant for conferences and large events — attendees just scan a QR code with their phone, no app needed.',
    'landing.loginBtn': 'Sign in',
    'landing.guideBtn': 'View guide',
    'landing.note': 'No account yet? <a href="#contact">Contact the author</a> to get access to the solution.',
    'landing.features.title': 'Why TBit SmartID?',
    'landing.features.sub': 'Simple for attendees, powerful for organizers.',
    'landing.f1.title': 'No app required', 'landing.f1.desc': 'Attendees scan the QR with their phone camera and confirm in seconds.',
    'landing.f2.title': 'Anti proxy check-in', 'landing.f2.desc': 'The QR rotates continuously, with device binding and rate limiting against fraud.',
    'landing.f3.title': 'Two modes', 'landing.f3.desc': 'Check in against a prepared list, or open self-registration for public events.',
    'landing.f4.title': 'Instant statistics', 'landing.f4.desc': 'Participation rate, present/absent lists and Excel export right when it ends.',
    'landing.f5.title': 'Auto-close & email', 'landing.f5.desc': 'Schedule a closing time; the system compiles and emails the results to you.',
    'landing.f6.title': 'Save & reuse', 'landing.f6.desc': 'Save attendee lists to reuse; add/edit members anytime.',
    'landing.steps.title': 'Just 3 steps',
    'landing.steps.sub': 'From preparation to reporting, all in one system.',
    'landing.s1.title': 'Prepare', 'landing.s1.desc': 'Create a session, import a list from Excel or open self-registration. Configure fields as needed.',
    'landing.s2.title': 'Check in', 'landing.s2.desc': 'Show the QR on screen; attendees scan and confirm. The counter updates live.',
    'landing.s3.title': 'Summarize', 'landing.s3.desc': 'Close the session to view statistics, export Excel and receive an automatic email report.',
    'landing.contact.title': 'Get an account to use the solution',
    'landing.contact.desc': 'Contact the author Nguyen Duy Hieu to get an account and deployment support.',

    'login.title': 'Sign in',
    'login.sub': 'TBit SmartID — Event attendance',
    'login.username': 'Username',
    'login.password': 'Password',
    'login.submit': 'Sign in',
    'login.forgot': 'Forgot password?',
    'login.forgotUser': 'Username or email',
    'login.forgotSubmit': 'Send link',
    'login.noAccount': 'No account? Contact Zalo 0972782203 or email hieund@utb.edu.vn',

    'cp.title': 'Change password',
    'cp.desc': 'You must change your password before using the system.',
    'cp.old': 'Current password',
    'cp.new': 'New password (at least 6 characters)',
    'cp.new2': 'Re-enter new password',
    'cp.submit': 'Update password',

    'sessions.title': 'Attendance sessions',
    'sessions.template': '⬇ Download Excel template',
    'sessions.new': '＋ New session',
    'sessions.empty': 'No attendance sessions yet.',
    'sessions.emptyHint': 'Click ＋ New session to start.',
    'sessions.present': 'Present',
    'sessions.registered': 'Registered',
    'sessions.noList': 'No list yet',
    'sessions.noReg': 'No registrations yet',

    'create.name': 'Event name',
    'create.namePh': 'e.g. Year-end conference 2026',
    'create.type': 'Session type',
    'create.typeList': 'From a prepared list',
    'create.typeListDesc': '— upload an Excel list, attendees scan QR to confirm presence',
    'create.typeOpen': 'Without a list (self-registration)',
    'create.typeOpenDesc': '— attendees scan QR and fill in their own registration details',
    'create.checkinBy': 'Check in by entering',
    'create.checkinByHint': '(choose ≥1 identifier field)',
    'create.allowOpen': 'Allow self-registration',
    'create.allowOpenDesc': '— people not on the list can still scan QR and self-register',
    'create.endsAt': 'Auto-close at',
    'create.optional': '(optional)',
    'create.qr': 'QR code',
    'create.qrDefault': 'Rotate per system default',
    'create.qrCustom': 'Rotate every N seconds…',
    'create.qrFixed': 'Fixed (no rotation)',
    'create.qrSeconds': 'Seconds (5–300)',
    'create.note': 'If you do not set an auto-close time, the session ends only when you press End. With a scheduled time, the system auto-closes and emails you a summary. A fixed QR is handy for printing but weakens anti-proxy protection.',
    'create.submit': 'Create session',
    'create.cancel': 'Cancel',

    'status.draft': 'Preparing',
    'status.open': 'In progress',
    'status.closed': 'Ended',
    'status.supplement': 'Supplementary',
    'badge.reg': 'Registration',
    'badge.hasReg': 'Self-reg on',
    'badge.walkin': 'Walk-in',

    'checkin.sub': 'Enter your details to confirm presence',
    'checkin.subOpen': 'Fill in your details to register for the event',
    'checkin.subWalkin': 'You are not on the list — fill in your details to register',
    'checkin.submit': '✓ Check in',
    'checkin.submitReg': '✓ Register',
    'checkin.processing': 'Processing…',
    'checkin.optional': '(optional)',
    'checkin.notInList': 'Not on the list?',
    'checkin.regHere': 'Register here »',
    'checkin.closedTitle': 'Session not open',
    'checkin.closedDesc': 'The session has not started or has ended. Please contact the organizer.',
    'checkin.notFound': 'Attendance session not found',
    'checkin.time': 'Time',

    'admin.title': 'System administration',
    'admin.sys.title': 'System settings',
    'admin.sys.qr': 'Default QR rotation period (seconds)',
    'admin.sys.qrHint': 'Applies to sessions without a custom period (5–300 seconds).',
    'admin.smtp.title': 'Email server (SMTP)',
    'admin.smtp.save': '💾 Save settings',
    'admin.smtp.testTo': 'Test recipient email',
    'admin.smtp.test': '✉ Send test email',
    'admin.fields.title': 'Attendance list fields',
    'admin.fields.colField': 'Field',
    'admin.fields.colInTemplate': 'In template',
    'admin.fields.colRequired': 'Required',
    'admin.fields.addPh': 'Add a custom field — e.g. Position',
    'admin.fields.add': '＋ Add field',
    'admin.fields.save': '💾 Save field config',
    'admin.fields.default': '↺ Reset to default',
    'admin.users.addTitle': 'Add user',
    'admin.users.listTitle': 'User list',
    'admin.users.fullName': 'Full name',
    'admin.users.email': 'Email',
    'admin.users.username': 'Username',
    'admin.users.initPass': 'Initial password',
    'admin.users.role': 'Role',
    'admin.users.roleUser': 'User',
    'admin.users.roleAdmin': 'Admin',
    'admin.users.add': '＋ Add',
    'admin.i18n.title': 'Language / Ngôn ngữ',
    'admin.i18n.desc': 'Edit interface labels per language. Leaving a box empty uses the default.',
    'admin.i18n.key': 'Key',
    'admin.i18n.save': '💾 Save translations',
    'admin.i18n.reset': '↺ Reset to default',

    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.close': 'Close',
    'common.delete': 'Delete',
    'common.edit': 'Edit',
    'common.search': 'Search…',

    'about.title': 'TBit SmartID',
    'about.sub': 'Smart event attendance app',
    'about.body': '<p><b>TBit SmartID</b> takes attendance for large events using a <b>dynamic QR code</b>: organizers prepare a list from Excel (or open self-registration), display the QR on screen, and attendees scan and confirm in seconds — no app needed. The QR rotates continuously to prevent remote proxy check-in; results are tallied and exported to Excel as soon as it ends.</p>'
      + '<div class="feature-grid"><div class="feature">📱 <b>No app</b><br>Scan with phone camera</div><div class="feature">🔒 <b>Anti-fraud</b><br>Dynamic QR + device binding</div><div class="feature">📊 <b>Instant stats</b><br>Participation rate, Excel export</div><div class="feature">📝 <b>Two modes</b><br>By list / self-registration</div></div>'
      + '<h3>License</h3><p>The app is provided <b>free</b> for organizations that need event attendance.</p>'
      + '<h3>Author &amp; contact</h3><div class="contact-box"><div class="contact-name">Nguyen Duy Hieu</div><div>Contact to get an account to use the solution:</div><div>📞 Phone / Zalo: <a href="tel:0972782203">0972782203</a></div><div>✉️ <a href="mailto:hieund@utb.edu.vn">hieund@utb.edu.vn</a> · <a href="mailto:hieu3210@gmail.com">hieu3210@gmail.com</a></div></div>',
    'guide.title': 'User guide',
    'guide.sub': 'All attendance features in 5 steps',
    'guide.body': '<h3><span class="step-n">1</span>Create a session — pick one of two types</h3><ul>'
      + '<li>Click <b>＋ New session</b>, name the event, choose the type; you can set an <b>auto-close time</b> and a custom <b>QR rotation period</b> (or a fixed code).</li>'
      + '<li><b>From a prepared list</b>: download the <b>Excel template</b>, fill in the list, drag-drop the file — or <b>pick a saved list</b>. You can <b>add / edit / delete</b> people and <b>save the list</b> to reuse. On creation, choose the <b>required check-in field(s)</b> (e.g. phone only) and optionally enable <b>self-registration</b>.</li>'
      + '<li><b>Without a list (self-registration)</b>: choose the fields attendees must fill and mark which are <b>required</b>.</li></ul>'
      + '<h3><span class="step-n">2</span>Check in with QR</h3><ul>'
      + '<li>Click <b>▶ Start</b> and display the QR on a big screen; the counter updates live.</li>'
      + '<li>Attendees scan the code → enter check-in details or fill the registration form.</li>'
      + '<li>The QR rotates per the set period; when the scheduled time is up, the session <b>auto-closes</b> and emails a summary to the creator.</li></ul>'
      + '<h3><span class="step-n">3</span>Manual check &amp; edge cases</h3><ul>'
      + '<li>For people without a phone: find their name under <b>Manual check</b> and click <b>✓ Present</b>; you can <b>add a new person</b> while checking in.</li>'
      + '<li>Suspicious taps (one device for many people) go to <b>⚠ Needs review</b> — the system shows whom it duplicates so you can <b>Approve</b> or <b>Reject</b>.</li></ul>'
      + '<h3><span class="step-n">4</span>Finish &amp; statistics</h3><ul>'
      + '<li>Click <b>⏹ End</b> (or let it auto-close on time) → view participation rate and present / absent lists.</li>'
      + '<li><b>▶ Reopen</b> to keep checking in and reset the end time; <b>⬇ Export Excel</b> to download results.</li></ul>'
      + '<h3><span class="step-n">5</span>Administration (admins)</h3><ul>'
      + '<li><b>Admin</b> menu: manage users, configure <b>list fields</b>, <b>default QR period</b>, <b>SMTP</b> and <b>language</b>.</li>'
      + '<li>Forgot password? Click <b>Forgot password</b> on the sign-in screen.</li></ul>',
  },
};

async function getOverrides() {
  try {
    const raw = await getSetting('i18n_overrides');
    const o = raw ? JSON.parse(raw) : {};
    return { vi: o.vi || {}, en: o.en || {} };
  } catch (e) { return { vi: {}, en: {} }; }
}

// Từ điển đã gộp (mặc định + ghi đè) cho một ngôn ngữ
async function dictFor(lang) {
  const l = LANGS.includes(lang) ? lang : 'vi';
  const ov = await getOverrides();
  return { ...DEFAULTS[l], ...(ov[l] || {}) };
}

async function saveOverrides(input) {
  const clean = { vi: {}, en: {} };
  for (const l of LANGS) {
    const src = (input && input[l]) || {};
    for (const [k, v] of Object.entries(src)) {
      const val = String(v == null ? '' : v).trim();
      // Chỉ lưu bản dịch khác mặc định để từ điển gọn
      if (val && val !== DEFAULTS[l][k]) clean[l][k] = val.slice(0, 2000);
    }
  }
  await setSetting('i18n_overrides', JSON.stringify(clean));
}

module.exports = { LANGS, DEFAULTS, dictFor, getOverrides, saveOverrides };
