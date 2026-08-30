# Quản lý lịch hoạt động của thành viên trong gia đình

## Context

`cf-spending` hiện chỉ theo dõi tiền: giao dịch, danh mục, khoản lớn, hỏi đáp RAG.
Nhưng "hộ gia đình" trong app mới chỉ là **tài khoản đăng nhập** (`memberships`) —
không có chỗ nào ghi được người trong nhà không có tài khoản (con nhỏ, ông bà), và
hoàn toàn không có chỗ ghi *ai bận lúc nào*.

Việc cần làm là thêm một mảng thứ hai, độc lập với tiền:

1. **Danh mục thành viên trong gia đình** — bảng riêng, thêm được cả người không có
   tài khoản.
2. **Lịch hoạt động** — lịch đi làm / đi dạy / đi học của từng thành viên, khai theo
   khuôn mẫu **lặp hàng tuần** (có ngày hiệu lực từ–đến) và chia nhỏ **theo giờ**,
   kèm **ngoại lệ** cho từng buổi (nghỉ một buổi, dời giờ/dời ngày một buổi).
3. **Dashboard calendar** — lưới **tuần trục giờ** (mặc định) và lưới **tháng tổng
   quan**, mỗi thành viên một màu, lọc theo thành viên và loại hoạt động.

Bốn quyết định đã chốt với người dùng, plan này bám theo:
- Thành viên là **bảng riêng** (`family_members`), *không* đồng bộ tự động với user.
- Lặp **theo tuần + ngoại lệ**, không làm RRULE, không lặp theo ngày trong tháng.
- **Không dính tới thu/chi** — không ước tính tiền, không tự sinh giao dịch.
- Calendar: **Tuần theo giờ + Tháng tổng quan**.

Kết quả mong muốn: mở app, bấm tab **Lịch**, thấy ngay tuần này ai đi làm/đi dạy/đi
học giờ nào, chồng lớp thấy rõ khoảng trống chung của cả nhà.

---

## Nguyên tắc bám theo codebase

| Quy ước sẵn có | Nguồn |
|---|---|
| Mốc thời gian hệ thống = epoch ms INTEGER; ngày = TEXT `'YYYY-MM-DD'` | `migrations/0001_init.sql:2` |
| Khoá chính TEXT uuid qua `newId()` | `src/server/ids.ts:3` |
| Toán ngày/tháng làm trên **chuỗi**, không đi qua `Date` local (Workers chạy UTC, người dùng UTC+7) | `src/server/dates.ts:1-5` |
| Xoá luôn là **xoá mềm** `deleted_at`, khôi phục được | `src/server/app.ts:482-495` |
| Lỗi trả `c.json({ error: 'câu tiếng Việt' }, status)`; zod gom bằng `formatZodError` | `src/server/validators.ts:129-132` |
| Route gom trong một Hono app, chia bằng banner `/* ==== tên ==== */` | `src/server/app.ts:80,221,255,345,513` |
| Trang CRUD mẫu: `useState`/`useEffect` thuần, `load()` useCallback, `error`/`notice`, `window.confirm` | `src/client/pages/Categories.tsx` |
| **Danh tính không bao giờ chỉ dựa vào màu** — luôn kèm nhãn/legend | `src/client/components/viz.tsx:1-8,22` |
| Điện thoại: `--tap: 44px`, breakpoint 720px, `useIsPhone()` | `src/client/styles.css:611`, `src/client/lib/use-media-query.ts:28` |

Không cần đụng `scripts/cf-setup.mjs` (nó chạy `wrangler d1 migrations apply` chung,
`scripts/cf-setup.mjs:134,279`) và không cần tài nguyên Cloudflare mới.

**Không** đưa lịch vào Vectorize/RAG — đây là non-goal có chủ ý, ghi rõ trong commit.

---

## 1. Dữ liệu — `migrations/0004_family_schedule.sql`

Một migration duy nhất, ba bảng, theo đúng phong cách header tiếng Việt của 0001–0003.

