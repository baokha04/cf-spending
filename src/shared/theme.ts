/**
 * Giao diện sáng/tối. Phần thuần, không React, để cả script khởi động trong
 * index.html lẫn ThemeProvider dùng chung một bộ luật.
 *
 * Ba trạng thái chứ không phải hai: 'system' là hành vi mặc định xưa nay (theo
 * hệ điều hành), nên nút hai trạng thái sẽ khoá mất đường quay về nó.
 */

export type ThemeMode = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'cf-spending:theme';

/**
 * Màu nền của từng giao diện, cho thẻ <meta name="theme-color"> — thanh trạng
 * thái iPhone lấy màu từ đây.
 *
 * Phải khớp `--page` trong src/client/styles.css (`:root` và các khối tối);
 * đổi một bên mà quên bên kia thì mép trên màn hình lộ một vệt khác màu.
 */
export const PAGE_COLOR: Record<ResolvedTheme, string> = {
  light: '#f9f9f7',
  dark: '#0d0d0d',
};

/** Thứ tự xoay vòng của nút bấm. */
const CYCLE: ThemeMode[] = ['system', 'light', 'dark'];

export function nextMode(mode: ThemeMode): ThemeMode {
  return CYCLE[(CYCLE.indexOf(mode) + 1) % CYCLE.length];
}

/** Giao diện thực sự hiển thị: 'system' mới phải hỏi tới hệ điều hành. */
export function resolveTheme(mode: ThemeMode, prefersDark: boolean): ResolvedTheme {
  if (mode === 'light' || mode === 'dark') return mode;
  return prefersDark ? 'dark' : 'light';
}

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'system' || value === 'light' || value === 'dark';
}

export const THEME_LABEL: Record<ThemeMode, string> = {
  system: 'Theo máy',
  light: 'Sáng',
  dark: 'Tối',
};
