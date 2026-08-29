-- Migration 0002: chi tiết cho từng khoản thu/chi.
--
-- Ba cột mới đều NOT NULL DEFAULT '' để bản ghi cũ không phải backfill và mọi
-- truy vấn hiện có vẫn đọc được giá trị rỗng thay vì NULL. Quy ước: chuỗi rỗng
-- nghĩa là "chưa ghi", API quy đổi payment_method rỗng thành null.

ALTER TABLE transactions ADD COLUMN detail TEXT NOT NULL DEFAULT '';
ALTER TABLE transactions ADD COLUMN payee TEXT NOT NULL DEFAULT '';
ALTER TABLE transactions ADD COLUMN payment_method TEXT NOT NULL DEFAULT '';

-- Trang "Khoản lớn" lọc theo (hộ, chiều, số tiền ≥ ngưỡng) rồi sắp theo số tiền
-- giảm dần; index này phục vụ đúng hình dạng đó.
CREATE INDEX idx_tx_amount ON transactions(household_id, direction, amount DESC)
  WHERE deleted_at IS NULL;