```sql
-- Migration 0004: thành viên trong nhà và lịch hoạt động của họ.
--
-- Mảng này tách hẳn khỏi thu/chi: không có cột tiền, không tham chiếu tới
-- transactions hay categories.
-- Giờ giấc lưu bằng "số phút từ 0h" + "độ dài" thay vì cặp giờ bắt đầu/kết thúc:
-- ca đêm (22:00–06:00) có end < start nên cặp giờ là nhập nhằng, còn độ dài thì
-- không. Mọi giờ đều là giờ Việt Nam (UTC+7, không có DST).

CREATE TABLE family_members (
  id           TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  -- Gắn với một tài khoản đăng nhập nếu người đó có; NULL cho con nhỏ, ông bà.
  user_id      TEXT REFERENCES users(id),
  name         TEXT NOT NULL,
  nickname     TEXT NOT NULL DEFAULT '',
  relation     TEXT NOT NULL DEFAULT 'khac'
                 CHECK (relation IN ('bo','me','con','ong','ba','khac')),
  -- Khoá màu ('c1'..'c8') chứ không phải mã hex: bảng màu định nghĩa trong CSS
  -- nên nền sáng và nền tối mỗi bên một giá trị.
  color        TEXT NOT NULL CHECK (color IN ('c1','c2','c3','c4','c5','c6','c7','c8')),
  icon         TEXT,
  birth_date   TEXT,                       -- 'YYYY-MM-DD'
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  deleted_at   INTEGER
);
-- UNIQUE dạng partial index (khác categories ở 0001): ràng buộc chỉ tính hàng
-- đang sống, nên xoá xong tạo lại tên cũ là tạo mới bình thường, không phải đi
-- qua đường "khôi phục khi trùng" như /categories.
CREATE UNIQUE INDEX idx_member_name  ON family_members(household_id, name) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX idx_member_user  ON family_members(household_id, user_id) WHERE user_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX        idx_member_house ON family_members(household_id) WHERE deleted_at IS NULL;

CREATE TABLE activities (
  id             TEXT PRIMARY KEY,
  household_id   TEXT NOT NULL REFERENCES households(id),
  member_id      TEXT NOT NULL REFERENCES family_members(id),
  title          TEXT NOT NULL,
  kind           TEXT NOT NULL CHECK (kind IN ('work','teach','study','other')),
  location       TEXT NOT NULL DEFAULT '',
  note           TEXT NOT NULL DEFAULT '',
  -- Các thứ trong tuần, ISO-8601: 1=Thứ 2 … 7=Chủ nhật. '1,3,5' = hai/tư/sáu.
  -- Lưu chuỗi thay vì bitmask hay bảng con vì truy vấn không bao giờ lọc theo
  -- thứ trong SQL — lịch luôn nạp cả hộ rồi trải ra trong JS.
  days_of_week   TEXT NOT NULL,
  start_minute   INTEGER NOT NULL CHECK (start_minute BETWEEN 0 AND 1439),
  duration_min   INTEGER NOT NULL CHECK (duration_min BETWEEN 5 AND 1440),
  effective_from TEXT NOT NULL,            -- 'YYYY-MM-DD'
  effective_to   TEXT,                     -- NULL = chưa có ngày kết thúc
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,
  deleted_at     INTEGER
);
CREATE INDEX idx_activity_range  ON activities(household_id, effective_from) WHERE deleted_at IS NULL;
CREATE INDEX idx_activity_member ON activities(household_id, member_id)      WHERE deleted_at IS NULL;

-- Ngoại lệ của đúng một buổi. Khác hai bảng trên: xoá ngoại lệ là xoá hẳn, vì
-- bản thân nó đã là cái "undo" của một buổi — xoá mềm một cái undo thì vô nghĩa.
CREATE TABLE activity_exceptions (
  id               TEXT PRIMARY KEY,
  household_id     TEXT NOT NULL REFERENCES households(id),
  activity_id      TEXT NOT NULL REFERENCES activities(id),
  occurs_on        TEXT NOT NULL,          -- ngày của buổi GỐC theo khuôn mẫu
  status           TEXT NOT NULL CHECK (status IN ('cancelled','moved')),
  new_date         TEXT,                   -- chỉ dùng khi 'moved'
  new_start_minute INTEGER CHECK (new_start_minute BETWEEN 0 AND 1439),
  new_duration_min INTEGER CHECK (new_duration_min BETWEEN 5 AND 1440),
  note             TEXT NOT NULL DEFAULT '',
  created_at       INTEGER NOT NULL,
  UNIQUE (activity_id, occurs_on)
);
CREATE INDEX idx_exception_source ON activity_exceptions(household_id, occurs_on);
-- Buổi bị dời TỪ ngoài khoảng đang xem VÀO trong khoảng: phải tìm được bằng ngày mới.
CREATE INDEX idx_exception_moved  ON activity_exceptions(household_id, new_date) WHERE new_date IS NOT NULL;
```

**Quyết định và lý do**

- `start_minute` + `duration_min` thay vì `start_time`/`end_time`: ca đêm 22:00→06:00
  có end < start, cặp giờ không phân biệt được "8 tiếng qua đêm" với "lỗi nhập".
  Độ dài thì luôn rõ. Ngoài API vẫn nhận/trả `'HH:MM'` (xem mục 3).
- `days_of_week` là chuỗi CSV đã chuẩn hoá (sắp tăng dần, không trùng). Bitmask gọn
  hơn nhưng đọc log `wrangler d1 execute` không ra gì; bảng con `activity_days` thì
  mỗi lần sửa phải xoá-chèn lại. CSV thắng vì SQL không bao giờ lọc theo thứ.
- **Buổi lẻ** (dạy bù, học bù) không cần bảng riêng: đặt `effective_from ==
  effective_to == ngày đó` và `days_of_week` = đúng thứ của ngày đó → khuôn mẫu sinh
  ra đúng một buổi.
