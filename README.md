# TBit SmartID — Ứng dụng điểm danh sự kiện bằng QR Code

## 1. Giới thiệu

**TBit SmartID** là ứng dụng web điểm danh cho các sự kiện đông người, phát triển bởi [TBit](https://tbit.vn):

- Hai loại phiên: **theo danh sách đã có** (đối chiếu danh sách Excel) và **không theo danh sách** (ghi danh tự do — người tham dự quét QR và tự điền thông tin theo các trường do người quản lý cấu hình, có đánh dấu trường bắt buộc).
- Chuẩn bị danh sách đại biểu bằng **template Excel** (STT, CCCD, Họ và tên, Đơn vị, Số điện thoại, Email). Admin có thể **cấu hình trường bổ sung** (VD: Chức vụ, Mã cán bộ) — trường bổ sung tự có trong template, bảng xem trước và file kết quả.
- Người tham dự **quét QR Code** bằng camera điện thoại, nhập **CCCD + số điện thoại** (hoặc điền form ghi danh) — không cần cài app.
- **Chống gian lận**: QR động tự đổi mỗi 10 giây (ảnh chụp gửi người vắng hết hạn ngay), ràng buộc thiết bị (một máy điểm danh cho nhiều người sẽ bị gắn cờ ⚠ chờ BTC duyệt), giới hạn tần suất chống dò CCCD.
- Kết thúc điểm danh xem ngay **thống kê tỉ lệ tham gia**, danh sách có mặt/vắng mặt, hỗ trợ **điểm danh bổ sung** và tích tay.
- Hẹn **giờ tự kết thúc** khi tạo phiên — hết giờ hệ thống tự đóng điểm danh và **gửi email tổng hợp** (kèm Excel) cho người tạo.
- **Lưu danh sách để dùng lại** giữa các phiên; **thêm/sửa/xoá thành viên thủ công** cả khi đang điểm danh (người đã điểm danh không sửa/xoá được).
- Chu kỳ đổi QR đặt được **theo phiên** (hoặc mã cố định để in giấy) và **mặc định toàn hệ thống**.
- Quản lý theo **phiên điểm danh**, dữ liệu lưu trữ lâu dài (PostgreSQL), **xuất Excel** kết quả.
- **Đăng nhập quản trị**: admin quản lý người dùng (họ tên, email, vai trò), cấu hình **SMTP** để hệ thống gửi email; người dùng **đặt lại mật khẩu qua email**.

Hướng dẫn sử dụng chi tiết cho ban tổ chức nằm ngay trong ứng dụng — menu **Hướng dẫn** trên thanh điều hướng. Kế hoạch phát triển, thiết kế, nghiên cứu chống gian lận: [PLAN.md](PLAN.md).

### Kiến trúc

```
Express (Node.js 20)
├── API JSON (đăng nhập, phiên, điểm danh, thống kê, xuất Excel)
├── Giao diện web tĩnh (HTML/CSS/JS thuần, mobile-first)
└── PostgreSQL (Supabase khi chạy cloud / container postgres khi chạy local)
```

| Thành phần | Công nghệ |
|---|---|
| Backend | Node.js 20, Express — chạy được cả server thường lẫn serverless (Vercel) |
| CSDL | PostgreSQL (`pg`) — Supabase (cloud) hoặc Docker (local/private server) |
| Excel | SheetJS (`xlsx`) |
| QR Code | `qrcode` — QR động ký HMAC, đổi mỗi 10 giây |
| Đăng nhập | `cookie-session` (cookie ký, stateless) + `bcryptjs` |
| Frontend | HTML/CSS/JS thuần, không cần bước build |

## 2. Triển khai trên localhost

Yêu cầu: [Docker Desktop](https://www.docker.com/products/docker-desktop/). Compose đã kèm sẵn PostgreSQL, không cần cài gì thêm.

```bash
git clone https://github.com/hieu3210/TBit_SmartID.git
cd TBit_SmartID
docker compose up -d --build
```

Mở **http://localhost:3000** — đăng nhập tài khoản mặc định:

- Username: `admin`
- Password: `admin123` (hệ thống **bắt buộc đổi mật khẩu** ngay lần đăng nhập đầu)

Dữ liệu PostgreSQL nằm trong Docker volume `pgdata` — dừng/khởi động lại không mất dữ liệu.

```bash
docker compose logs -f app                      # xem log
docker compose down                             # dừng (giữ dữ liệu); thêm -v nếu muốn xoá sạch
docker exec tbit-smartid npm run reset-admin    # quên mật khẩu admin → đặt lại admin/admin123
```

Muốn chạy Node trực tiếp (không qua Docker) thì cần PostgreSQL riêng và biến `DATABASE_URL`:

```bash
npm install
DATABASE_URL="postgres://tbit:tbit@localhost:5432/tbit_smartid" npm start
```

> Muốn cho điện thoại trong cùng mạng LAN quét QR khi chạy localhost: đặt thêm `BASE_URL` theo IP máy, VD `BASE_URL="http://192.168.1.10:3000"`.

## 3. Triển khai trên server

### Biến môi trường

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `DATABASE_URL` | Postgres local trong compose | Chuỗi kết nối PostgreSQL (Supabase dùng **Transaction pooler**, cổng 6543) |
| `SESSION_SECRET` | tự sinh mỗi lần chạy | **Bắt buộc đặt khi lên production** — ký cookie đăng nhập + mã QR động |
| `BASE_URL` | tự lấy theo request | Chỉ cần đặt khi URL trong QR khác địa chỉ server nhìn thấy (chạy LAN, sau proxy đặc biệt) |
| `QR_ROTATE_SECONDS` | `10` | Chu kỳ đổi mã QR động |
| `PORT` | `3000` | Cổng web (không áp dụng cho Vercel) |
| `PG_POOL_MAX` | `3` | Kích thước pool kết nối — để nhỏ cho hợp serverless + pooler Supabase |

### 3.1. Vercel + Supabase (khuyến nghị)

Cả hai đều có gói miễn phí; mỗi lần push code lên GitHub là tự động deploy, HTTPS sẵn có nên đại biểu quét QR qua 4G bình thường.

```
┌──────────┐  push   ┌────────┐  auto-deploy  ┌─────────────────┐
│ Máy bạn  │ ──────► │ GitHub │ ────────────► │ Vercel          │
└──────────┘         └────────┘               │ (Express        │
                                              │  serverless)    │
                                              └───────┬─────────┘
                                                      │ DATABASE_URL (SSL)
                                              ┌───────▼─────────┐
                                              │ Supabase        │
                                              │ PostgreSQL      │
                                              └─────────────────┘
```

**Bước 1 — Tạo database trên Supabase**

1. Đăng nhập https://supabase.com/dashboard → **New project** (hoặc dùng project có sẵn):
   - Chọn region **Northeast Asia (Tokyo)** hoặc **Southeast Asia (Singapore)** cho gần Việt Nam.
   - Đặt **Database Password** mạnh và **lưu lại**.
2. Lấy chuỗi kết nối: **Project Settings → Database** (hoặc nút **Connect**) → **Connection string**:
   - Chọn tab **Transaction pooler** (cổng **6543**) — **bắt buộc cho Vercel** (Direct connection cổng 5432 chỉ có IPv6, Vercel không kết nối được).
   - Chuỗi có dạng `postgres://postgres.<project-ref>:<MẬT-KHẨU-DB>@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres` — thay `<MẬT-KHẨU-DB>` bằng mật khẩu đã đặt.
3. **Không cần tạo bảng thủ công** — ứng dụng tự tạo schema và tài khoản `admin/admin123` trong lần chạy đầu.

**Bước 2 — Đưa code lên GitHub**: tạo repo (VD `TBit_SmartID`), `git remote add origin ...`, commit và push nhánh `main`.

**Bước 3 — Deploy lên Vercel**

1. Đăng nhập https://vercel.com (**Continue with GitHub**) → **Add New… → Project** → **Import** repo.
2. **Framework Preset** để nguyên **Other** (Vercel tự nhận `vercel.json` và thư mục `api/`). Không cần Build Command.
3. Thêm **Environment Variables** (áp dụng cho Production, Preview, Development):

   | Tên | Giá trị |
   |---|---|
   | `DATABASE_URL` | Chuỗi kết nối **Transaction pooler** ở Bước 1 |
   | `SESSION_SECRET` | Chuỗi ngẫu nhiên ≥ 32 ký tự — tạo bằng `openssl rand -hex 32` |

   > Không đặt `SESSION_SECRET` thì mỗi lần serverless cold start, toàn bộ người dùng bị đăng xuất và QR đang chiếu bị vô hiệu.

4. Bấm **Deploy**, chờ ~1 phút → Vercel cấp URL dạng `https://tbit-smartid.vercel.app`. Đăng nhập `admin/admin123`, đổi mật khẩu, tạo phiên thử và quét QR bằng điện thoại để kiểm tra.

Từ đây mỗi lần push lên `main` là Vercel tự deploy; push nhánh khác tạo Preview deployment riêng.

**Tên miền riêng (tuỳ chọn)**: Vercel → Project → **Settings → Domains** → thêm domain (VD `diemdanh.tbit.vn`) → trỏ CNAME theo hướng dẫn. HTTPS tự động, không cần đặt `BASE_URL`.

**Vận hành**

- *Quên mật khẩu admin*: `DATABASE_URL="<chuỗi-kết-nối>" npm run reset-admin` (chạy từ máy bạn, trỏ vào DB production) — đặt lại về `admin/admin123`.
- *Sao lưu*: Supabase gói free tự backup hằng ngày (giữ 7 ngày). Tự lưu thêm: `pg_dump "<chuỗi-kết-nối-direct-5432>" > backup.sql`, hoặc xuất Excel từng phiên ngay trong ứng dụng.
- *Supabase free tự tạm dừng sau 1 tuần không dùng*: vào dashboard bấm **Restore project** (~2 phút). Trước sự kiện quan trọng hãy kiểm tra trước, hoặc nâng gói Pro.

**Xử lý sự cố thường gặp**

| Hiện tượng | Nguyên nhân & cách xử lý |
|---|---|
| Deploy xong, mở trang báo lỗi 500 | Thiếu/sai `DATABASE_URL`. Xem Vercel → Deployments → **Runtime Logs**; kiểm tra dùng chuỗi **pooler cổng 6543**, đúng mật khẩu |
| `ENETUNREACH` / timeout kết nối DB | Đang dùng Direct connection (5432, IPv6) — đổi sang **Transaction pooler 6543** |
| `password authentication failed` | Sai mật khẩu DB — reset trong Supabase, cập nhật `DATABASE_URL` trên Vercel rồi **Redeploy** |
| Đăng nhập xong lại bị văng ra | Chưa đặt `SESSION_SECRET` (cookie vô hiệu sau mỗi cold start) |
| Đại biểu báo "Mã QR đã hết hạn" liên tục | Họ mở ảnh/link QR cũ (đây chính là cơ chế chống điểm danh hộ) — quét lại mã trên màn chiếu. Nếu ai quét cũng lỗi: server lệch giờ hoặc thiếu `SESSION_SECRET` |
| Đại biểu báo "Không có trong danh sách" | CCCD không khớp file đã upload — kiểm tra sai số hoặc mất số 0 đầu do định dạng ô Excel |

### 3.2. Private Server (VPS / máy chủ nội bộ)

Phù hợp khi đơn vị muốn giữ toàn bộ dữ liệu trên hạ tầng của mình. Yêu cầu: máy chủ Linux có Docker + Docker Compose.

**Cách 1 — Docker Compose (khuyến nghị)**

```bash
git clone https://github.com/hieu3210/TBit_SmartID.git
cd TBit_SmartID
```

Sửa `docker-compose.yml` trước khi chạy:

- `SESSION_SECRET`: thay bằng chuỗi ngẫu nhiên riêng (`openssl rand -hex 32`).
- Nên đổi `POSTGRES_PASSWORD` (và cập nhật tương ứng trong `DATABASE_URL`).

```bash
docker compose up -d --build
```

Ứng dụng chạy tại cổng 3000. Để có **HTTPS + tên miền** (cần thiết để đại biểu quét QR qua 4G), đặt một reverse proxy phía trước, VD Caddy:

```
# Caddyfile — Caddy tự xin và gia hạn chứng chỉ Let's Encrypt
diemdanh.example.vn {
    reverse_proxy localhost:3000
}
```

(Nginx + certbot tương đương.) Ứng dụng đã `trust proxy` nên tự nhận đúng domain từ request — không cần đặt `BASE_URL`.

Cập nhật phiên bản mới:

```bash
git pull
docker compose up -d --build     # dữ liệu trong volume pgdata được giữ nguyên
```

Sao lưu dữ liệu:

```bash
docker exec tbit-smartid-db pg_dump -U tbit tbit_smartid > backup_$(date +%Y%m%d).sql
```

**Cách 2 — Node.js trực tiếp**: cài Node.js 20 + PostgreSQL, rồi:

```bash
npm install --production
DATABASE_URL="postgres://user:pass@localhost:5432/tbit_smartid" \
SESSION_SECRET="<chuỗi-ngẫu-nhiên>" \
npm start
```

Chạy nền bằng `pm2 start server/app.js --name tbit-smartid` hoặc một service systemd; reverse proxy HTTPS như trên.

**Chạy trong mạng LAN không có tên miền** (hội trường không có Internet): đặt `BASE_URL` theo IP máy chủ (VD `http://192.168.1.10:3000`) để mã QR trỏ đúng địa chỉ điện thoại truy cập được; điện thoại đại biểu phải vào cùng Wi-Fi.

## 4. Cấu trúc mã nguồn

```
TBit_SmartID/
├── api/index.js             # Entry point serverless cho Vercel
├── vercel.json              # Định tuyến mọi request vào Express
├── server/
│   ├── app.js               # Express, cookie-session, khởi tạo DB; export app
│   ├── db.js                # Pool PostgreSQL, schema tự tạo, seed admin, bảng settings/saved_lists, giờ VN
│   ├── middleware.js        # requireAuth/requireAdmin, quyền sở hữu phiên (kèm tự kết thúc), rate-limit
│   ├── reset-admin.js       # Đặt lại mật khẩu admin
│   ├── lib/
│   │   ├── secrets.js       # Dẫn xuất khoá ký cookie + QR + token đặt lại mật khẩu từ SESSION_SECRET
│   │   ├── excel.js         # Template, parse upload, xuất kết quả (kèm trường bổ sung)
│   │   ├── fields.js        # Cấu hình trường Excel + trường form ghi danh tự do
│   │   ├── qrtoken.js       # Mã QR động HMAC (chu kỳ theo phiên, hỗ trợ mã cố định)
│   │   ├── sysconfig.js     # Thiết lập hệ thống: chu kỳ QR mặc định, SMTP
│   │   ├── mailer.js        # Gửi email qua SMTP (nodemailer)
│   │   ├── autoclose.js     # Tự kết thúc phiên hết giờ + email tổng hợp cho người tạo
│   │   └── normalize.js     # Chuẩn hoá CCCD/SĐT
│   └── routes/
│       ├── auth.js          # Đăng nhập, đổi mật khẩu, quên/đặt lại mật khẩu qua email
│       ├── users.js         # CRUD người dùng: họ tên, email, vai trò (admin)
│       ├── settings.js      # Trường Excel + thiết lập hệ thống (QR, SMTP, email thử)
│       ├── lists.js         # Danh sách đại biểu lưu sẵn để dùng lại
│       ├── sessions.js      # Phiên: upload, QR, thống kê, xuất Excel, CRUD thành viên, lưu/nạp danh sách
│       └── checkin.js       # API điểm danh/ghi danh công khai (chống gian lận Lớp 1)
├── public/                  # Giao diện tĩnh, không cần build
│   ├── index.html           # Đăng nhập (kèm quên mật khẩu) + danh sách phiên
│   ├── session.html         # Chi tiết phiên: danh sách, QR, tích tay, thống kê
│   ├── checkin.html         # Trang điểm danh/ghi danh của đại biểu (mở từ QR)
│   ├── users.html           # Trang Quản trị: người dùng, trường Excel, QR mặc định, SMTP
│   ├── reset.html           # Đặt lại mật khẩu từ link trong email
│   ├── img/logo.svg         # Logo + favicon
│   ├── css/style.css
│   └── js/
│       ├── api.js           # Hàm gọi API + tiện ích chung
│       └── shell.js         # Favicon, logo, footer, menu Giới thiệu/Hướng dẫn (chèn vào mọi trang)
├── Dockerfile
├── docker-compose.yml       # app + postgres cho localhost / private server
├── PLAN.md                  # Kế hoạch, thiết kế, checklist, nâng cấp
└── README.md
```

**Luồng dữ liệu chính**: `sessions` (phiên, token QR) → `attendees` (danh sách + trạng thái điểm danh, trường bổ sung trong cột JSONB `extra`) → bảng `settings` lưu cấu hình toàn hệ thống (key/value).

## 5. Hướng dẫn tiếp tục phát triển, phân phối mã nguồn

### Phát triển

- **Không có bước build**: frontend là HTML/CSS/JS thuần trong `public/`, sửa xong tải lại trang là thấy. Backend chạy `docker compose up -d --build` hoặc `npm start` với `DATABASE_URL` trỏ vào Postgres bất kỳ.
- **Schema tự migrate**: mọi thay đổi cấu trúc DB viết dạng `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` trong `SCHEMA` của [server/db.js](server/db.js) — chạy tự động ở lần khởi động đầu của mỗi instance, không cần công cụ migration.
- **Thêm API mới**: tạo router trong `server/routes/`, mount trong [server/app.js](server/app.js); dùng `requireAuth`/`requireAdmin`/`loadOwnedSession` từ [server/middleware.js](server/middleware.js) để kiểm soát quyền.
- **Thêm trang mới**: đặt file HTML trong `public/`, nhớ gắn `<script src="/js/api.js">` và `<script src="/js/shell.js">` để có sẵn hàm gọi API, footer và menu chung.
- **Quy ước**: chú thích trong code viết bằng tiếng Việt; escape mọi dữ liệu người dùng khi render bằng hàm `esc()`; thời gian hiển thị theo giờ Việt Nam qua `nowVN()`.
- Ý tưởng nâng cấp, thiết kế chống gian lận các lớp tiếp theo: xem [PLAN.md](PLAN.md).

### Phân phối mã nguồn

Dự án phát hành theo giấy phép **GNU GPL v3.0** — xem [LICENSE](LICENSE). Tóm tắt:

- Được tự do **sử dụng, sao chép, sửa đổi, phân phối**, kể cả cho mục đích thương mại.
- Khi phân phối bản gốc hoặc bản sửa đổi, phải **giữ nguyên giấy phép GPL-3.0** và **công khai mã nguồn** kèm theo.
- Không kèm bất kỳ bảo hành nào.

Ứng dụng được cung cấp **miễn phí** cho các đơn vị, tổ chức có nhu cầu điểm danh sự kiện.

**Tác giả**: Nguyễn Duy Hiếu — liên hệ tạo tài khoản hoặc trao đổi phát triển:
- Email: [hieund@utb.edu.vn](mailto:hieund@utb.edu.vn) / [hieu3210@gmail.com](mailto:hieu3210@gmail.com)
- Đóng góp code: mở Issue / Pull Request trên [GitHub](https://github.com/hieu3210/TBit_SmartID).
