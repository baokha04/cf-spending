/**
 * Bố cục cho lưới lịch.
 *
 * Server trả về buổi ở dạng logic (một bản ghi, có thể dài qua nửa đêm). Việc
 * bẻ đôi để vẽ và việc xếp các khối chồng giờ nằm cạnh nhau là chuyện của giao
 * diện, nên gom cả ở đây.
 */
import type { MemberColor, Occurrence } from '../../shared/types';
import { MINUTES_PER_DAY } from '../../shared/time';
import { addDaysISO } from './format';

/** Một đoạn để vẽ: luôn nằm gọn trong một ngày. */
export interface Segment {
  occurrence: Occurrence;
  /** Ngày của cột chứa đoạn này. */
  date: string;
  startMinute: number;
  endMinute: number;
  /** Đoạn đuôi của một ca qua đêm — vẽ ở cột hôm sau, không phải buổi mới. */
  isTail: boolean;
}

/**
 * Ca 22:00–06:00 thành hai đoạn: 22:00–24:00 ở cột hôm nay và 00:00–06:00 ở cột
 * hôm sau. Buổi trong ngày trả về đúng một đoạn.
 */
export function splitOvernight(occurrence: Occurrence): Segment[] {
  const end = occurrence.startMinute + occurrence.durationMin;
  if (end <= MINUTES_PER_DAY) {
    return [
      {
        occurrence,
        date: occurrence.date,
        startMinute: occurrence.startMinute,
        endMinute: end,
        isTail: false,
      },
    ];
  }
  return [
    {
      occurrence,
      date: occurrence.date,
      startMinute: occurrence.startMinute,
      endMinute: MINUTES_PER_DAY,
      isTail: false,
    },
    {
      occurrence,
      date: addDaysISO(occurrence.date, 1),
      startMinute: 0,
      endMinute: end - MINUTES_PER_DAY,
      isTail: true,
    },
  ];
}

/** Vị trí của một khối trong cột ngày, tính theo phần trăm. */
export interface PlacedSegment extends Segment {
  /** Cột con thứ mấy trong cụm chồng giờ. */
  column: number;
  /** Cụm này rộng mấy cột con. */
  columns: number;
}

/**
 * Xếp các đoạn trong cùng một ngày sao cho khối chồng giờ nằm cạnh nhau chứ
 * không đè lên nhau.
 *
 * Gom thành cụm giao nhau bắc cầu rồi tô màu tham lam theo lối đồ thị khoảng:
 * mỗi đoạn nhận cột con rảnh sớm nhất, cả cụm dùng chung số cột để các khối
 * thẳng hàng. Đây chính là chỗ nhìn ra ai bận cùng lúc với ai.
 */
export function layoutOverlaps(segments: Segment[]): PlacedSegment[] {
  const sorted = [...segments].sort(
    (a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute,
  );

  const out: PlacedSegment[] = [];
  let cluster: PlacedSegment[] = [];
  /** Phút kết thúc của từng cột con trong cụm đang mở. */
  let columnEnds: number[] = [];

  const closeCluster = () => {
    const width = columnEnds.length;
    for (const placed of cluster) placed.columns = width;
    out.push(...cluster);
    cluster = [];
    columnEnds = [];
  };

  for (const segment of sorted) {
    // Không giao với bất kỳ đoạn nào đang mở → cụm cũ khép lại.
    if (columnEnds.length > 0 && columnEnds.every((end) => end <= segment.startMinute)) {
      closeCluster();
    }
    let column = columnEnds.findIndex((end) => end <= segment.startMinute);
    if (column === -1) {
      column = columnEnds.length;
      columnEnds.push(segment.endMinute);
    } else {
      columnEnds[column] = segment.endMinute;
    }
    cluster.push({ ...segment, column, columns: 1 });
  }
  if (cluster.length > 0) closeCluster();

  return out;
}

/** Cửa sổ giờ hiển thị của lưới tuần. */
export interface HourWindow {
  startMinute: number;
  endMinute: number;
}

const DEFAULT_WINDOW: HourWindow = { startMinute: 6 * 60, endMinute: 22 * 60 };

/**
 * Cửa sổ giờ bám theo dữ liệu thật, làm tròn ra giờ chẵn và đệm một tiếng mỗi
 * đầu. Vẽ cứng 0–24h thì trên điện thoại mỗi khối chỉ còn vài pixel.
 */
export function hourWindow(segments: Segment[]): HourWindow {
  if (segments.length === 0) return DEFAULT_WINDOW;
  const earliest = Math.min(...segments.map((s) => s.startMinute));
  const latest = Math.max(...segments.map((s) => s.endMinute));
  return {
    startMinute: Math.max(0, Math.floor(earliest / 60) * 60 - 60),
    endMinute: Math.min(MINUTES_PER_DAY, Math.ceil(latest / 60) * 60 + 60),
  };
}

/** Biến thể màu của một thành viên. `soft` là nền khối, còn lại là màu nhận dạng. */
export function memberColorVar(color: MemberColor, variant: 'solid' | 'soft' = 'solid'): string {
  return variant === 'soft' ? `var(--member-${color}-soft)` : `var(--member-${color})`;
}
