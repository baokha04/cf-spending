# Chi tiêu gia đình

Ứng dụng ghi chép và theo dõi thu chi cho cả nhà, chạy trên Cloudflare Pages.

Mỗi giao dịch lưu **thời gian, nội dung, số tiền, chiều thu/chi**, và được phân loại
theo tính chất **hàng tháng** (cố định: tiền nhà, điện, học phí) hay **phát sinh**.
Dashboard so sánh trực tiếp tháng hiện tại với tháng trước. Nhiều tài khoản có thể
vào chung một hộ gia đình qua mã mời để thấy chung số liệu.

## Công nghệ

| Thành phần | Dùng gì |
|---|---|
| Giao diện | React 18 + Vite, biểu đồ Recharts, hỗ trợ giao diện sáng/tối |
| API | Pages Functions chạy Hono, gom vào một catch-all `functions/api/[[path]].ts` |
| Dữ liệu | Cloudflare D1 (SQLite) |
| Tìm kiếm ngữ nghĩa & hỏi đáp | Cloudflare Vectorize + Workers AI (`@cf/baai/bge-m3`, `@cf/meta/llama-3.3-70b-instruct-fp8-fast`) |
| Đăng nhập | Email + mật khẩu tự xây bằng Web Crypto, session lưu D1 |

## Cài đặt

```bash
npm install
```

### 1. Tạo cơ sở dữ liệu D1

```bash
npx wrangler d1 create cf-spending
```

Chép `database_id` in ra rồi thay vào `wrangler.jsonc` (chỗ `REPLACE_WITH_YOUR_D1_DATABASE_ID`).

```bash
npm run db:migrate:local   # áp migration cho bản local
npm run db:migrate         # áp migration cho bản trên Cloudflare
```

### 2. Tạo chỉ mục Vectorize

Số chiều phải là **1024** cho khớp với model `@cf/baai/bge-m3`. Hai chỉ mục metadata
là bắt buộc — không có chúng thì không lọc được theo hộ gia đình khi truy vấn.

```bash
npx wrangler vectorize create spending-tx --dimensions=1024 --metric=cosine
npx wrangler vectorize create-metadata-index spending-tx --property-name=household_id --type=string
npx wrangler vectorize create-metadata-index spending-tx --property-name=occurred_on  --type=string
```

## Phát triển cục bộ

Vectorize và Workers AI **không có bản mô phỏng local**. Tắt chúng đi để làm việc offline:

```bash
cp .dev.vars.example .dev.vars    # đặt AI_FEATURES=off
npm run build
npx wrangler pages dev            # http://localhost:8788
```

Khi `AI_FEATURES=off`, tìm kiếm tự rơi về khớp từ khoá trên nội dung giao dịch và giao
diện báo rõ điều đó; toàn bộ phần nhập liệu, danh mục và dashboard vẫn chạy đầy đủ.

Muốn vừa sửa giao diện vừa có hot reload thì chạy song song hai tiến trình
(`npm run dev` proxy `/api` sang cổng 8788):

```bash
npx wrangler pages dev   # cửa sổ 1
npm run dev              # cửa sổ 2 — http://localhost:5173
```

## Triển khai

```bash
npm run deploy
```

Trong dashboard Cloudflare Pages, gắn ba binding cho project: `DB` (D1), `VECTORIZE`
(chỉ mục `spending-tx`), `AI` (Workers AI), và biến `AI_FEATURES=on`.

## Kiểm thử

```bash
npm test        # Vitest chạy trên Workers runtime với D1 thật cục bộ
npm run build   # typecheck + build production
```

Bộ test phủ ba nhóm: xác thực và **cô lập dữ liệu giữa các hộ**, CRUD cùng kiểm tra
dữ liệu đầu vào, và độ chính xác của tổng hợp dashboard (gồm các mốc biên tháng,
năm nhuận, và trường hợp tháng trước rỗng).

## Cấu trúc

```
functions/api/[[path]].ts   Cửa ngõ Pages Function, chuyển tiếp cho Hono
migrations/                 Migration D1
src/server/
  app.ts                    Toàn bộ route
  auth.ts                   PBKDF2, session token
  middleware.ts             requireAuth, requireOwner, chặn CSRF
  dashboard.ts              Gộp số liệu hai tháng
  dates.ts                  Toán tháng trên chuỗi, tránh lệch múi giờ
  db/queries.ts             Mọi câu SQL
  ai/                       embed, tìm kiếm ngữ nghĩa, hỏi đáp RAG
src/client/                 React SPA
src/shared/types.ts         Kiểu dùng chung hai phía
```

## Vài quyết định đáng lưu ý

**Số tiền là số nguyên đồng.** VND không có đơn vị lẻ; dùng `INTEGER` nên cộng dồn
không bao giờ sai số như kiểu dấu phẩy động.

**Múi giờ.** Workers chạy UTC còn người dùng ở UTC+7. Mọi phép tính tháng thao tác
trực tiếp trên chuỗi `YYYY-MM-DD`, và "hôm nay" được tính theo giờ Việt Nam, nên
giao dịch ghi vào buổi tối ngày cuối tháng không bị rơi nhầm sang tháng sau.

**Cô lập dữ liệu.** Mọi hàm trong `db/queries.ts` nhận `householdId` làm tham số bắt
buộc và đưa vào `WHERE`. Kết quả từ Vectorize luôn được đối chiếu lại với D1 (cũng
lọc theo hộ) trước khi trả về, nên metadata cũ hay vector mồ côi không làm lộ dữ liệu.

**Mật khẩu và session.** PBKDF2-SHA256 100.000 vòng, salt riêng từng người, so sánh
hằng thời gian. Cookie chứa token ngẫu nhiên 32 byte còn database chỉ lưu SHA-256 của
token — lộ database cũng không dựng lại được cookie hợp lệ.

**Hàng đợi embedding.** Ghi vector chạy ngoài đường request chính (`waitUntil`) nên
lỗi mạng không làm hỏng thao tác của người dùng. Cột `transactions.embed_status` đóng
vai trò hàng đợi; `POST /api/admin/reindex` (nút "Đồng bộ chỉ mục" trên trang Hỏi đáp)
nhặt lại những giao dịch chưa đẩy được. Pages Functions không hỗ trợ Cron Trigger, nên
việc này chạy theo yêu cầu; muốn tự động thì cần tách một Worker riêng.

**Hỏi đáp không để mô hình tự cộng số.** Số liệu tổng hợp tính sẵn bằng SQL rồi mới
đưa vào prompt; mô hình chỉ diễn giải. Câu trả lời luôn kèm danh sách giao dịch nguồn
để người dùng đối chiếu.

**Màu biểu đồ.** Xanh là tháng hiện tại, cam là tháng trước — nhất quán ở cả bốn biểu
đồ. Cặp màu này đã qua kiểm tra tách biệt cho người mù màu trên cả nền sáng lẫn nền
tối. Chiều thu/chi do nhãn trục mang chứ không do màu, và mỗi biểu đồ đều có bảng số
liệu đi kèm.
