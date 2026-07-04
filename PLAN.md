# PLAN.md — Kế hoạch xây dựng ứng dụng điểm danh sự kiện TBit SmartID

> **Cập nhật kiến trúc v2 (07/2026):** CSDL chuyển từ SQLite sang **PostgreSQL (Supabase)** để triển khai serverless trên Vercel; phiên đăng nhập chuyển sang cookie ký (stateless). Thiết kế SQLite ban đầu ở §3 giữ lại làm tư liệu — schema Postgres tương đương nằm trong `server/db.js`. Hướng dẫn triển khai: [README.md](README.md) §3.

> Ứng dụng web điểm danh cho sự kiện đông người bằng QR Code, xác thực bằng CCCD + số điện thoại, quản lý theo phiên, lưu trữ lâu dài, xuất Excel.

---

## 1. Mục tiêu & phạm vi

### Mục tiêu
- Người quản lý sự kiện chuẩn bị danh sách đại biểu bằng **template Excel**, upload vào hệ thống.
- Điểm danh nhanh, không cần cài app: người tham dự **quét QR Code** bằng camera điện thoại → mở trang web → nhập **CCCD + số điện thoại** → xác nhận **Có mặt**.
- Kết thúc điểm danh: hiển thị **thống kê** tỉ lệ tham gia, danh sách có mặt/vắng mặt.
- Hỗ trợ **điểm danh bổ sung** sau khi kết thúc.
- **Đăng nhập quản trị**, quản trị viên tạo/quản lý người dùng (username/password).
- **Quản lý phiên điểm danh**: dữ liệu lưu theo phiên, lưu trữ lâu dài, **xuất Excel**.

### Ngoài phạm vi (giai đoạn 1)
- Không đọc chip NFC CCCD, không OCR căn cước, không tích hợp VNeID — giai đoạn đầu nhập số CCCD thủ công; quét QR in trên thẻ CCCD được bổ sung ở chế độ quầy (§7.3, Giai đoạn 5).
- Không gửi email/SMS thông báo.
- Không cần HTTPS/hạ tầng phức tạp (chạy được trong mạng LAN sự kiện); có thể bổ sung sau.

---

## 2. Kiến trúc & công nghệ

Tiêu chí: **đơn giản nhất có thể**, một tiến trình duy nhất, không cần cài đặt CSDL riêng, dễ triển khai trên 1 laptop hoặc 1 VPS nhỏ.

| Thành phần | Lựa chọn | Lý do |
|---|---|---|
| Runtime | Node.js 20 + Express | Phổ biến, nhẹ, chạy được cả server thường lẫn serverless (Vercel) |
| CSDL | PostgreSQL — Supabase (cloud) / Docker (local) | Lưu trữ lâu dài, free tier, hợp serverless. (v1 dùng SQLite — xem ghi chú đầu tài liệu) |
| Đọc/xuất Excel | SheetJS (`xlsx`) hoặc `exceljs` | Đọc template upload, xuất báo cáo .xlsx |
| QR Code | thư viện `qrcode` (server-side) | Sinh QR trỏ tới URL trang điểm danh của phiên |
| Phiên đăng nhập | `express-session` + cookie, mật khẩu băm `bcryptjs` | Đơn giản, đủ an toàn |
| Frontend | HTML/CSS/JS thuần (không framework), mobile-first | Không build step, tải nhanh trên điện thoại người tham dự |
| Cập nhật màn hình quản lý | Polling 3–5 giây (hoặc SSE ở giai đoạn nâng cấp) | Đơn giản, đủ dùng |

### Sơ đồ tổng thể

```
┌─────────────────────┐        ┌──────────────────────────────┐
│ Điện thoại đại biểu │  QR →  │  Node.js + Express (1 process)│
│ /checkin/:token     │ ─────► │  ├─ API JSON                  │
└─────────────────────┘        │  ├─ Static HTML/CSS/JS        │
┌─────────────────────┐        │  └─ SQLite  data/smartid.db   │
│ Máy người quản lý   │ ─────► │                              │
│ /admin, /session/:id│        └──────────────────────────────┘
└─────────────────────┘
```

