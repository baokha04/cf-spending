-- Migration 0005: ngày hết hạn của khoản thu/chi và việc nhắc gia hạn.
--
-- Có những khoản không chỉ xảy ra một lần rồi thôi mà còn kèm một mốc phải làm
-- lại: bảo hiểm, tiền thuê nhà, gói cước, phí thường niên, hợp đồng dạy thêm.
-- `expires_on` là mốc đó. NULL nghĩa là khoản này không có hạn — đó là đa số,
-- nên cột để NULL được thay vì NOT NULL DEFAULT '' như các cột chi tiết ở 0002:
-- ở đây "không có hạn" là một trạng thái thật, không phải "chưa kịp ghi".
--
-- Ràng buộc expires_on >= occurred_on nằm ở tầng validator chứ không ở CHECK:
-- SQLite không sửa được CHECK sau này, mà thông báo lỗi tiếng Việt thì phải do
-- zod sinh ra mới nói được cho người dùng.
ALTER TABLE transactions ADD COLUMN expires_on TEXT;

-- Truy vấn nhắc gia hạn luôn có hình dạng "hộ này, expires_on <= mốc, chưa xoá,
-- sắp theo expires_on tăng dần". Partial index chỉ chứa các khoản thật sự có
-- hạn nên nó nhỏ hơn hẳn bảng, dù bảng có to đến đâu.
CREATE INDEX idx_tx_expiry ON transactions(household_id, expires_on)
  WHERE expires_on IS NOT NULL AND deleted_at IS NULL;