- **Xoá thành viên**: xoá mềm hàng `family_members`, **không** đụng `activities` của
  họ. Truy vấn lịch join `family_members` và lọc `deleted_at IS NULL`, nên lịch của
  người đã xoá biến mất khỏi calendar và tự quay lại nguyên vẹn khi khôi phục.
  API `DELETE` trả kèm số hoạt động bị ảnh hưởng — đúng kiểu
  `countTransactionsInCategory` ở `src/server/db/queries.ts:314`.
- **Múi giờ**: bất biến của cả mảng này — mọi ngày và mọi giờ đều là giờ Việt Nam
  (UTC+7). Việt Nam không có DST nên phép cộng ngày trên chuỗi là chính xác tuyệt đối.

---

## 2. Trải lịch — `src/server/schedule.ts` (file mới)

Hàm thuần, không chạm D1, không chạm `Date.now()` — nhận dữ liệu thô, trả occurrence.

```ts
export function expandOccurrences(
  activities: ActivityRow[],
  exceptions: ExceptionRow[],
  fromInclusive: string,      // 'YYYY-MM-DD'
  toExclusive: string,
): Occurrence[]
```

Giả mã:

```
byActivity = nhóm exceptions theo activity_id, khoá phụ occurs_on

cho mỗi a trong activities:
  # lùi 1 ngày ở cận dưới để bắt ca đêm bắt đầu từ hôm trước tràn sang
  lo = max(addDays(fromInclusive, -1), a.effective_from)
  hi = min(toExclusive, a.effective_to ? addDays(a.effective_to, 1) : toExclusive)
  cho d = lo; d < hi; d = addDays(d, 1):
    nếu isoWeekday(d) không nằm trong a.daysOfWeek: bỏ qua
    ex = byActivity[a.id]?.[d]
    nếu ex?.status === 'cancelled': bỏ qua
    đẩy occurrence{
      date        : ex?.newDate         ?? d,
      startMinute : ex?.newStartMinute  ?? a.startMinute,
      durationMin : ex?.newDurationMin  ?? a.durationMin,
      sourceDate  : d,                  # để sửa/huỷ đúng buổi
      moved       : Boolean(ex),
    }

# buổi bị dời TỪ ngoài khoảng VÀO trong khoảng — vòng lặp trên không quét tới
cho mỗi ex trong exceptions có status='moved', new_date trong [from,toExclusive)
    và occurs_on nằm ngoài [lo,hi) của activity tương ứng:
  dựng occurrence y hệt từ activity của nó

# cắt về đúng khoảng: giữ buổi có [start,end) giao với khoảng
lọc: o.date < toExclusive  &&  endDate(o) >= fromInclusive
sắp: theo (date, startMinute, memberName)
```

**Biên cần xử lý**
- `effective_from` / `effective_to` cắt hai đầu (`effective_to` là **bao gồm**).
- Ca qua đêm: occurrence là *một* bản ghi logic (`date` + `startMinute` +
  `durationMin`). Việc bẻ đôi để vẽ sang cột hôm sau là việc của client
  (`splitOvernight()` trong `src/client/lib/schedule.ts`) — server không nhân đôi
  bản ghi, tránh đếm trùng.
- Ngoại lệ dời buổi ra **ngoài** khoảng: vòng quét sinh nó với `date` mới rồi bộ lọc
  cuối loại đi. Đúng.
- DST: Việt Nam không có. Ghi rõ trong comment đầu file.
- Chặn bùng nổ: `/api/schedule` từ chối khoảng > **62 ngày** (đủ cho lưới tháng 6×7 =
  42 ô). Trần lý thuyết ≈ số activity của hộ × 62.

**Bổ sung vào `src/server/dates.ts`** (giữ nguyên phong cách toán trên chuỗi):
- `addDays(date, n)` — qua `Date.UTC`, giống `daysInMonth` đang làm ở dòng 21-23.
- `isoWeekday(date)` → 1..7 (Thứ 2 = 1).
- `startOfIsoWeek(date)`, `weekEndExclusive(date)`, `daysBetween(a, b)`.

**File mới `src/shared/time.ts`** (client và server dùng chung):
- `TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/`
- `toMinutes('HH:MM') → number`
- `toTimeLabel(minutes) → 'HH:MM'` (chia dư 1440 để ca đêm hiện `06:00`)
- `durationBetween(start, end)` — **quy ước: `end <= start` nghĩa là ca qua đêm**,
  trả `1440 - start + end`; `end === start` là lỗi (buổi dài 0).

---

## 3. API — thêm vào `src/server/app.ts`

Ba banner mới, đặt liền nhau **sau** khối `/* ===== categories ===== */`
(`src/server/app.ts:255`) và **trước** `/* ===== transactions ===== */`
(dòng 345). Không route nào cần `requireOwner`: cả nhà cùng quản lịch, giống
categories/transactions — chỉ đổi mã mời mới là việc của chủ hộ.