- Mỗi phiên điểm danh có một **token ngẫu nhiên** (không đoán được). QR Code = URL `http://<host>/checkin/<token>`.
- Đại biểu không cần tài khoản; xác thực bằng cặp **CCCD + SĐT khớp với danh sách đã upload**.

---

## 3. Thiết kế dữ liệu (SQLite)

```sql
users (
  id INTEGER PK,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',   -- 'admin' | 'user'
  created_at TEXT NOT NULL
)

sessions (            -- phiên điểm danh
  id INTEGER PK,
  name TEXT NOT NULL,                  -- tên sự kiện
  token TEXT UNIQUE NOT NULL,          -- dùng cho URL QR
  status TEXT NOT NULL DEFAULT 'draft',-- draft | open | closed | supplement
  owner_id INTEGER REFERENCES users(id),
  created_at TEXT, opened_at TEXT, closed_at TEXT
)

attendees (           -- danh sách điểm danh, import từ Excel
  id INTEGER PK,
  session_id INTEGER NOT NULL REFERENCES sessions(id),
  stt INTEGER,
  cccd TEXT NOT NULL,
  full_name TEXT NOT NULL,
  unit TEXT,            -- Đơn vị
  phone TEXT,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'absent',  -- 'present' | 'absent'
  checked_in_at TEXT,                     -- thời điểm điểm danh
  checkin_type TEXT,                      -- 'qr' | 'supplement'
  UNIQUE(session_id, cccd)
)
```

Vòng đời phiên: `draft` (mới tạo, upload danh sách) → `open` (đang điểm danh, QR hiển thị) → `closed` (đã kết thúc, xem thống kê) → `supplement` (mở điểm danh bổ sung) → `closed`.

---

## 4. Thiết kế API

| Method | Đường dẫn | Quyền | Mô tả |
|---|---|---|---|
| POST | `/api/login` | công khai | Đăng nhập, tạo session cookie |
| POST | `/api/logout` | đăng nhập | Đăng xuất |
| GET/POST/PUT/DELETE | `/api/users` | admin | CRUD người dùng |
| GET | `/api/template` | đăng nhập | Tải template Excel mẫu |
| POST | `/api/sessions` | đăng nhập | Tạo phiên điểm danh |
| GET | `/api/sessions` | đăng nhập | Danh sách phiên (của mình; admin thấy tất cả) |
| POST | `/api/sessions/:id/upload` | chủ phiên | Upload file Excel danh sách |
| POST | `/api/sessions/:id/open` | chủ phiên | Bắt đầu điểm danh (sinh QR) |
| POST | `/api/sessions/:id/close` | chủ phiên | Kết thúc điểm danh |
| POST | `/api/sessions/:id/supplement` | chủ phiên | Mở điểm danh bổ sung |
| GET | `/api/sessions/:id/stats` | chủ phiên | Thống kê: tổng số, có mặt, vắng, tỉ lệ % |
| GET | `/api/sessions/:id/attendees?status=` | chủ phiên | Danh sách chi tiết có mặt/vắng |
| GET | `/api/sessions/:id/export` | chủ phiên | Xuất Excel kết quả |
| GET | `/checkin/:token` | công khai | Trang điểm danh cho đại biểu |
| POST | `/api/checkin/:token` | công khai | Gửi CCCD + SĐT để điểm danh |

### Logic điểm danh (POST `/api/checkin/:token`)
1. Tìm phiên theo token; từ chối nếu status không phải `open`/`supplement`.
2. Chuẩn hoá input (bỏ khoảng trắng; SĐT chấp nhận cả `0xxx` và `+84xxx`).
3. Tìm attendee theo `cccd` trong phiên → nếu không có: báo "Không tìm thấy trong danh sách".
4. So khớp SĐT → sai: báo "Số điện thoại không khớp".
5. Nếu đã `present`: báo "Bạn đã điểm danh lúc HH:MM".
6. Cập nhật `status='present'`, `checked_in_at`, `checkin_type` → trả về màn hình chào mừng (tên + đơn vị).
7. Rate-limit theo IP để chống dò CCCD.

