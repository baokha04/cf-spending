import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/** Trang danh sách đã đưa người dùng tới đây; dùng để quay về đúng chỗ cũ. */
interface FromState {
  from?: string;
}

/**
 * Đường về của một màn hình form.
 *
 * Trang danh sách gắn kèm URL đầy đủ của chính nó (kể cả bộ lọc đang đặt) vào
 * `state.from` khi mở form, nên đóng form là về đúng danh sách đang lọc dở chứ
 * không phải một danh sách mặc định. Vào thẳng URL form (dán link, mở tab mới)
 * thì không có state, lúc đó rơi về `fallback`.
 *
 * `goBack` thay thế mục lịch sử của form thay vì đẩy thêm một mục: lưu xong bấm
 * Back mà quay lại chính cái form vừa lưu là thứ không ai muốn.
 */
export function useReturnTo(fallback: string): {
  to: string;
  goBack: (state?: unknown) => void;
} {
  const navigate = useNavigate();
  const location = useLocation();
  const to = (location.state as FromState | null)?.from ?? fallback;

  const goBack = useCallback(
    (state?: unknown) => navigate(to, { replace: true, state: state ?? null }),
    [navigate, to],
  );

  return { to, goBack };
}

/** URL hiện tại kèm query, để đính vào `state.from` lúc mở một màn hình form. */
export function useCurrentUrl(): string {
  const location = useLocation();
  return `${location.pathname}${location.search}`;
}
