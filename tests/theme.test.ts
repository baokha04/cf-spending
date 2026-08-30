import { describe, expect, it } from 'vitest';
import {
  PAGE_COLOR,
  THEME_LABEL,
  isThemeMode,
  nextMode,
  resolveTheme,
} from '../src/shared/theme';
import type { ThemeMode } from '../src/shared/theme';

const MODES: ThemeMode[] = ['system', 'light', 'dark'];

describe('giao diện sáng/tối', () => {
  it('chỉ chế độ system mới hỏi tới hệ điều hành', () => {
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('system', true)).toBe('dark');
    // Chọn tay thì đè lên hệ điều hành, kể cả khi ngược nhau.
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('light', false)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('dark', true)).toBe('dark');
  });

  it('nút bấm xoay đúng một vòng khép kín', () => {
    expect(nextMode('system')).toBe('light');
    expect(nextMode('light')).toBe('dark');
    expect(nextMode('dark')).toBe('system');
    // Bấm đủ ba lần từ bất kỳ đâu là về chỗ cũ.
    for (const mode of MODES) {
      expect(nextMode(nextMode(nextMode(mode)))).toBe(mode);
    }
  });

  it('mọi chế độ đều có nhãn tiếng Việt', () => {
    for (const mode of MODES) expect(THEME_LABEL[mode]).toBeTruthy();
  });

  it('nhận đúng giá trị đọc từ localStorage', () => {
    for (const mode of MODES) expect(isThemeMode(mode)).toBe(true);
    for (const junk of [null, '', 'Dark', 'auto', 0, {}]) {
      expect(isThemeMode(junk)).toBe(false);
    }
  });

  it('màu thẻ theme-color khớp --page trong styles.css', () => {
    // Đổi một bên mà quên bên kia thì mép trên iPhone lộ vệt khác màu.
    expect(PAGE_COLOR.light).toBe('#f9f9f7');
    expect(PAGE_COLOR.dark).toBe('#0d0d0d');
  });
});