---

## 5. Thiết kế giao diện (UI/UX)

Nguyên tắc: **mobile-first, chữ to, ít thao tác, phản hồi tức thì, tiếng Việt**.

1. **Trang đăng nhập** — form đơn giản, thông báo lỗi rõ ràng.
2. **Trang danh sách phiên** — thẻ (card) mỗi phiên: tên, trạng thái (badge màu), số liệu nhanh; nút "＋ Tạo phiên mới".
3. **Trang chi tiết phiên** — thay đổi theo trạng thái:
   - `draft`: khu upload Excel (kéo-thả), nút tải template, bảng xem trước danh sách + báo lỗi từng dòng, nút **"Bắt đầu điểm danh"**.
   - `open`: **QR Code cỡ lớn toàn màn hình** (để chiếu lên màn chiếu), bộ đếm trực tiếp "Có mặt X / Tổng N" tự cập nhật, nút **"Kết thúc điểm danh"** (có xác nhận).
   - `closed`: **màn hình thống kê** — tỉ lệ % dạng vòng tròn, số có mặt/tổng số, hai nút **"Danh sách có mặt"** / **"Danh sách vắng mặt"**, nút **"Điểm danh bổ sung"**, nút **"Xuất Excel"**. Bấm "Thống kê" sẽ tính lại số liệu mới nhất.
   - `supplement`: như `open` nhưng có nhãn "Đang điểm danh bổ sung"; người quản lý cũng có thể tích tay từng người trong danh sách vắng.
4. **Trang điểm danh của đại biểu** (`/checkin/:token`) — chỉ 2 ô nhập (CCCD, SĐT) + 1 nút lớn "Điểm danh"; bàn phím số tự bật (`inputmode="numeric"`); thành công hiện màn hình xanh ✓ với tên + đơn vị; lỗi hiện thông báo đỏ dễ hiểu.
5. **Trang quản trị người dùng** (chỉ admin) — bảng người dùng, thêm/đổi mật khẩu/khoá.

---

## 6. Template Excel

File `template_diem_danh.xlsx`, sheet `DanhSach`, dòng 1 là tiêu đề:

| STT | CCCD | Họ và tên | Đơn vị | Số điện thoại | Email |
|---|---|---|---|---|---|
| 1 | 001099012345 | Nguyễn Văn A | Phòng Kế hoạch | 0912345678 | a@example.com |

Quy tắc import:
- Cột CCCD, SĐT ép về **text** (tránh Excel cắt số 0 đầu); khi đọc chuẩn hoá về chuỗi số.
- Bắt buộc: CCCD (12 số), Họ và tên. SĐT khuyến nghị bắt buộc (dùng để xác thực).
- Trùng CCCD trong file → báo lỗi kèm số dòng; dữ liệu lỗi không chặn toàn bộ, hiển thị để người dùng sửa.

File xuất kết quả = template + thêm cột: **Trạng thái** (Có mặt/Vắng), **Thời gian điểm danh**, **Hình thức** (QR/Bổ sung); kèm sheet `ThongKe` (tổng số, có mặt, vắng, tỉ lệ %).

---

## 7. Công nghệ chống gian lận điểm danh — nghiên cứu & phương án đề xuất

> Cập nhật 07/2026 — khảo sát các công nghệ điểm danh QR hiện đại nhằm chống **điểm danh hộ, điểm danh từ xa, dùng lại mã cũ**.

### 7.1. Các hình thức gian lận cần chống

1. **Điểm danh từ xa**: người có mặt chụp màn hình QR gửi cho người vắng, người vắng mở link và nhập hộ thông tin.
2. **Điểm danh hộ tại chỗ**: một người cầm danh sách CCCD + SĐT của nhiều người vắng, nhập lần lượt trên máy mình.
3. **Dùng lại mã cũ**: lưu link điểm danh của sự kiện trước để "điểm danh" mà không tới.
4. **Dò thông tin**: thử đại CCCD qua API công khai để lấy thông tin hoặc phá hoại.

