# TBit SmartID — Ứng dụng điểm danh sự kiện bằng QR Code

Ứng dụng web đơn giản giúp điểm danh cho các sự kiện đông người:

- Chuẩn bị danh sách đại biểu bằng **template Excel** (STT, CCCD, Họ và tên, Đơn vị, Số điện thoại, Email).
- Người tham dự **quét QR Code** bằng camera điện thoại, nhập **CCCD + số điện thoại** để xác nhận **Có mặt** — không cần cài app.
- **Chống gian lận**: QR động tự đổi mỗi 30 giây (ảnh chụp gửi người vắng hết hạn ngay), ràng buộc thiết bị (một máy điểm danh cho nhiều người sẽ bị gắn cờ ⚠ chờ BTC duyệt), giới hạn tần suất chống dò CCCD.
- Kết thúc điểm danh xem ngay **thống kê tỉ lệ tham gia**, danh sách có mặt/vắng mặt, hỗ trợ **điểm danh bổ sung** và tích tay.
- Quản lý theo **phiên điểm danh**, dữ liệu lưu trữ lâu dài (PostgreSQL), **xuất Excel** kết quả.
- **Đăng nhập quản trị**: admin tạo và quản lý người dùng bằng username/password.

> - Kế hoạch phát triển, thiết kế, nghiên cứu chống gian lận: [PLAN.md](PLAN.md)
> - Hướng dẫn triển khai lên Internet (GitHub → Vercel + Supabase): [DEPLOY.md](DEPLOY.md)

---

## 1. Kiến trúc

```
Express (Node.js 20)
├── API JSON (đăng nhập, phiên, điểm danh, thống kê, xuất Excel)
├── Giao diện web tĩnh (HTML/CSS/JS thuần, mobile-first)
└── PostgreSQL (Supabase khi chạy cloud / container postgres khi chạy local)
```

| Thành phần | Công nghệ |
|---|---|
| Backend | Node.js 20, Express — chạy được cả server thường lẫn serverless (Vercel) |
| CSDL | PostgreSQL (`pg`) — Supabase (cloud) hoặc Docker (local) |
| Excel | SheetJS (`xlsx`) |
| QR Code | `qrcode` — QR động ký HMAC, đổi mỗi 30 giây |
| Đăng nhập | `cookie-session` (cookie ký, stateless) + `bcryptjs` |
| Frontend | HTML/CSS/JS thuần, không cần build |
| Triển khai | Vercel + Supabase (khuyến nghị) hoặc Docker Compose |

## 2. Chạy trên localhost bằng Docker

