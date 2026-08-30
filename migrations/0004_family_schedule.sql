-- Migration 0004: thành viên trong nhà và lịch hoạt động của họ.
--
-- Mảng này tách hẳn khỏi thu/chi: không có cột tiền, không tham chiếu tới
-- transactions hay categories.
--
-- Giờ giấc lưu bằng "số phút từ 0h" + "độ dài" thay vì cặp giờ bắt đầu/kết thúc:
-- ca đêm (22:00–06:00) có end < start nên cặp giờ không phân biệt được "8 tiếng
-- qua đêm" với "nhập nhầm", còn độ dài thì luôn rõ. Mọi ngày và mọi giờ ở đây
-- đều là giờ Việt Nam (UTC+7); Việt Nam không có DST nên cộng ngày trên chuỗi
-- là chính xác tuyệt đối.

CREATE TABLE family_members (
  id           TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  -- Gắn với một tài khoản đăng nhập nếu người đó có; NULL cho con nhỏ, ông bà.
  user_id      TEXT REFERENCES users(id),
  name         TEXT NOT NULL,
  nickname     TEXT NOT NULL DEFAULT '',
  relation     TEXT NOT NULL DEFAULT 'khac'
                 CHECK (relation IN ('bo', 'me', 'con', 'ong', 'ba', 'khac')),
  -- Khoá màu chứ không phải mã hex: bảng màu định nghĩa trong CSS nên nền sáng
  -- và nền tối mỗi bên một giá trị.
  color        TEXT NOT NULL
                 CHECK (color IN ('c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8')),
  icon         TEXT,
  birth_date   TEXT,                                       -- 'YYYY-MM-DD'
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  deleted_at   INTEGER
);
-- UNIQUE dạng partial index, khác cách categories làm ở 0001: ràng buộc chỉ tính
-- hàng đang sống, nên xoá xong tạo lại đúng tên cũ là tạo mới bình thường, không
-- phải đi qua đường "khôi phục khi trùng" của /categories.
CREATE UNIQUE INDEX idx_member_name  ON family_members(household_id, name)
  WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX idx_member_user  ON family_members(household_id, user_id)
  WHERE user_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX        idx_member_house ON family_members(household_id)
  WHERE deleted_at IS NULL;

CREATE TABLE activities (
  id             TEXT PRIMARY KEY,
  household_id   TEXT NOT NULL REFERENCES households(id),
  member_id      TEXT NOT NULL REFERENCES family_members(id),
  title          TEXT NOT NULL,
  kind           TEXT NOT NULL CHECK (kind IN ('work', 'teach', 'study', 'other')),
  location       TEXT NOT NULL DEFAULT '',
  note           TEXT NOT NULL DEFAULT '',
  -- Các thứ trong tuần, ISO-8601: 1 = Thứ 2 … 7 = Chủ nhật. '1,3,5' = hai/tư/sáu.
  -- Lưu chuỗi thay vì bitmask hay bảng con vì truy vấn không bao giờ lọc theo thứ
  -- trong SQL — lịch luôn nạp cả hộ rồi trải ra trong JS.
  days_of_week   TEXT NOT NULL,
  start_minute   INTEGER NOT NULL CHECK (start_minute BETWEEN 0 AND 1439),
  duration_min   INTEGER NOT NULL CHECK (duration_min BETWEEN 5 AND 1440),
  effective_from TEXT NOT NULL,                            -- 'YYYY-MM-DD'
  effective_to   TEXT,                                     -- NULL = chưa có ngày kết thúc
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,
  deleted_at     INTEGER
);
CREATE INDEX idx_activity_range  ON activities(household_id, effective_from)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_activity_member ON activities(household_id, member_id)
  WHERE deleted_at IS NULL;

-- Ngoại lệ của đúng một buổi. Khác hai bảng trên ở chỗ xoá là xoá hẳn: bản thân
-- nó đã là cái "undo" của một buổi, xoá mềm một cái undo thì vô nghĩa.
CREATE TABLE activity_exceptions (
  id               TEXT PRIMARY KEY,
  household_id     TEXT NOT NULL REFERENCES households(id),
  activity_id      TEXT NOT NULL REFERENCES activities(id),
  occurs_on        TEXT NOT NULL,          -- ngày của buổi GỐC theo khuôn mẫu
  status           TEXT NOT NULL CHECK (status IN ('cancelled', 'moved')),
  new_date         TEXT,                   -- chỉ dùng khi 'moved'
  new_start_minute INTEGER CHECK (new_start_minute BETWEEN 0 AND 1439),
  new_duration_min INTEGER CHECK (new_duration_min BETWEEN 5 AND 1440),
  note             TEXT NOT NULL DEFAULT '',
  created_at       INTEGER NOT NULL,
  UNIQUE (activity_id, occurs_on)
);
CREATE INDEX idx_exception_source ON activity_exceptions(household_id, occurs_on);
-- Buổi bị dời TỪ ngoài khoảng đang xem VÀO trong khoảng: vòng quét theo ngày gốc
-- không tới được nó, phải tìm thêm bằng ngày mới.
CREATE INDEX idx_exception_moved  ON activity_exceptions(household_id, new_date)
  WHERE new_date IS NOT NULL;