### 7.2. Khảo sát công nghệ hiện nay

| Công nghệ | Cách hoạt động | Chống được | Phức tạp | Web thuần? |
|---|---|---|---|---|
| **QR động xoay vòng (TOTP/HMAC)** | QR trên màn chiếu tự đổi mỗi 20–60s, chứa mã ký HMAC theo thời gian; server chỉ nhận mã còn hạn | Điểm danh từ xa (ảnh QR gửi đi hết hạn sau <1 phút), dùng lại mã cũ | Thấp | ✅ |
| **Token một lần (one-time nonce)** | Mỗi lần QR đổi kèm nonce; mỗi nonce chỉ dùng được N lần/lượt | Chia sẻ hàng loạt 1 mã | Thấp | ✅ |
| **Ràng buộc thiết bị (device binding)** | Fingerprint trình duyệt + cookie/localStorage; 1 thiết bị chỉ điểm danh 1 người/phiên, vượt ngưỡng thì cảnh báo BTC | Điểm danh hộ tại chỗ (1 máy nhập nhiều người) | Thấp | ✅ (IMEI thật chỉ có trên app native) |
| **Geofencing GPS** | Browser Geolocation API, chỉ nhận check-in trong bán kính X m quanh hội trường | Điểm danh từ xa | Trung bình (xin quyền vị trí, GPS trong nhà kém, có thể giả lập) | ✅ |
| **Kiểm tra mạng nội bộ** | Chỉ nhận check-in từ dải IP Wi‑Fi hội trường (khi chạy LAN) | Điểm danh từ xa | Thấp | ✅ |
| **QR cá nhân ký số (reverse check-in)** | Mỗi đại biểu nhận QR riêng (ký HMAC) qua email; BTC quét tại cửa | Hầu hết gian lận (phải có mặt tại cửa) | Trung bình (cần gửi email, quầy quét) | ✅ |
| **Quét QR thẻ CCCD gắn chip** | Camera quầy đọc QR in trên thẻ CCCD (chứa số CCCD, họ tên, ngày sinh...), tự đối chiếu danh sách | Rất cao — cần thẻ vật lý, 2–3 giây/người, không nhập tay | Trung bình (thư viện html5-qrcode, cần quầy + camera) | ✅ |
| **OTP SMS/Zalo** | Gửi mã về SĐT đã đăng ký để xác nhận chính chủ | Nhập hộ SĐT người khác | Trung bình (tốn phí tin nhắn, phụ thuộc nhà mạng) | ✅ |
| **VNeID / định danh điện tử** | Đại biểu xuất trình QR định danh trên app VNeID, BTC quét đối chiếu | Rất cao (danh tính do Bộ Công an xác thực) | Cao (chưa có API công khai cho bên thứ ba; quét thủ công thì làm được) | Một phần |
| **Sinh trắc học khuôn mặt** | Đăng ký ảnh trước, so khớp khi check-in | Cao nhất | Cao (hạ tầng, quyền riêng tư, dữ liệu nhạy cảm) | Khó |
| **Phát hiện bất thường** | Cảnh báo: cùng IP/thiết bị nhập nhiều người, tần suất dồn dập, check-in sau khi rời vùng | Phát hiện sau, hỗ trợ đối soát | Thấp | ✅ |

Nghiên cứu thực nghiệm cho thấy kết hợp **QR động + geofencing + ràng buộc thiết bị** giảm tới ~97% gian lận điểm danh so với QR tĩnh, độ chính xác ~99%.

### 7.3. Phương án đề xuất cho SmartID — phòng thủ nhiều lớp

Nguyên tắc: vẫn giữ trải nghiệm "quét → nhập → xong" không cần cài app; các lớp bảo vệ mạnh dần và bật/tắt được **theo từng phiên**.

