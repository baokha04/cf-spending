import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  PAGE_COLOR,
  THEME_STORAGE_KEY,
  isThemeMode,
  nextMode,
  resolveTheme,
} from '../../shared/theme';
import type { ResolvedTheme, ThemeMode } from '../../shared/theme';
import { useMediaQuery } from './use-media-query';

const DARK_QUERY = '(prefers-color-scheme: dark)';

interface ThemeState {
  mode: ThemeMode;
  /** Giao diện đang hiển thị thật, sau khi đã hỏi hệ điều hành nếu mode='system'. */
  resolved: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
  /** Xoay vòng Theo máy → Sáng → Tối → Theo máy. */
  cycle: () => void;
}

const ThemeContext = createContext<ThemeState | null>(null);

/** localStorage ném lỗi ở trang riêng tư của Safari — ở đó cứ chạy theo máy. */
function readStoredMode(): ThemeMode {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeMode(raw) ? raw : 'system';
  } catch {
    return 'system';
  }
}

function storeMode(mode: ThemeMode): void {
  try {
    if (mode === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    /* không lưu được thì thôi, lựa chọn chỉ sống hết phiên này */
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(readStoredMode);
  const prefersDark = useMediaQuery(DARK_QUERY);
  const resolved = resolveTheme(mode, prefersDark);

  useEffect(() => {
    const root = document.documentElement;
    // 'system' thì gỡ hẳn thuộc tính ra để @media (prefers-color-scheme) cầm lái,
    // đúng như bộ chọn :root:not([data-theme='light']) trong styles.css trông đợi.
    if (mode === 'system') delete root.dataset.theme;
    else root.dataset.theme = mode;

    // Thẻ này do script khởi động trong index.html dựng sẵn nên luôn có mặt.
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', PAGE_COLOR[resolved]);
  }, [mode, resolved]);

  const setMode = useCallback((next: ThemeMode) => {
    storeMode(next);
    setModeState(next);
  }, []);

  const value = useMemo<ThemeState>(
    () => ({ mode, resolved, setMode, cycle: () => setMode(nextMode(mode)) }),
    [mode, resolved, setMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme phải nằm trong ThemeProvider');
  return ctx;
}
