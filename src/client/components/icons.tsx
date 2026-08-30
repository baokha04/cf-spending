/**
 * Biểu tượng cho các nút thao tác trên từng dòng dữ liệu.
 *
 * Vẽ bằng SVG nét như thanh tab: sắc ở màn hình 3x của iPhone Pro, và
 * `currentColor` để tự đổi theo màu nút, theo nền sáng/tối. Nút chỉ có biểu
 * tượng nên nơi gọi **bắt buộc** phải đặt `aria-label` — không có nhãn thì trình
 * đọc màn hình chỉ đọc được "nút", còn người dùng chuột thì mất cả tooltip.
 */

export type ActionIconName =
  | 'expand'
  | 'collapse'
  | 'copy'
  | 'split'
  | 'edit'
  | 'delete'
  | 'restore';

const PATHS: Record<ActionIconName, JSX.Element> = {
  // Mũi nhọn xuống / lên: mở và đóng phần chi tiết của dòng.
  expand: <path d="m6 9 6 6 6-6" />,
  collapse: <path d="m6 15 6-6 6 6" />,
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h8" />
    </>
  ),
  // Một dòng chảy tới rồi rẽ làm hai — đúng việc mà nút tách làm.
  split: (
    <>
      <path d="M3 12h4" />
      <path d="M7 12c5 0 5-6 10-6h3" />
      <path d="M7 12c5 0 5 6 10 6h3" />
      <path d="m17 3 3 3-3 3" />
      <path d="m17 15 3 3-3 3" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20.5 4.9 16 15.6 5.3a2 2 0 0 1 2.8 0l1.3 1.3a2 2 0 0 1 0 2.8L9 20.1z" />
      <path d="m14.5 6.4 3.1 3.1" />
    </>
  ),
  delete: (
    <>
      <path d="M4 7h16" />
      <path d="M9.5 7V5.2a1.2 1.2 0 0 1 1.2-1.2h2.6a1.2 1.2 0 0 1 1.2 1.2V7" />
      <path d="m6.5 7 .9 12.1A1.9 1.9 0 0 0 9.3 21h5.4a1.9 1.9 0 0 0 1.9-1.9L17.5 7" />
    </>
  ),
  // Mũi tên vòng ngược chiều kim đồng hồ: quay lại trạng thái trước khi xoá.
  restore: (
    <>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3 8.8" />
      <path d="M3 4.5V9h4.5" />
    </>
  ),
};

export function ActionIcon({ name }: { name: ActionIconName }) {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