**Lớp 1 — Mặc định, luôn bật (giai đoạn 3):**
- **QR động**: QR trên màn chiếu tự làm mới mỗi **30 giây**, URL dạng `/checkin/<token>?c=<mã HMAC theo thời gian>`; server chấp nhận mã trong ±1 cửa sổ (≈60s). Ảnh chụp QR gửi ra ngoài hết giá trị gần như ngay lập tức.
- Xác thực **CCCD + SĐT** khớp danh sách (như thiết kế hiện tại).
- **Ràng buộc thiết bị**: mỗi thiết bị mặc định điểm danh tối đa 1 người/phiên; lượt thứ 2 trở đi bị đánh dấu ⚠ "cần BTC xác nhận" thay vì tự động Có mặt (vẫn cho phép trường hợp chính đáng: vợ chồng chung máy).
- **Rate-limit theo IP + nonce một lần** chống dò CCCD và spam.

**Lớp 2 — Tuỳ chọn theo phiên (bật khi tạo phiên):**
- **Geofence**: yêu cầu vị trí trình duyệt trong bán kính X mét (mặc định 200 m) quanh toạ độ hội trường; người từ chối chia sẻ vị trí sẽ chuyển sang trạng thái "chờ BTC duyệt".
- **Giới hạn mạng nội bộ**: khi chạy trong LAN hội trường, chỉ nhận check-in từ dải IP Wi‑Fi sự kiện.

**Lớp 3 — Chế độ quầy (kiosk) cho sự kiện cần chống gian lận cao:**
- Quầy check-in dùng **camera quét QR trên thẻ CCCD gắn chip** của đại biểu (thư viện `html5-qrcode`, chạy ngay trong trình duyệt): đọc chuỗi `số CCCD|họ tên|ngày sinh|...`, tự động đối chiếu danh sách và xác nhận Có mặt trong 2–3 giây, không cần nhập tay. Cần thẻ vật lý ⇒ loại bỏ điểm danh từ xa.
- Chế độ này dùng song song hoặc thay thế QR động tuỳ cấu hình phiên.

**Cấu hình gợi ý theo loại sự kiện:**

| Loại sự kiện | Lớp khuyến nghị |
|---|---|
| Họp nội bộ, tập huấn nhỏ | Lớp 1 |
| Hội nghị vài trăm người, có màn chiếu | Lớp 1 + Geofence |
| Sự kiện yêu cầu đối soát nghiêm (thi cử, bầu cử, chi trả chế độ) | Lớp 3 (quét thẻ CCCD tại quầy) + Lớp 1 cho luồng phụ |

**Định hướng tương lai (giữ ở mục nâng cấp):** tích hợp VNeID khi có API công khai, QR cá nhân gửi email, nhận diện khuôn mặt.

### 7.4. Ảnh hưởng tới thiết kế hiện tại

- API `POST /api/checkin/:token` thêm bước kiểm tra: mã thời gian `c` hợp lệ → nonce chưa vượt ngưỡng → device-id (cookie ký) chưa dùng quá 1 lượt → (nếu bật) toạ độ trong geofence.
- Bảng `sessions` thêm cột cấu hình: `qr_rotate_seconds`, `device_limit`, `geofence_lat/lng/radius`, `checkin_mode` (`qr` | `kiosk` | `both`).
- Bảng `attendees` thêm: `device_id`, `client_ip`, `geo_lat/lng`, `flag` (`ok` | `review`) phục vụ đối soát.
- Trang chi tiết phiên (`open`) thêm khu **"Cần xác nhận"** liệt kê các lượt bị gắn cờ ⚠ để BTC duyệt/từ chối tại chỗ.

---

## 8. Checklist triển khai

