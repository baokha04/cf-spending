-- Migration 0001: khởi tạo schema quản lý chi tiêu gia đình.
-- Quy ước: mọi mốc thời gian hệ thống là epoch milliseconds (INTEGER).
-- Số tiền lưu INTEGER đơn vị đồng (VND không có đơn vị lẻ) để cộng dồn không sai số.

CREATE TABLE households (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  invite_code  TEXT NOT NULL UNIQUE,
  currency     TEXT NOT NULL DEFAULT 'VND',
  created_at   INTEGER NOT NULL
);

CREATE TABLE users (
  id             TEXT PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE,   -- luôn lưu lowercase
  password_hash  TEXT NOT NULL,          -- base64, PBKDF2-SHA256
  password_salt  TEXT NOT NULL,          -- base64, 16 bytes
  kdf_iterations INTEGER NOT NULL,
  display_name   TEXT NOT NULL,
  created_at     INTEGER NOT NULL
);

CREATE TABLE memberships (
  user_id      TEXT NOT NULL REFERENCES users(id),
  household_id TEXT NOT NULL REFERENCES households(id),
  role         TEXT NOT NULL CHECK (role IN ('owner', 'member')),
  joined_at    INTEGER NOT NULL,
  PRIMARY KEY (user_id, household_id)
);
CREATE INDEX idx_memberships_household ON memberships(household_id);

-- id = SHA-256 của session token; token thô không bao giờ chạm vào database.
CREATE TABLE sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expiry ON sessions(expires_at);

CREATE TABLE categories (
  id           TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  name         TEXT NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('income', 'expense')),
  icon         TEXT,
  is_archived  INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  UNIQUE (household_id, kind, name)
);
CREATE INDEX idx_categories_household ON categories(household_id);

CREATE TABLE transactions (
  id           TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  created_by   TEXT NOT NULL REFERENCES users(id),
  occurred_on  TEXT NOT NULL,                                   -- 'YYYY-MM-DD'
  note         TEXT NOT NULL DEFAULT '',                        -- nội dung giao dịch
  amount       INTEGER NOT NULL CHECK (amount > 0),             -- đồng, luôn dương
  direction    TEXT NOT NULL CHECK (direction IN ('income', 'expense')),
  recurrence   TEXT NOT NULL CHECK (recurrence IN ('monthly', 'one_off')),
  category_id  TEXT REFERENCES categories(id),
  embed_status TEXT NOT NULL DEFAULT 'pending'
                 CHECK (embed_status IN ('pending', 'ok', 'error', 'skipped')),
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  deleted_at   INTEGER
);
CREATE INDEX idx_tx_month ON transactions(household_id, occurred_on) WHERE deleted_at IS NULL;
CREATE INDEX idx_tx_cat   ON transactions(household_id, category_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_tx_embed ON transactions(embed_status) WHERE embed_status IN ('pending', 'error');

-- Hạn chế dò mật khẩu. key = 'email:<email lowercase>'
CREATE TABLE login_attempts (
  key          TEXT PRIMARY KEY,
  fail_count   INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);
