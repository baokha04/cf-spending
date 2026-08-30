import { describe, expect, it } from 'vitest';
import { isoWeek, monthNumberLabel, weekNumberLabel } from '../src/client/lib/format';

describe('số tuần theo ISO-8601', () => {
  it('tuần 1 là tuần chứa ngày 4 tháng 1', () => {
    // 2026-01-04 là Chủ nhật, nên tuần 1 của 2026 bắt đầu từ Thứ 2 29/12/2025.
    expect(isoWeek('2025-12-29')).toEqual({ week: 1, year: 2026 });
    expect(isoWeek('2026-01-04')).toEqual({ week: 1, year: 2026 });
    expect(isoWeek('2026-01-05')).toEqual({ week: 2, year: 2026 });
  });

  it('mọi ngày trong cùng một tuần cho cùng một số', () => {
    const week = isoWeek('2026-08-31'); // Thứ 2
    for (const d of ['2026-09-01', '2026-09-03', '2026-09-06']) {
      expect(isoWeek(d)).toEqual(week);
    }
    expect(week).toEqual({ week: 36, year: 2026 });
  });

  it('cuối năm thuộc về năm chứa Thứ 5 của tuần đó', () => {
    // 31/12/2026 là Thứ 5 → cả tuần đó vẫn là tuần 53 của 2026, kể cả 03/01/2027.
    expect(isoWeek('2026-12-31')).toEqual({ week: 53, year: 2026 });
    expect(isoWeek('2027-01-03')).toEqual({ week: 53, year: 2026 });
    expect(isoWeek('2027-01-04')).toEqual({ week: 1, year: 2027 });
  });

  it('năm 53 tuần và năm 52 tuần', () => {
    expect(isoWeek('2020-12-31')).toEqual({ week: 53, year: 2020 });
    expect(isoWeek('2025-12-28')).toEqual({ week: 52, year: 2025 });
  });
});

describe('nhãn nút chuyển tuần và chuyển tháng', () => {
  it('chỉ ghi số khi cùng năm với tuần đang xem', () => {
    expect(weekNumberLabel('2026-08-31', '2026-09-07')).toBe('Tuần 36');
    expect(monthNumberLabel('2026-08', '2026-09')).toBe('Tháng 8');
  });

  it('kèm năm khi khác năm, để "Tuần 1" không mơ hồ', () => {
    expect(weekNumberLabel('2027-01-04', '2026-12-28')).toBe('Tuần 1/2027');
    expect(monthNumberLabel('2025-12', '2026-01')).toBe('Tháng 12/2025');
  });

  it('không có mốc so sánh thì mặc định là cùng năm', () => {
    expect(weekNumberLabel('2026-08-31')).toBe('Tuần 36');
    expect(monthNumberLabel('2026-08')).toBe('Tháng 8');
  });
});