### Giai đoạn 0 — Khởi tạo dự án ✅
- [x] `npm init`, cài `express`, `better-sqlite3`, `express-session`, `bcryptjs`, `multer`, `xlsx`, `qrcode`
- [x] Cấu trúc thư mục: `server/` (app.js, db.js, routes/), `public/` (html, css, js), `data/` (db, gitignore)
- [x] Khởi tạo schema SQLite + seed tài khoản `admin` mặc định (bắt đổi mật khẩu lần đầu)
- [x] Đóng gói Docker: `Dockerfile` (2 stage) + `docker-compose.yml`, volume `./data`, múi giờ VN

### Giai đoạn 1 — Xác thực & quản trị người dùng ✅
- [x] API login/logout, middleware bảo vệ route, phân quyền admin/user
- [x] Trang đăng nhập + đổi mật khẩu bắt buộc lần đầu
- [x] CRUD người dùng (admin): tạo, đặt lại mật khẩu, xoá (chặn xoá khi còn sở hữu phiên)

### Giai đoạn 2 — Phiên điểm danh & import Excel ✅
- [x] Tạo template Excel + endpoint tải template
- [x] CRUD phiên điểm danh, trang danh sách phiên
- [x] Upload Excel: parse, validate (CCCD 12 số, trùng lặp, thiếu trường), xem trước, lưu attendees
- [x] Chuyển trạng thái phiên draft → open (sinh token + QR)

### Giai đoạn 3 — Điểm danh QR (kèm chống gian lận Lớp 1, xem §7.3) ✅
- [x] Trang QR toàn màn hình + bộ đếm tự cập nhật (polling 4s)
- [x] **QR động**: mã HMAC theo thời gian, tự làm mới mỗi 30s, server chấp nhận ±1 cửa sổ
- [x] Trang điểm danh đại biểu (mobile) + API check-in với đầy đủ thông báo lỗi
- [x] Chuẩn hoá CCCD/SĐT (+84 ↔ 0), chống điểm danh trùng, rate-limit theo IP
- [x] **Ràng buộc thiết bị**: cookie device-id ký, lượt thứ 2 trên cùng thiết bị gắn cờ ⚠ "cần BTC xác nhận"
- [x] Khu "Cần xác nhận" trên trang quản lý phiên để BTC duyệt/từ chối lượt bị gắn cờ

### Giai đoạn 4 — Thống kê, bổ sung, xuất Excel ✅
- [x] Nút "Kết thúc điểm danh" → màn hình thống kê (vòng tròn tỉ lệ %, có mặt/tổng)
- [x] Nút chi tiết danh sách Có mặt / Vắng mặt (tìm kiếm theo tên/CCCD/đơn vị)
- [x] Chức năng "Điểm danh bổ sung" (mở lại QR + tích tay) ; nút "Thống kê" cập nhật lại số liệu
- [x] Xuất Excel kết quả (sheet DanhSach + sheet ThongKe)

### Giai đoạn 5 — Chống gian lận nâng cao (tuỳ chọn theo phiên, xem §7.3)
- [ ] Cấu hình phiên: bật/tắt geofence, giới hạn thiết bị, chế độ check-in (`qr`/`kiosk`/`both`)
- [ ] **Geofence**: lấy vị trí qua Geolocation API, kiểm tra bán kính quanh toạ độ hội trường; từ chối chia sẻ → trạng thái "chờ duyệt"
- [ ] **Giới hạn mạng nội bộ**: chỉ nhận check-in từ dải IP Wi‑Fi hội trường (chế độ LAN)
- [ ] **Chế độ quầy (kiosk)**: quét QR trên thẻ CCCD gắn chip bằng camera trình duyệt (`html5-qrcode`), parse và đối chiếu danh sách tự động
- [ ] Ghi nhận `device_id`, `client_ip`, toạ độ vào attendees phục vụ đối soát; báo cáo bất thường (1 IP/thiết bị nhiều lượt)

