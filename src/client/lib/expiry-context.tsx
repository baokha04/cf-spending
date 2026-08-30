import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { ExpiringResponse } from '../../shared/types';
import { api } from './api';
import { useAuth } from './auth-context';

interface ExpiryState {
  data: ExpiringResponse | null;
  /** Số khoản đã quá hạn — con số trên chuông. */
  overdueCount: number;
  /** Số khoản hết hạn trong cửa sổ nhắc, kể cả hôm nay. */
  soonCount: number;
  refresh: () => Promise<void>;
}

const ExpiryContext = createContext<ExpiryState | null>(null);

/**
 * Một lần gọi API cho cả chuông trên thanh trên cùng lẫn thẻ "Cần gia hạn".
 *
 * Hai chỗ đó phải luôn nói cùng một con số: chuông báo 3 khoản quá hạn mà thẻ
 * chỉ liệt kê 2 là lỗi người dùng nhìn thấy ngay. Gom về một nguồn thì gia hạn
 * xong gọi `refresh()` một lần là cả hai cùng cập nhật.
 *
 * Provider nằm ngoài <Routes> nên nó sống qua mọi lần chuyển trang: đặt bên
 * trong thì mỗi lần mở một màn hình form là một lần nạp lại, và huy hiệu trên
 * chuông nháy mất rồi hiện lại. Nó chỉ hỏi API khi đã đăng nhập.
 */
export function ExpiryProvider({ children }: { children: ReactNode }) {
  const { me } = useAuth();
  const [data, setData] = useState<ExpiringResponse | null>(null);

  const refresh = useCallback(async () => {
    try {
      setData(await api.expiringTransactions());
    } catch {
      // Không tải được thì giữ nguyên số cũ: chuông tắt ngóm vì mạng chập chờn
      // còn khó hiểu hơn là một con số hơi cũ. Thẻ "Cần gia hạn" mới là chỗ
      // hiển thị lỗi, vì ở đó người dùng đang thực sự chờ dữ liệu.
    }
  }, []);

  useEffect(() => {
    // Đăng xuất thì xoá sạch: số của hộ cũ không được phép còn nằm trên màn hình
    // khi người khác đăng nhập vào cùng máy.
    if (!me) {
      setData(null);
      return;
    }
    void refresh();
  }, [me, refresh]);

  const value = useMemo(
    () => ({
      data,
      overdueCount: data?.overdue.length ?? 0,
      soonCount: data?.soon.length ?? 0,
      refresh,
    }),
    [data, refresh],
  );
  return <ExpiryContext.Provider value={value}>{children}</ExpiryContext.Provider>;
}

export function useExpiry(): ExpiryState {
  const ctx = useContext(ExpiryContext);
  if (!ctx) throw new Error('useExpiry phải nằm trong ExpiryProvider');
  return ctx;
}