Yêu cầu: [Docker Desktop](https://www.docker.com/products/docker-desktop/). Compose đã kèm sẵn PostgreSQL.

```bash
git clone https://github.com/hieu3210/TBit-SmartID.git
cd TBit-SmartID
docker compose up -d --build
```

Mở **http://localhost:3000** — đăng nhập tài khoản mặc định:

- Username: `admin`
- Password: `admin123` (hệ thống **bắt buộc đổi mật khẩu** ngay lần đăng nhập đầu)

Dữ liệu PostgreSQL nằm trong Docker volume `pgdata` — dừng/khởi động lại không mất dữ liệu.

```bash
docker compose logs -f app    # xem log
docker compose down           # dừng (giữ dữ liệu); thêm -v nếu muốn xoá sạch
docker exec tbit-smartid npm run reset-admin   # quên mật khẩu admin
```

## 3. Triển khai lên Internet

Xem hướng dẫn từng bước trong **[DEPLOY.md](DEPLOY.md)**: đưa code lên GitHub, tạo database Supabase, import vào Vercel, cấu hình 2 biến môi trường là chạy — mỗi lần push code tự động deploy bản mới, HTTPS sẵn có nên đại biểu quét QR qua 4G bình thường.

### Cấu hình (biến môi trường)

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `DATABASE_URL` | Postgres local trong compose | Chuỗi kết nối PostgreSQL (Supabase dùng **Transaction pooler**, cổng 6543) |
| `SESSION_SECRET` | tự sinh mỗi lần chạy | **Bắt buộc đặt khi lên production** — ký cookie đăng nhập + mã QR động |
| `BASE_URL` | tự lấy theo request | Chỉ cần đặt khi chạy LAN (VD `http://192.168.1.10:3000`) |
| `QR_ROTATE_SECONDS` | `30` | Chu kỳ đổi mã QR động |
| `PORT` | `3000` | Cổng web (local/Docker) |

## 4. Hướng dẫn sử dụng

### 4.1. Quản trị viên (admin)
1. Đăng nhập → đổi mật khẩu bắt buộc lần đầu.
2. Vào **Quản lý người dùng** → tạo tài khoản cho người quản lý sự kiện (họ cũng phải đổi mật khẩu lần đầu).
3. Admin xem được mọi phiên điểm danh; có thể đặt lại mật khẩu, xoá người dùng.

### 4.2. Người quản lý sự kiện

**Bước 1 — Chuẩn bị danh sách**: bấm **Tải template Excel**, điền danh sách với các cột
`STT | CCCD | Họ và tên | Đơn vị | Số điện thoại | Email`.
Cột CCCD và SĐT để dạng **Text** (template đã định dạng dòng mẫu) để không mất số 0 đầu.

**Bước 2 — Tạo phiên & upload**: bấm **＋ Tạo phiên mới** → kéo-thả file Excel.
Hệ thống kiểm tra CCCD đủ 12 số, SĐT hợp lệ, không trùng — dòng lỗi được liệt kê rõ theo số dòng, các dòng hợp lệ vẫn được nhập. Upload lại file sẽ thay thế toàn bộ danh sách cũ.

**Bước 3 — Bắt đầu điểm danh**: bấm **▶ Bắt đầu điểm danh** → hiện **QR cỡ lớn** (chiếu lên màn chiếu). QR tự đổi mỗi 30 giây để chống điểm danh hộ từ xa; bộ đếm "Có mặt X/N" tự cập nhật.

**Bước 4 — Đại biểu điểm danh**: quét QR bằng camera → nhập **CCCD + SĐT** → màn hình xanh ✓ hiện tên và đơn vị. Mỗi người chỉ điểm danh được một lần; SĐT dạng `+84` hay `0` đều được nhận.

> Nếu một thiết bị điểm danh cho người thứ 2 trở đi, lượt đó bị gắn cờ ⚠ và hiện trong khu **"Cần xác nhận"** trên màn hình quản lý — BTC bấm **Duyệt** (hợp lệ, VD vợ chồng chung máy) hoặc **Từ chối** (trả về Vắng).

**Bước 5 — Kết thúc & thống kê**: bấm **⏹ Kết thúc điểm danh** → vòng tròn tỉ lệ %, số **có mặt/tổng số**, hai nút **Danh sách có mặt / vắng mặt** (kèm tìm kiếm). Nút **↻ Thống kê** tính lại số liệu mới nhất.

**Bước 6 — Điểm danh bổ sung**: bấm **＋ Điểm danh bổ sung** → QR mở lại cho người đến muộn; BTC cũng có thể **tích tay** trực tiếp trong danh sách (tìm theo tên/CCCD/đơn vị).

**Bước 7 — Xuất kết quả**: bấm **⬇ Xuất Excel** → file gồm sheet `DanhSach` (thêm cột *Trạng thái*, *Thời gian điểm danh*, *Hình thức*: QR/BTC xác nhận/Bổ sung) và sheet `ThongKe`. Dữ liệu phiên lưu vĩnh viễn, xuất lại bất cứ lúc nào.

## 5. Câu hỏi thường gặp

**Đại biểu báo "Mã QR đã hết hạn"?**
Họ đang mở link/ảnh QR cũ (quá ~1 phút). Yêu cầu quét lại mã đang hiển thị trên màn chiếu — đây chính là cơ chế chống điểm danh hộ từ xa.

**Đại biểu báo "Không có trong danh sách"?**
CCCD nhập không khớp file đã upload — kiểm tra thiếu người, sai số, hoặc mất số 0 đầu do định dạng ô Excel.

**Đại biểu báo "Số điện thoại không khớp"?**
SĐT trong danh sách khác số đại biểu nhập (`+84`/`0` đã được tự quy đổi). Dùng chức năng tích tay để xác nhận trực tiếp.

**Nhiều người quét cùng lúc có nghẽn không?**
Mỗi lượt điểm danh là vài truy vấn nhẹ trên PostgreSQL — vài trăm lượt trong vài phút không thành vấn đề; trên Vercel còn tự scale theo lượng truy cập.

**Quên mật khẩu admin?**
Xem mục Vận hành trong [DEPLOY.md](DEPLOY.md) — lệnh `npm run reset-admin` đặt lại về `admin/admin123`.

## 6. Cấu trúc mã nguồn

```
TBit-SmartID/
├── api/index.js             # Entry point serverless cho Vercel
├── vercel.json              # Định tuyến mọi request vào Express
├── server/
│   ├── app.js               # Express, cookie-session, khởi tạo DB; export app
│   ├── db.js                # Pool PostgreSQL, schema tự tạo, seed admin, giờ VN
│   ├── middleware.js        # requireAuth/requireAdmin, quyền sở hữu phiên, rate-limit
│   ├── reset-admin.js       # Đặt lại mật khẩu admin
│   ├── lib/
│   │   ├── secrets.js       # Dẫn xuất khoá ký cookie + QR từ SESSION_SECRET
│   │   ├── excel.js         # Template, parse upload, xuất kết quả
│   │   ├── qrtoken.js       # Mã QR động HMAC theo cửa sổ 30s
│   │   └── normalize.js     # Chuẩn hoá CCCD/SĐT
│   └── routes/
│       ├── auth.js          # Đăng nhập, đổi mật khẩu
│       ├── users.js         # CRUD người dùng (admin)
│       ├── sessions.js      # Phiên điểm danh, upload, QR, thống kê, xuất Excel
│       └── checkin.js       # API điểm danh công khai (chống gian lận Lớp 1)
├── public/                  # Giao diện: index / session / checkin / users
├── Dockerfile
├── docker-compose.yml       # app + postgres cho localhost
├── PLAN.md                  # Kế hoạch, thiết kế, checklist, nâng cấp
├── DEPLOY.md                # Hướng dẫn triển khai GitHub → Vercel + Supabase
└── README.md
```

## 7. Giấy phép

Xem [LICENSE](LICENSE).