### Giai đoạn 7 — Triển khai cloud (GitHub → Vercel + Supabase) ✅
- [x] Chuyển CSDL sang PostgreSQL (`pg`, pool nhỏ hợp pooler Supabase), schema tự tạo khi khởi động
- [x] Phiên đăng nhập stateless bằng `cookie-session`; khoá ký dẫn xuất từ `SESSION_SECRET`
- [x] Entry serverless `api/index.js` + `vercel.json`; Docker compose kèm Postgres cho local
- [x] Đổi thương hiệu **TBit SmartID** (giao diện, package, tài liệu)
- [x] Viết hướng dẫn triển khai (nay ở [README.md](README.md) §3): Supabase → GitHub → Vercel, biến môi trường, sự cố thường gặp

### Giai đoạn 6 — Hoàn thiện & kiểm thử
- [ ] Rà soát UI/UX trên điện thoại thật (iOS/Android, mạng yếu)
- [ ] Kiểm thử tải: 200–500 người quét trong vài phút
- [ ] Viết README, hướng dẫn triển khai LAN + VPS
- [ ] Backup: script copy `data/smartid.db` theo ngày

## 9. Kế hoạch nâng cấp sau này

- [ ] **HTTPS + tên miền** khi triển khai công khai (Caddy/Nginx reverse proxy, Let's Encrypt) — bắt buộc nếu dùng Geolocation API qua Internet
- [ ] **SSE/WebSocket** thay polling để bộ đếm cập nhật tức thì
- [ ] **Check-in bằng quét QR cá nhân ký HMAC**: phát QR riêng từng đại biểu qua email, BTC quét ngược lại tại cửa (reverse check-in)
- [ ] Tích hợp **VNeID** khi có API công khai cho bên thứ ba; **đọc chip NFC CCCD** hoặc OCR căn cước để xác thực mạnh hơn
- [ ] **Nhận diện khuôn mặt** cho sự kiện yêu cầu đối soát nghiêm ngặt nhất (cân nhắc quyền riêng tư, lưu trữ dữ liệu sinh trắc)
- [ ] **OTP SMS/Zalo** xác nhận chính chủ số điện thoại (phát sinh chi phí tin nhắn)
- [ ] **Dashboard phát hiện bất thường**: cảnh báo thời gian thực cùng IP/thiết bị nhập nhiều người, tần suất dồn dập
- [ ] Điểm danh **ra/vào nhiều lần**, nhiều mốc thời gian trong một sự kiện dài
- [ ] **Đa sự kiện đồng thời**, phân nhóm đại biểu, sơ đồ chỗ ngồi
- [ ] Gửi **email/SMS** xác nhận tham dự, nhắc lịch
- [ ] Dashboard tổng hợp nhiều phiên, biểu đồ theo đơn vị
- [ ] Đóng gói **Docker** / bản chạy offline một file (pkg/Electron) cho hội trường không Internet
- [ ] Nhật ký hoạt động (audit log), khôi phục phiên đã xoá

## 10. Rủi ro & phương án

| Rủi ro | Phương án |
|---|---|
| Excel sai định dạng, mất số 0 đầu CCCD/SĐT | Ép cột text trong template, chuẩn hoá khi đọc, báo lỗi từng dòng |
| Điểm danh từ xa (ảnh QR gửi cho người vắng) | QR động 30s (Lớp 1); geofence/giới hạn mạng nội bộ (Lớp 2) — xem §7 |
| Điểm danh hộ tại chỗ (1 máy nhập nhiều người) | Ràng buộc thiết bị + gắn cờ ⚠ chờ BTC duyệt; sự kiện nghiêm ngặt dùng quầy quét thẻ CCCD (Lớp 3) |
| Geofence gây phiền (từ chối chia sẻ vị trí, GPS trong nhà kém) | Không chặn cứng — chuyển "chờ BTC duyệt"; chỉ bật cho phiên cần thiết |
| Dò CCCD qua API công khai | Yêu cầu khớp cả SĐT + rate-limit + nonce một lần + token phiên khó đoán |
| Nghẽn khi hàng trăm người quét cùng lúc | SQLite WAL mode, API check-in nhẹ (1 UPDATE), kiểm thử tải trước |
| Mất dữ liệu | DB là 1 file → backup tự động hằng ngày, trước/sau mỗi sự kiện |