```
/* ================================================== thành viên trong nhà */
GET    /api/family-members            ?includeDeleted=1   → { members: FamilyMember[] }
POST   /api/family-members                                → FamilyMember, 201
PATCH  /api/family-members/:id                            → FamilyMember
DELETE /api/family-members/:id                            → { deleted: true, activities: n }
POST   /api/family-members/:id/restore                    → FamilyMember

/* ========================================================= lịch hoạt động */
GET    /api/activities   ?memberId=&kind=&includeDeleted=1 → { activities: Activity[] }
POST   /api/activities                                     → Activity, 201
PATCH  /api/activities/:id                                 → Activity
DELETE /api/activities/:id                                 → { deleted: true }
POST   /api/activities/:id/restore                         → Activity
POST   /api/activities/:id/exceptions                      → ActivityException, 201
DELETE /api/activities/:id/exceptions/:occursOn            → { deleted: true }

/* ========================================================== lịch tổng hợp */
GET    /api/schedule ?from=YYYY-MM-DD&to=YYYY-MM-DD[&memberId=][&kind=]
       → { from, to, members: FamilyMember[], occurrences: Occurrence[] }
```

**Một endpoint cho cả hai chế độ xem**: tuần gửi `from`/`to` 7 ngày, lưới tháng gửi
42 ngày (gồm cả ngày đầu/cuối lấn tháng). Không tách hai endpoint.

**Bẫy thứ tự route** — dự án đã dính một lần (`/transactions/large` phải đứng trước
`/transactions/:id`, `src/server/app.ts:372-376`). Ở đây `/activities/:id/exceptions`
không đụng `/activities/:id` vì khác số đoạn, nhưng nếu sau này thêm
`/activities/kinds` thì **phải** đặt trước `/activities/:id`. Ghi comment nhắc.

**Giờ trên dây**: nhận và trả `'HH:MM'` (`startTime`, `endTime`) cho khớp
`<input type="time">`; server đổi sang `start_minute` + `duration_min` để lưu. DTO trả
kèm `durationMin` và cờ `overnight` để client khỏi tính lại. Quy ước duy nhất cần nhớ:
**kết thúc sớm hơn hoặc bằng bắt đầu = ca qua đêm**; bằng nhau thì từ chối 400.

**Lỗi cần bắt**
| Trường hợp | Mã | Câu |
|---|---|---|
| Tên thành viên trùng trong hộ | 409 | `Đã có thành viên tên này trong nhà` |
| `userId` không thuộc hộ | 400 | `Tài khoản này không ở trong hộ gia đình` |
| `userId` đã gắn thành viên khác | 409 | `Tài khoản này đã gắn với một thành viên khác` |
| `memberId` khác hộ / không có | 400 | `Thành viên không tồn tại` |
| Thành viên đã xoá | 400 | `Thành viên đã bị xoá — khôi phục lại trước khi dùng` (khớp câu ở dòng 421) |
| `effectiveTo` < `effectiveFrom` | 400 | zod |
| `endTime === startTime` | 400 | `Giờ kết thúc phải khác giờ bắt đầu` |
| `daysOfWeek` rỗng | 400 | `Chọn ít nhất một thứ trong tuần` |
| Khoảng lịch > 62 ngày | 400 | `Khoảng ngày tối đa 62 ngày` |
| Ngoại lệ trùng (activity, ngày) | 409 | `Buổi này đã có ngoại lệ — xoá cái cũ trước` |
| Ngoại lệ trỏ vào ngày không có buổi | 400 | `Ngày này không có buổi nào của hoạt động` |

**`src/server/validators.ts`** — thêm, theo đúng lối viết sẵn có:
`FAMILY_RELATIONS`, `MEMBER_COLORS`, `ACTIVITY_KINDS` (const tuple, export để client
dùng chung nhãn), `daysOfWeekSchema` (mảng 1..7, khử trùng + sắp tăng bằng
`.transform`), `timeSchema` (regex `TIME_RE`), `familyMemberCreateSchema`,
`familyMemberUpdateSchema`, `activityCreateSchema` (+ `.refine` cho khoảng hiệu lực và
giờ), `activityUpdateSchema`, `activityExceptionSchema` (`.refine`: `moved` phải có ít
nhất một trong `newDate`/`newStartTime`/`newDurationMin`), `scheduleQuerySchema`.

**`src/server/db/queries.ts`** — thêm `mapFamilyMember`, `mapActivity`,
`mapException` cùng bộ hàm `listFamilyMembers / getFamilyMember / insertFamilyMember /
updateFamilyMember / softDeleteFamilyMember / restoreFamilyMember /
countActivitiesOfMember`, và bộ tương ứng cho `activities`, cộng
`listActivitiesInRange`, `listExceptionsInRange`, `upsertException`, `deleteException`.
Giữ nguyên kiểu prepared statement viết tay đang dùng.

---

## 4. Kiểu dùng chung — `src/shared/types.ts`

