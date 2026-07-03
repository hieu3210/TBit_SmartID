# DEPLOY.md — Hướng dẫn triển khai TBit SmartID

Kiến trúc triển khai khuyến nghị: **GitHub → Vercel (ứng dụng) + Supabase (PostgreSQL)** — cả hai đều có gói miễn phí, tự động deploy mỗi lần push code.

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

---

## Phần 1 — Chuẩn bị Supabase (cơ sở dữ liệu)

1. Đăng nhập https://supabase.com/dashboard.
2. Dùng project có sẵn (VD **TBit's Project**) hoặc **New project**:
   - Nếu project đang ở trạng thái **Paused/Inactive** (gói free tự tạm dừng sau 1 tuần không dùng): mở project → bấm **Restore project** và chờ vài phút.
   - Nếu tạo mới: chọn region **Northeast Asia (Tokyo)** hoặc **Southeast Asia (Singapore)** cho gần Việt Nam, đặt **Database Password** mạnh và **lưu lại** (sẽ dùng ở bước sau).
3. Lấy chuỗi kết nối: vào **Project Settings → Database** (hoặc bấm nút **Connect** trên đầu trang) → mục **Connection string**:
   - Chọn tab **Transaction pooler** (cổng **6543**) — **bắt buộc dùng dạng này cho Vercel** (dạng Direct connection cổng 5432 chỉ có IPv6, Vercel không kết nối được).
   - Chuỗi có dạng:
     ```
     postgres://postgres.<project-ref>:<MẬT-KHẨU-DB>@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres
     ```
   - Thay `<MẬT-KHẨU-DB>` bằng mật khẩu đã đặt. Quên mật khẩu thì bấm **Reset database password** ngay trong trang đó.
4. **Không cần tạo bảng thủ công** — ứng dụng tự tạo schema (users, sessions, attendees) và tài khoản `admin/admin123` trong lần chạy đầu tiên.

## Phần 2 — Đưa code lên GitHub

Nếu đã có repo (VD `hieu3210/SmartID`) và muốn đổi tên theo thương hiệu mới:

1. Trên GitHub: vào repo → **Settings** → ô **Repository name** → đổi thành `TBit-SmartID` → **Rename**. (GitHub tự chuyển hướng URL cũ.)
2. Cập nhật remote trên máy:
   ```bash
   git remote set-url origin https://github.com/hieu3210/TBit-SmartID.git
   ```
3. Commit và push code:
   ```bash
   git add -A
   git commit -m "TBit SmartID v2: PostgreSQL/Supabase + Vercel"
   git push origin main
   ```

Nếu chưa có repo: tạo repo mới tên `TBit-SmartID` trên GitHub rồi `git remote add origin ...` và push như trên.

## Phần 3 — Deploy lên Vercel

1. Đăng nhập https://vercel.com (chọn **Continue with GitHub**).
2. Bấm **Add New… → Project** → **Import** repo `TBit-SmartID`.
3. Phần **Framework Preset** để nguyên **Other** (Vercel tự nhận `vercel.json` và thư mục `api/`). Không cần Build Command hay Output Directory.
4. Mở mục **Environment Variables**, thêm 2 biến (áp dụng cho Production, Preview, Development):

   | Tên | Giá trị |
   |---|---|
   | `DATABASE_URL` | Chuỗi kết nối **Transaction pooler** ở Phần 1 (đã điền mật khẩu) |
   | `SESSION_SECRET` | Một chuỗi ngẫu nhiên dài ≥ 32 ký tự — tạo bằng lệnh `openssl rand -hex 32` |

   > `SESSION_SECRET` là bắt buộc trên Vercel: nó ký cookie đăng nhập và mã QR động. Không đặt thì mỗi lần serverless khởi động lại, toàn bộ người dùng bị đăng xuất và QR đang chiếu bị vô hiệu.

5. Bấm **Deploy**, chờ ~1 phút. Vercel cấp URL dạng `https://tbit-smartid.vercel.app`.
6. Kiểm tra: mở URL → đăng nhập `admin` / `admin123` → hệ thống bắt đổi mật khẩu → tạo phiên thử, upload template, mở điểm danh, quét QR bằng điện thoại (mạng 4G bình thường vì đã chạy Internet + HTTPS).

Từ đây, **mỗi lần push lên nhánh `main` là Vercel tự deploy bản mới**; push nhánh khác sẽ tạo Preview deployment riêng.

### Tên miền riêng (tuỳ chọn)
Vercel → Project → **Settings → Domains** → thêm `diemdanh.tbit.vn` (hoặc tên miền của bạn) → trỏ bản ghi CNAME theo hướng dẫn hiển thị. HTTPS tự động. Không cần đặt `BASE_URL` — ứng dụng tự lấy domain từ request.

## Phần 4 — Chạy local để phát triển

Docker Compose đã kèm sẵn PostgreSQL, không cần cài gì thêm:

```bash
docker compose up -d --build   # http://localhost:3000, DB lưu trong volume pgdata
docker compose logs -f app     # xem log
docker compose down            # dừng (giữ dữ liệu); thêm -v để xoá sạch dữ liệu
```

Hoặc chạy Node trực tiếp, trỏ thẳng vào Supabase (dùng chung DB với production — cẩn thận):

```bash
DATABASE_URL="postgres://postgres.<ref>:<mật-khẩu>@aws-0-....pooler.supabase.com:6543/postgres" npm start
```

## Phần 5 — Vận hành

**Quên mật khẩu admin** (đặt lại về `admin/admin123`):
```bash
# chạy từ máy bạn, trỏ vào DB production:
DATABASE_URL="<chuỗi-kết-nối>" npm run reset-admin
# hoặc với bản Docker local:
docker exec tbit-smartid npm run reset-admin
```

**Sao lưu dữ liệu**: Supabase gói free tự backup hằng ngày (giữ 7 ngày). Muốn tự lưu thêm:
```bash
pg_dump "<chuỗi-kết-nối-direct-cổng-5432>" > backup_$(date +%Y%m%d).sql
```
Hoặc xuất Excel từng phiên ngay trong ứng dụng — dữ liệu nghiệp vụ quan trọng nhất đều nằm trong file xuất.

**Supabase free bị tạm dừng khi không dùng 1 tuần**: vào dashboard bấm **Restore project** (~2 phút). Với sự kiện quan trọng, hãy mở dashboard kiểm tra trước ngày diễn ra, hoặc nâng gói Pro để không bị tạm dừng.

## Phần 6 — Xử lý sự cố thường gặp

| Hiện tượng | Nguyên nhân & cách xử lý |
|---|---|
| Deploy xong, mở trang báo lỗi 500 | Thiếu/sai `DATABASE_URL`. Xem log: Vercel → Project → **Deployments → Runtime Logs**. Kiểm tra đã dùng chuỗi **pooler cổng 6543** và điền đúng mật khẩu |
| `ENETUNREACH` / timeout kết nối DB | Đang dùng Direct connection (cổng 5432, IPv6) — đổi sang **Transaction pooler 6543** |
| `password authentication failed` | Sai mật khẩu DB — reset trong Supabase → Settings → Database, cập nhật lại biến `DATABASE_URL` trên Vercel rồi **Redeploy** |
| Đăng nhập xong lại bị văng ra | Chưa đặt `SESSION_SECRET` trên Vercel (cookie bị vô hiệu sau mỗi cold start) |
| "Mã QR đã hết hạn" liên tục dù vừa quét | Đồng hồ máy chiếu QR lệch giờ nhiều, hoặc thiếu `SESSION_SECRET` làm mã đổi sau mỗi cold start |
| Project Supabase "Inactive" | Bấm **Restore project** trong dashboard, chờ vài phút |

## Ghi chú kỹ thuật cho môi trường serverless

- Phiên đăng nhập dùng **cookie ký (cookie-session)**, không lưu trạng thái trên server — tương thích serverless hoàn toàn.
- Schema tự tạo bằng `CREATE TABLE IF NOT EXISTS` ở lần khởi động đầu của mỗi instance — không cần migration thủ công.
- Rate-limit chống dò CCCD đếm theo từng instance function — trên serverless chỉ mang tính giảm thiểu; với sự kiện cần bảo mật cao hơn xem lộ trình ở [PLAN.md](PLAN.md) §7.
- Pool kết nối đặt nhỏ (`PG_POOL_MAX=3` mặc định) để hợp với Transaction pooler của Supabase.
