# Chi tiêu gia đình

Ứng dụng ghi chép và theo dõi thu chi cho cả nhà, chạy trên Cloudflare Pages.

Mỗi giao dịch lưu **thời gian, nội dung, số tiền, chiều thu/chi**, và được phân loại
theo tính chất **hàng tháng** (cố định: tiền nhà, điện, học phí) hay **phát sinh**.
Riêng những khoản đáng nhớ còn ghi thêm được **chi tiết, bên nhận/nguồn tiền và hình
thức thanh toán**. Dashboard so sánh trực tiếp tháng hiện tại với tháng trước, còn
trang **Khoản lớn** gom các khoản thu/chi vượt ngưỡng để soi kỹ từng khoản. Nhiều tài
khoản có thể vào chung một hộ gia đình qua mã mời để thấy chung số liệu.

## Các trang

| Trang | Làm gì |
|---|---|
| Tổng quan | KPI và bốn biểu đồ, tháng này so với tháng trước |
| Giao dịch | Nhập, sửa, sao chép, lọc, tìm theo từ khoá; mỗi dòng mở ra được phần chi tiết. Dòng đã xoá vẫn nằm đó ở dạng gạch ngang và khôi phục lại được |
| Khoản lớn | Thu/chi vượt ngưỡng trong tháng, tỷ trọng từng khoản, bổ sung chi tiết tại chỗ |
| Danh mục | Thêm, **sửa tên và biểu tượng**, lưu trữ hoặc xoá danh mục |
| Hỏi đáp | Tìm kiếm ngữ nghĩa và hỏi đáp RAG trên dữ liệu của hộ |
| Hộ gia đình | Thành viên và mã mời |

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
và chỉ Pages mới hiểu thư mục `functions/`.

Một lần duy nhất, chuẩn bị project Pages:

1. `npm run cf:setup` tạo project Pages `cf-spending` (nhánh production `dev`).
2. `npm run db:migrate` áp schema cho D1 trên Cloudflare (`cf:setup` chỉ chạy bản local).

Mỗi lần repo có thêm file trong `migrations/` thì chạy lại `npm run db:migrate`
(và `npm run db:migrate:local` cho bản cục bộ) trước khi deploy — deploy không tự áp
migration.

`wrangler pages deploy` đẩy luôn binding lấy từ `wrangler.jsonc` vào cấu hình
Production của project, nên **không phải gắn tay `DB`/`VECTORIZE`/`AI` trong dashboard**
— sau lần deploy đầu, Settings của project đã có sẵn cả ba binding lẫn biến
`AI_FEATURES=on`. Đổi lại, `database_id` thật **phải** nằm trong `wrangler.jsonc` và
được commit: thiếu nó thì bản deploy lên production trỏ vào một D1 không tồn tại.
Id này không phải bí mật — nó vô dụng nếu không có API token.

Riêng môi trường **Preview** thì `wrangler pages deploy --branch=<nhánh khác>` mới
điền binding; chừng nào chưa deploy preview lần nào, phần Preview trong Settings vẫn
trống và các bản preview sẽ hỏng khi chạm `env.DB`.

Deploy tay:

```bash
npm run deploy      # = npm run build && wrangler pages deploy
```

Deploy tự động: `.github/workflows/deploy.yml` chạy mỗi lần push lên `dev` (và chạy tay
được qua Actions → Deploy Pages). Nó cài dependency, chạy test, build, tạo project Pages
nếu chưa có, rồi `wrangler pages deploy`. Thêm hai secret trong repo (Settings → Secrets and variables →
Actions):

| Secret | Lấy ở đâu |
|---|---|
| `CLOUDFLARE_API_TOKEN` | My Profile → API Tokens → Create Token, quyền **Cloudflare Pages: Edit** |
| `CLOUDFLARE_ACCOUNT_ID` | Trang chủ dashboard, cột bên phải |

Phải là **repository secret**, không phải environment secret: đặt nhầm chỗ thì workflow
vẫn chạy nhưng hai biến rỗng và wrangler báo `Not logged in`.

Token chỉ có `Cloudflare Pages: Edit` là đủ cho workflow deploy. Nhưng nếu định chạy
`npm run cf:setup` hay `npm run db:migrate` bằng token đó thì cần thêm **D1: Edit** và
**Vectorize: Edit**. Vừa sửa quyền cho một token xong, Cloudflare mất vài phút để lan
truyền — trong lúc đó cùng một lệnh có thể lúc chạy được lúc báo
`Authentication error [code: 10000]`; cứ thử lại là qua.

Cố tình không dùng Connect to Git của dashboard — xem mục dưới.

### Build trên Cloudflare báo lỗi ở bước deploy

