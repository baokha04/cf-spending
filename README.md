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
npm run cf:setup
```

`cf:setup` dựng hết phần Cloudflare và chạy lại được nhiều lần — mỗi bước kiểm tra
thứ đã có trước khi tạo, nên gọi lần hai không sinh tài nguyên trùng:

1. tạo `.dev.vars` từ `.dev.vars.example` (đặt `AI_FEATURES=off`) nếu chưa có;
2. tạo D1 `cf-spending` rồi ghi `database_id` vào `wrangler.jsonc` (không đè lên id
   đã điền sẵn — nếu khác thì chỉ báo lại);
3. tạo chỉ mục Vectorize `spending-tx` **1024 chiều, cosine** cùng hai chỉ mục
   metadata `household_id` và `occurred_on` (thiếu hai cái này là truy vấn không lọc
   được theo hộ);
4. tạo **project Pages** `cf-spending` với nhánh production là nhánh mặc định của repo;
5. áp migration cho D1 cục bộ.

| Tuỳ chọn | Tác dụng |
|---|---|
| `npm run cf:setup -- --local-only` | Chỉ chuẩn bị máy mình, không đụng tài khoản Cloudflare |
| `npm run cf:setup -- --remote` | Áp migration cho cả D1 trên Cloudflare |
| `npm run cf:setup -- --dry-run` | In những lệnh sẽ chạy rồi dừng |

Script cần `npx wrangler login` sẵn (hoặc `CLOUDFLARE_API_TOKEN` +
`CLOUDFLARE_ACCOUNT_ID`); chưa đăng nhập thì nó dừng và nhắc, trừ khi chạy `--local-only`.

<details>
<summary>Làm tay từng bước</summary>

```bash
npx wrangler d1 create cf-spending          # chép database_id vào wrangler.jsonc
npm run db:migrate:local                    # áp migration cho bản local
npm run db:migrate                          # áp migration cho bản trên Cloudflare

npx wrangler vectorize create spending-tx --dimensions=1024 --metric=cosine
npx wrangler vectorize create-metadata-index spending-tx --property-name=household_id --type=string
npx wrangler vectorize create-metadata-index spending-tx --property-name=occurred_on  --type=string

npx wrangler pages project create cf-spending --production-branch=dev

cp .dev.vars.example .dev.vars
```

</details>

## Phát triển cục bộ

Vectorize và Workers AI **không có bản mô phỏng local**. `cf:setup` đã đặt sẵn
`AI_FEATURES=off` trong `.dev.vars` để làm việc offline:

```bash
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

App chạy trên **Cloudflare Pages**, không phải Worker: API nằm ở `functions/api/[[path]].ts`
và chỉ Pages mới hiểu thư mục `functions/`. Loại project phải chọn đúng ngay từ đầu.

Deploy từ máy mình:

```bash
npm run deploy      # = npm run build && wrangler pages deploy
```

Deploy tự động mỗi lần push thì nối repo vào **project Pages** (Workers & Pages → Pages
→ Connect to Git), với:

| Thiết lập | Giá trị |
|---|---|
| Framework preset | None |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | (để trống) |

Rồi trong Settings của project Pages, gắn ba binding cho cả Production lẫn Preview:
`DB` (D1 `cf-spending`), `VECTORIZE` (chỉ mục `spending-tx`), `AI` (Workers AI), và biến
`AI_FEATURES=on`. Pages lấy binding từ dashboard chứ không đọc `wrangler.jsonc`, nên
`database_id` trong file đó chỉ phục vụ máy mình — không cần commit id thật.

### Build lỗi "Missing entry-point to Worker script or to assets directory"

Nghĩa là repo đang được deploy như một **Worker** (Workers Builds) chứ không phải Pages.
Workers Builds chạy `npx wrangler deploy`, mà lệnh đó đòi `main` hoặc `assets` trong
`wrangler.jsonc` — repo này cố tình không có, vì nó dùng `pages_build_output_dir`. Import
repo từ mục Workers trên dashboard là dính lỗi này.

Cách sửa: xoá project Worker vừa tạo, rồi tạo lại đúng loại Pages — `npm run cf:setup`
làm sẵn (hoặc `npx wrangler pages project create cf-spending`), sau đó vào project Pages
đó Connect to Git theo bảng trên.

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
scripts/cf-setup.mjs        Dựng D1 + Vectorize + .dev.vars (npm run cf:setup)
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