```ts
export type FamilyRelation = 'bo' | 'me' | 'con' | 'ong' | 'ba' | 'khac';
export type MemberColor = 'c1'|'c2'|'c3'|'c4'|'c5'|'c6'|'c7'|'c8';
export type ActivityKind = 'work' | 'teach' | 'study' | 'other';
/** ISO-8601: 1 = Thứ 2 … 7 = Chủ nhật. */
export type Weekday = 1|2|3|4|5|6|7;

export interface FamilyMember {
  id: string; name: string; nickname: string;
  relation: FamilyRelation; color: MemberColor; icon: string | null;
  birthDate: string | null;
  /** Tài khoản đăng nhập gắn với người này; null nghĩa là người không có tài khoản. */
  userId: string | null;
  sortOrder: number;
  createdAt: number; updatedAt: number; deletedAt: number | null;
}

export interface Activity {
  id: string; memberId: string; memberName: string;
  title: string; kind: ActivityKind; location: string; note: string;
  daysOfWeek: Weekday[];
  startTime: string; endTime: string;   // 'HH:MM'
  durationMin: number;
  /** Kết thúc rơi sang hôm sau. */
  overnight: boolean;
  effectiveFrom: string; effectiveTo: string | null;
  createdAt: number; updatedAt: number; deletedAt: number | null;
}

export interface ActivityException {
  activityId: string; occursOn: string;
  status: 'cancelled' | 'moved';
  newDate: string | null; newStartTime: string | null; newDurationMin: number | null;
  note: string;
}

/** Một buổi cụ thể đã trải ra từ khuôn mẫu. */
export interface Occurrence {
  activityId: string; memberId: string;
  title: string; kind: ActivityKind; location: string;
  date: string;            // ngày buổi BẮT ĐẦU
  startTime: string; endTime: string; startMinute: number; durationMin: number;
  overnight: boolean;
  /** Ngày gốc theo khuôn mẫu — khoá để tạo/xoá ngoại lệ đúng buổi. */
  sourceDate: string;
  moved: boolean;
}

export interface ScheduleResponse {
  from: string; to: string;              // 'to' bao gồm
  members: FamilyMember[];
  occurrences: Occurrence[];
}
```

---

## 5. Giao diện

### 5.1 Điều hướng — thêm đúng **một** tab

`NAV` hiện có 6 mục (`src/client/App.tsx:81-89`) và `.tabbar .tab { flex: 1 1 0 }`
(`src/client/styles.css:647`). Trên iPhone 16 Pro (393pt) 6 tab ≈ 65pt/tab; **7 tab ≈
56pt/tab** — vẫn qua ngưỡng `--tap: 44px`, nhãn 0.66rem đã có `text-overflow: ellipsis`
sẵn. 8 tab (≈49pt) là quá chật. Vì vậy:

- Thêm **một** mục: `{ to: '/lich', label: 'Lịch hoạt động', shortLabel: 'Lịch',
  icon: 'schedule' }`, đặt sau `Khoản lớn`. Thêm `case 'schedule'` vào `TabIcon`
  (`src/client/App.tsx:16-79`) — SVG nét: khung lịch + hai móc treo + đường kẻ ngang.
- **Danh mục thành viên** không lấy tab riêng: nó vào thẳng trang **Hộ gia đình**
  (`/ho-gia-dinh`) — đúng mục đích trang đó. Card hiện có đổi tiêu đề thành *"Tài
  khoản đăng nhập"*, thêm card mới *"Thành viên trong nhà"* nằm trên nó.
- **Quản lý hoạt động** (CRUD khuôn mẫu) là tab con trong trang Lịch, dùng
  `.segmented` sẵn có: **Tuần · Tháng · Hoạt động**.

### 5.2 File thêm mới

| File | Việc |
|---|---|
| `src/client/pages/Schedule.tsx` | Trang `/lich`: state chế độ xem, mốc tuần/tháng, bộ lọc, gọi `api.schedule()` |
| `src/client/components/WeekGrid.tsx` | Lưới tuần trục giờ |
| `src/client/components/MonthGrid.tsx` | Lưới tháng tổng quan |
| `src/client/components/ActivityForm.tsx` | Thêm/sửa khuôn mẫu hoạt động |
| `src/client/components/OccurrenceSheet.tsx` | Bấm vào một buổi: chi tiết + "Nghỉ buổi này" / "Dời buổi này" (tạo ngoại lệ) |
| `src/client/components/MemberForm.tsx` | Thêm/sửa thành viên, dùng lại `IconPicker` |
| `src/client/lib/schedule.ts` | `splitOvernight()`, `layoutOverlaps()`, `memberColorVar()`, nhãn `KIND_LABEL` / `RELATION_LABEL` |

### 5.3 File sửa

- `src/client/lib/api.ts` — thêm `familyMembers/createFamilyMember/updateFamilyMember/
  deleteFamilyMember/restoreFamilyMember`, `activities/createActivity/updateActivity/
  deleteActivity/restoreActivity/addException/removeException`, `schedule({from,to,
  memberId,kind})`. Dùng lại `query()` (dòng 44) và `post()` (dòng 41).