Hai câu lỗi dưới đây đều nói cùng một chuyện: repo đang được deploy như một **Worker**
(Workers Builds), mà Workers Builds chạy `npx wrangler deploy` — lệnh của Worker, không
phải của Pages.

| Lỗi | Nghĩa là |
|---|---|
| `Missing entry-point to Worker script or to assets directory` | `wrangler deploy` không thấy `wrangler.jsonc` (sai Root directory), nên đòi `main`/`assets` |
| `It looks like you've run a Workers-specific command in a Pages project` | `wrangler deploy` đã đọc được `wrangler.jsonc` và thấy đây là project Pages |

Sửa Deploy command của Workers Build cũng không cứu được: một Workers Build gắn với một
Worker, còn repo này cần project Pages. Xoá Worker đã import đi (Workers & Pages → chọn
Worker → Settings → Delete) rồi để GitHub Actions ở trên deploy — đường đó không đụng tới
Connect to Git nên không bao giờ dựng nhầm Workers Build nữa.

Muốn dùng Git integration của Cloudflare thì phải bấm Connect to Git **từ bên trong
project Pages** (không phải import repo ở mục Workers), với Framework preset None, build
command `npm run build`, output directory `dist`, root directory để trống — và khi đó nên
tắt workflow GitHub Actions cho khỏi deploy hai lần.

## Kiểm thử

```bash
npm test        # Vitest chạy trên Workers runtime với D1 thật cục bộ
npm run build   # typecheck + build production
```

Bộ test phủ sáu nhóm: xác thực và **cô lập dữ liệu giữa các hộ**, CRUD cùng kiểm tra
dữ liệu đầu vào, độ chính xác của tổng hợp dashboard (gồm các mốc biên tháng, năm
nhuận, và trường hợp tháng trước rỗng), chỉnh sửa danh mục (kể cả đổi tên trùng),
phần chi tiết giao dịch cùng báo cáo khoản lớn, và xoá mềm — khôi phục cùng việc
giao dịch đã xoá không lọt vào bất kỳ số liệu tổng hợp nào.

## Cấu trúc

```
functions/api/[[path]].ts   Cửa ngõ Pages Function, chuyển tiếp cho Hono
scripts/cf-setup.mjs        Dựng D1 + Vectorize + Pages project (npm run cf:setup)
.github/workflows/          CI deploy lên Pages khi push nhánh dev
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

**Xoá giao dịch chỉ là xoá mềm.** Không có đường nào xoá hẳn một giao dịch: `DELETE`
đặt `deleted_at` rồi thôi. Bản ghi biến khỏi mọi số liệu (dashboard, khoản lớn, tìm
kiếm — vector cũng bị gỡ khỏi Vectorize) nhưng vẫn nằm trong danh sách ở dạng gạch
ngang, kèm nút **Khôi phục** đưa nó trở lại và đẩy vector lại. Ghi nhầm rồi xoá nhầm
là chuyện thường ở sổ chi tiêu chung của cả nhà, nên nút xoá không được phép là thao
tác một chiều. Bỏ tick "Hiện giao dịch đã xoá" nếu muốn danh sách gọn lại.

**Sao chép giao dịch.** Nút *Sao chép* điền sẵn form bằng đúng nội dung, số tiền,
danh mục và cả phần chi tiết của một giao dịch cũ, chỉ đổi ngày thành hôm nay, rồi
lưu thành bản ghi **mới**. Tiền chợ, đổ xăng, tiền học thêm lặp lại gần như nguyên
văn hàng tuần — gõ lại từ đầu mỗi lần là chỗ dễ bỏ sót nhất.

**Khoản lớn tách riêng khỏi danh sách giao dịch.** Một khoản 12 triệu và một khoản
30 nghìn cần mức ghi chép khác hẳn nhau. Form nhập tự mở phần chi tiết khi số tiền từ
1 triệu trở lên, còn trang Khoản lớn lọc theo ngưỡng do người dùng chọn, xếp theo số
tiền giảm dần, kèm tỷ trọng trên tổng tháng và đánh dấu khoản chưa ghi chi tiết. Ba
cột mới (`detail`, `payee`, `payment_method`) đều `NOT NULL DEFAULT ''` nên dữ liệu cũ
không phải backfill; phần chi tiết cũng vào luôn văn bản embedding và bộ lọc từ khoá.

**Sửa danh mục không đụng vào giao dịch.** Đổi tên hay biểu tượng chỉ ghi lại hàng
`categories`, mọi giao dịch vẫn trỏ theo `category_id` nên lịch sử giữ nguyên. Loại
thu/chi thì không cho đổi — đổi rồi thì các giao dịch cũ sẽ lệch chiều. Đổi sang tên
đã có trong cùng loại trả về 409 thay vì lỗi 500 từ ràng buộc UNIQUE.

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
