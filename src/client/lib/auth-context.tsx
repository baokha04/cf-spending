import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { MeResponse } from '../../shared/types';
import { ApiError, api } from './api';

interface AuthState {
  me: MeResponse | null;
  loading: boolean;
  setMe: (me: MeResponse | null) => void;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setMe(await api.me());
    } catch (err) {
      // 401 là trạng thái bình thường của khách chưa đăng nhập, không phải lỗi.
      if (!(err instanceof ApiError && err.status === 401)) console.error(err);
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await api.logout();
    setMe(null);
  }, []);

  const value = useMemo(() => ({ me, loading, setMe, refresh, logout }), [me, loading, refresh, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth phải nằm trong AuthProvider');
  return ctx;
}

/** Đảm bảo đã đăng nhập; các trang dùng để lấy household chắc chắn khác null. */
export function useSession(): MeResponse {
  const { me } = useAuth();
  if (!me) throw new Error('Trang này yêu cầu đăng nhập');
  return me;
}