- `src/client/lib/format.ts` — thêm `weekdayLabel(1..7)` → `'T2'…'CN'`,
  `weekdayLongLabel`, `weekRangeLabel(from, to)` → `'25/08 – 31/08/2026'`,
  `timeRangeLabel(start, end, overnight)` → `'22:00 – 06:00 (+1)'`. Dùng lại
  `fullDateLabel`, `monthLabel`, `todayISO` đang có.
- `src/client/App.tsx` — NAV, route `/lich`, `TabIcon` case.
- `src/client/pages/Household.tsx` — card *"Thành viên trong nhà"*; giữ nguyên lối
  `isPhone ? danh sách thẻ : bảng` đã có ở dòng 102-145.
- `src/client/styles.css` — mục 5.6.

### 5.4 Lưới tuần trục giờ

- **Khung**: CSS Grid `grid-template-columns: 44px repeat(7, minmax(0, 1fr))` —
  máng giờ + 7 cột ngày. Đường kẻ giờ vẽ bằng `repeating-linear-gradient` trên nền cột,
  **không** dựng 24 hàng DOM.
- **Khối buổi**: mỗi cột ngày là một `position: relative` chứa các khối
  `position: absolute` với `top: (startMinute − windowStart) / windowSpan * 100%`,
  `height: durationMin / windowSpan * 100%`.
- **Cửa sổ giờ động**: `windowStart`/`windowEnd` = min/max của các buổi đang hiện, làm
  tròn xuống/lên giờ chẵn, đệm 1 tiếng mỗi đầu; rỗng thì mặc định 06:00–22:00. Không
  vẽ cứng 0–24h — trên điện thoại sẽ không đọc được gì.
- **Ca qua đêm**: `splitOvernight()` bẻ occurrence thành 2 đoạn vẽ (đuôi sang cột hôm
  sau, có dấu `+1`); đoạn thứ hai không tính là buổi mới.
- **Chồng lớp** (`layoutOverlaps()`): trong mỗi cột, sắp theo `startMinute`, gom thành
  cụm giao nhau bắc cầu, tô màu đồ thị khoảng theo lối tham lam → mỗi khối nhận
  `width: 100/nCols %`, `left: col * width`. Đây chính là chỗ "thấy rõ ai bận lúc nào".
- **Điện thoại (393pt)**: `useIsPhone()` → bọc lưới trong khung cuộn ngang, cột tối
  thiểu 64pt (7×64 = 448pt), máng giờ `position: sticky; left: 0`. Giữ đúng chế độ xem
  tuần người dùng đã chọn thay vì đổi sang agenda.
- **Tiếp cận**: mỗi khối là một `<button>` với
  `aria-label="Mẹ · Dạy Toán · Thứ 4, 18:00–20:00"`; container có
  `role="list"` + `aria-label`. **Màu không bao giờ là tín hiệu duy nhất** — mỗi khối
  luôn in biểu tượng + tên rút gọn của thành viên, đúng quy ước ở
  `src/client/components/viz.tsx:1-8`. Legend thành viên dùng lại `.legend` / `.swatch`.

### 5.5 Lưới tháng tổng quan

6×7 ô, mỗi ô: số ngày + tối đa 3 chip (biểu tượng thành viên + tên hoạt động rút gọn) +
`+n` khi tràn. Ngày ngoài tháng làm mờ, hôm nay viền `--focus`. Bấm một ô → chuyển sang
tab Tuần, neo vào tuần chứa ngày đó.

### 5.6 CSS

Thêm vào cả ba khối biến (`:root`, `@media (prefers-color-scheme: dark)`, khối
`[data-theme]` — `src/client/styles.css:5-78`):

```
--member-1 … --member-8         /* màu nhận dạng, dùng cho viền trái + chấm legend */
--member-1-soft … -8-soft       /* nền khối, đủ nhạt để chữ --text-primary vẫn đọc được */
```

8 màu tách bạch cho người mù màu, mỗi bên sáng/tối một giá trị — cùng tinh thần với
cặp `--series-current`/`--series-previous` đã có. Khối buổi = nền `-soft` + viền trái
3px màu đậm + chữ `--text-primary`; **không** dùng chữ trắng trên màu tuỳ ý.

Class mới: `.week-grid`, `.week-gutter`, `.week-col`, `.occ`, `.occ-title`, `.occ-time`,
`.month-grid`, `.month-cell`, `.month-chip`, `.member-swatch`, `.schedule-legend`,
`.dow-toggle` (nút chọn thứ trong tuần). Bổ sung trong `@media (max-width: 720px)`:
khung cuộn ngang, máng giờ sticky, chip tháng thu nhỏ.

---

## 6. Kiểm thử

