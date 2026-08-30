import { Link } from 'react-router-dom';
import { useExpiry } from '../lib/expiry-context';

/**
 * Chuông trên thanh trên cùng: số khoản **đã quá hạn**.
 *
 * Chỉ đếm phần quá hạn chứ không gộp cả phần sắp hết hạn — con số trên huy hiệu
 * phải trả lời đúng một câu "có bao nhiêu thứ đang trễ". Phần sắp tới nằm ở thẻ
 * "Cần gia hạn", nơi có đủ chỗ để nói rõ còn mấy ngày.
 *
 * Không có khoản nào trễ thì chuông vẫn ở đó nhưng lặng: mất hẳn đi sẽ làm thanh
 * trên cùng nhảy chỗ mỗi lần gia hạn xong.
 */
export function ExpiryBell() {
  const { overdueCount, soonCount } = useExpiry();

  const label =
    overdueCount > 0
      ? `${overdueCount} khoản đã quá hạn, cần gia hạn`
      : soonCount > 0
        ? `Không có khoản nào quá hạn; ${soonCount} khoản sắp hết hạn`
        : 'Không có khoản nào cần gia hạn';

  return (
    <Link
      to="/giao-dich"
      className={`bell${overdueCount > 0 ? ' has-overdue' : ''}`}
      aria-label={label}
      title={label}
    >
      <svg
        width={20}
        height={20}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M18 8.5a6 6 0 1 0-12 0c0 4.5-1.5 5.8-2.2 6.4a.8.8 0 0 0 .5 1.4h15.4a.8.8 0 0 0 .5-1.4c-.7-.6-2.2-1.9-2.2-6.4z" />
        <path d="M10.2 19.5a2.1 2.1 0 0 0 3.6 0" />
      </svg>
      {/* Huy hiệu có chữ số chứ không phải chấm tròn: "3" nói được việc cần làm
          to đến đâu, còn chấm thì phải bấm vào mới biết. */}
      {overdueCount > 0 && (
        <span className="bell-badge" aria-hidden="true">
          {overdueCount > 99 ? '99+' : overdueCount}
        </span>
      )}
    </Link>
  );
}
