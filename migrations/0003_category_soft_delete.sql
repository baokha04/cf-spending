-- Migration 0003: xoá danh mục cũng chỉ là xoá mềm.
--
-- `is_archived` (lưu trữ) và `deleted_at` (đã xoá) là hai trạng thái khác nhau:
-- lưu trữ là "thôi dùng nhưng vẫn là nhãn hợp lệ", còn xoá là "bỏ hẳn, chỉ còn
-- nằm đó để khôi phục". Cả hai đều giữ nguyên hàng trong bảng nên giao dịch cũ
-- không bao giờ mất nhãn.

ALTER TABLE categories ADD COLUMN deleted_at INTEGER;