Chạy trong `@cloudflare/vitest-pool-workers`, `AI_FEATURES: 'off'`
(`vitest.config.ts`), migration áp sẵn qua `tests/apply-migrations.ts`. Theo lối
`tests/categories.test.ts`: `registerOwner()`, `call()`, `json()`. Thêm helper
`addMember()` / `addActivity()` vào `tests/helpers.ts`.

**`tests/family-members.test.ts`**
- Tạo / liệt kê / sửa / xoá mềm / khôi phục.
- Trùng tên trong hộ → 409; trùng tên **khác hộ** → OK.
- Xoá xong tạo lại đúng tên đó → tạo **mới** (partial unique index), khác hẳn đường
  "khôi phục khi trùng" của categories.
- Không đọc/sửa/xoá được thành viên hộ khác → 404.
- Gắn `userId` ngoài hộ → 400; gắn `userId` đã có thành viên khác → 409.
- `DELETE` trả đúng số hoạt động của người đó.

**`tests/activities.test.ts`**
- `daysOfWeek: [5,1,3,1]` → lưu và trả về `[1,3,5]`.
- `startTime '22:00'`, `endTime '06:00'` → `durationMin 480`, `overnight true`.
- `endTime === startTime` → 400.
- `effectiveTo` trước `effectiveFrom` → 400.
- `memberId` của hộ khác → 400; thành viên đã xoá → 400.
- Xoá mềm / khôi phục / `includeDeleted=1`.
- Lọc theo `memberId`, `kind`.

**`tests/schedule.test.ts`** — phần rủi ro nhất, liệt kê đủ:
1. Khuôn mẫu T2/T4/T6 trong cửa sổ 7 ngày → đúng 3 buổi, đúng ngày.
2. `effectiveFrom` cắt buổi đầu.
3. `effectiveTo` cắt buổi cuối và là **bao gồm**.
4. Ngoại lệ `cancelled` bỏ đúng một buổi, các buổi anh em còn nguyên.
5. Ngoại lệ `moved` đổi giờ, giữ ngày.
6. Ngoại lệ `moved` đưa buổi **từ ngoài** cửa sổ **vào trong** → phải xuất hiện.
7. Ngoại lệ `moved` đưa buổi **ra ngoài** cửa sổ → phải biến mất.
8. Ca 22:00–06:00 của ngày **trước** `from` → tràn vào và có mặt.
9. Ca 22:00–06:00 của ngày cuối cửa sổ → trả **đúng một** bản ghi, không nhân đôi.
10. Buổi lẻ (`effectiveFrom === effectiveTo`) → đúng một buổi.
11. `to` trước `from` → 400; khoảng > 62 ngày → 400; ngày sai định dạng → 400.
12. Hoạt động đã xoá mềm không xuất hiện; khôi phục thì quay lại.
13. **Thành viên** đã xoá mềm → lịch của họ biến mất; khôi phục thì quay lại nguyên vẹn.
14. Lọc `memberId` và `kind`.
15. Dữ liệu hộ khác không bao giờ lọt sang.
16. Kết quả sắp theo `(date, startMinute)`.
17. Chưa đăng nhập → 401.

**`tests/schedule-dates.test.ts`** (hoặc gộp): `addDays` qua mốc tháng/năm và năm
nhuận, `isoWeekday` (2026-08-30 là Chủ nhật → 7), `toMinutes`/`toTimeLabel` khứ hồi,
`durationBetween` cho ca thường và ca đêm.

---

## 7. Tài liệu — `README.md`

- Đoạn mở đầu: thêm một câu về mảng lịch hoạt động, nói rõ nó **tách khỏi thu/chi**.
- Bảng **Các trang**: thêm dòng
  `| Lịch hoạt động | Lưới tuần trục giờ và lưới tháng cho lịch đi làm, đi dạy, đi học của từng người; nghỉ hoặc dời từng buổi |`
  và sửa dòng **Hộ gia đình** thành
  `| Hộ gia đình | Thành viên trong nhà (kể cả người không có tài khoản), tài khoản đăng nhập và mã mời |`.
- Không thêm dòng nào vào bảng **Công nghệ** và không sửa mục **Cài đặt** — không có
  tài nguyên Cloudflare mới, `npm run db:migrate` tự nhặt migration 0004.

---

## 8. Trình tự thực hiện

Mỗi bước tự build và tự test được (`npm test && npm run build`).

1. **Nền móng** — `migrations/0004_family_schedule.sql`, `src/shared/time.ts`, các hàm
   mới trong `src/server/dates.ts`, test cho chúng.
2. **Thành viên: API** — queries, validators, types, 5 route, `tests/family-members.test.ts`.
   *Commit: "Danh mục thành viên trong gia đình"*
3. **Hoạt động: API** — queries, validators, types, 5 route + 2 route ngoại lệ,
   `tests/activities.test.ts`. *Commit: "Khai lịch hoạt động lặp hàng tuần cho từng thành viên"*
