import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, isoWeekday, startOfIsoWeek } from '../src/server/dates';
import {
  MINUTES_PER_DAY,
  durationBetween,
  isOvernight,
  isValidTime,
  toMinutes,
  toTimeLabel,
} from '../src/shared/time';

describe('toán ngày cho lịch', () => {
  it('cộng ngày qua mốc tháng và mốc năm', () => {
    expect(addDays('2026-08-30', 1)).toBe('2026-08-31');
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('cộng ngày đúng ở năm nhuận', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2028-02-29', 1)).toBe('2028-03-01');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
  });

  it('thứ theo ISO: Thứ 2 là 1, Chủ nhật là 7', () => {
    expect(isoWeekday('2026-08-30')).toBe(7); // Chủ nhật
    expect(isoWeekday('2026-08-31')).toBe(1); // Thứ 2
    expect(isoWeekday('2026-09-05')).toBe(6); // Thứ 7
  });

  it('đầu tuần luôn là Thứ 2, kể cả khi hỏi từ Chủ nhật', () => {
    expect(startOfIsoWeek('2026-08-31')).toBe('2026-08-31');
    expect(startOfIsoWeek('2026-09-06')).toBe('2026-08-31'); // Chủ nhật cuối tuần đó
    expect(isoWeekday(startOfIsoWeek('2026-09-03'))).toBe(1);
  });

  it('đếm ngày giữa hai mốc, có dấu', () => {
    expect(daysBetween('2026-08-31', '2026-09-06')).toBe(6);
    expect(daysBetween('2026-09-06', '2026-08-31')).toBe(-6);
    expect(daysBetween('2026-08-31', '2026-08-31')).toBe(0);
  });
});

describe('giờ trong ngày', () => {
  it('nhận đúng chuỗi HH:MM hợp lệ', () => {
    for (const ok of ['00:00', '09:05', '18:30', '23:59']) expect(isValidTime(ok)).toBe(true);
    for (const bad of ['24:00', '9:05', '18:60', '18h30', '', '18:5']) {
      expect(isValidTime(bad)).toBe(false);
    }
  });

  it('đổi giờ sang phút và ngược lại là khứ hồi', () => {
    for (const t of ['00:00', '06:15', '18:30', '23:59']) {
      expect(toTimeLabel(toMinutes(t))).toBe(t);
    }
    expect(toMinutes('18:30')).toBe(1110);
  });

  it('phút vượt nửa đêm hiện ra giờ hôm sau', () => {
    expect(toTimeLabel(toMinutes('22:00') + 480)).toBe('06:00');
    expect(toTimeLabel(MINUTES_PER_DAY)).toBe('00:00');
  });

  it('độ dài ca thường và ca qua đêm', () => {
    expect(durationBetween(toMinutes('18:00'), toMinutes('20:00'))).toBe(120);
    // Kết thúc sớm hơn bắt đầu nghĩa là qua đêm.
    expect(durationBetween(toMinutes('22:00'), toMinutes('06:00'))).toBe(480);
    expect(durationBetween(toMinutes('23:30'), toMinutes('00:00'))).toBe(30);
  });

  it('buổi dài 0 phút bị từ chối', () => {
    expect(durationBetween(toMinutes('09:00'), toMinutes('09:00'))).toBeNull();
  });

  it('nhận ra buổi tràn sang hôm sau', () => {
    expect(isOvernight(toMinutes('22:00'), 480)).toBe(true);
    expect(isOvernight(toMinutes('18:00'), 120)).toBe(false);
    // Kết thúc đúng nửa đêm vẫn là trong ngày.
    expect(isOvernight(toMinutes('23:00'), 60)).toBe(false);
  });
});