4. **Trải lịch** — `src/server/schedule.ts`, `GET /api/schedule`,
   `tests/schedule.test.ts`. *Commit: "Trải lịch theo khoảng ngày, có ngoại lệ từng buổi"*
5. **Client nền** — `api.ts`, helper `format.ts`, `src/client/lib/schedule.ts`, biến màu
   `--member-*` trong cả ba khối theme.
6. **Thành viên: giao diện** — card "Thành viên trong nhà" trên `/ho-gia-dinh`,
   `MemberForm`, dùng lại `IconPicker`. *Commit*
7. **Trang Lịch + tab Hoạt động** — route `/lich`, NAV, `TabIcon`, `ActivityForm`. *Commit*
8. **Lưới tuần** — `WeekGrid`, `layoutOverlaps`, `splitOvernight`, legend, bộ lọc,
   `OccurrenceSheet` (nghỉ/dời buổi). *Commit: "Lưới tuần trục giờ cho lịch cả nhà"*
9. **Lưới tháng** — `MonthGrid`, bấm ngày → nhảy sang tuần. *Commit*
10. **Điện thoại + nền tối** — cuộn ngang, máng giờ sticky, cỡ chạm 44pt, rà lại tương
    phản 8 màu ở cả hai nền. *Commit*
11. **README** + chạy lại `npm test && npm run build`. *Commit*

Đẩy lên nhánh `claude/family-activity-schedule-plan-gejjry`.

---

## 9. Kiểm chứng

```bash
npm install
npm run db:migrate:local          # áp 0004 vào D1 cục bộ
npm test                          # toàn bộ vitest, gồm 3 file test mới
npm run build                     # tsc --noEmit && vite build
npm run dev:api                   # API tại :8788
npm run dev                       # UI tại :5173
```

Đi một vòng bằng tay:
1. Đăng ký hộ mới → vào **Hộ gia đình** → thêm 3 thành viên (một người **không** gắn
   tài khoản) với 3 màu khác nhau.
2. Vào **Lịch → Hoạt động** → khai: mẹ "Dạy Toán" T2/T4/T6 18:00–20:00; bố "Ca đêm"
   T7 22:00–06:00; con "Học thêm Anh" T4 18:30–20:00 (cố ý chồng giờ với mẹ).
3. Tab **Tuần**: buổi của mẹ và con phải nằm cạnh nhau chứ không đè lên nhau; ca đêm
   của bố phải kéo dài sang cột Chủ nhật với dấu `+1`.
4. Bấm buổi T4 của mẹ → **Nghỉ buổi này** → buổi đó biến mất, T2 và T6 còn nguyên.
5. Bấm buổi T6 → **Dời** sang T5 19:00 → sang tuần trước/sau rồi quay lại, buổi nằm
   đúng T5.
6. Tab **Tháng**: đủ chip; bấm một ngày → nhảy sang tuần chứa ngày đó.
7. Lọc theo một thành viên → chỉ còn buổi của người đó; legend chỉ còn một màu.
8. Xoá mềm một thành viên ở **Hộ gia đình** → lịch của họ biến khỏi calendar; khôi phục
   → quay lại đầy đủ.
9. Thu cửa sổ trình duyệt xuống 393px (hoặc DevTools iPhone 16 Pro): lưới tuần cuộn
   ngang, máng giờ dính bên trái, thanh tab 7 mục vẫn đọc được, mọi nút ≥ 44pt.
10. Đổi hệ điều hành sang nền tối → 8 màu thành viên vẫn phân biệt được, chữ trên khối
    vẫn đọc rõ.

---

## 10. Rủi ro và điểm còn mở

- **Thanh tab 7 mục**: 56pt/tab trên iPhone 16 Pro (393pt) — ổn; trên iPhone SE
  (375pt) còn ~53pt, vẫn qua `--tap` nhưng nhãn sẽ bị cắt nhiều hơn. Nếu sau này cần
  thêm tab thứ 8 thì phải đổi cấu trúc điều hướng, không nhét thêm được nữa.
- **Không đồng bộ user → thành viên**: theo đúng lựa chọn "Danh mục riêng". Hệ quả:
  người mới vào hộ qua mã mời sẽ *không* tự có mặt trong danh sách thành viên, phải
  thêm tay và gắn tài khoản. Nếu thấy phiền, thêm bước tự sinh sau là việc nhỏ.
- **Lịch không vào tìm kiếm ngữ nghĩa / hỏi đáp**: non-goal có chủ ý ở vòng này.
  "Tháng sau mẹ dạy bao nhiêu buổi?" sẽ chưa trả lời được.
- **Ngoại lệ dời buổi chỉ dời được trong phạm vi một hoạt động**, không đổi được
  thành viên của buổi đó. Đủ cho nhu cầu nêu ra.
- **Chưa có lặp theo tháng** (kiểu "mùng 5 hàng tháng") — người dùng đã loại. Nếu sau
  cần, thêm cột `monthly_days TEXT` vào `activities` là mở rộng thuần tuý, không phá
  dữ liệu cũ.
