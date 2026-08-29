/**
 * Bộ biểu tượng cố định cho danh mục.
 *
 * Gõ emoji bằng bàn phím thì mỗi máy một kiểu và dễ ra ký tự lạ, nên chọn từ
 * danh sách này. Nhãn tiếng Việt vừa là `aria-label` cho nút, vừa là từ khoá
 * cho ô tìm trong bảng chọn.
 *
 * Mọi biểu tượng của bộ danh mục mặc định (`DEFAULT_CATEGORIES`) đều phải có
 * mặt ở đây để hai nơi không lệch nhau.
 */

export interface IconOption {
  icon: string;
  label: string;
}

export interface IconGroup {
  title: string;
  icons: IconOption[];
}

export const ICON_GROUPS: IconGroup[] = [
  {
    title: 'Ăn uống',
    icons: [
      { icon: '🍜', label: 'ăn uống, mì, phở' },
      { icon: '🍚', label: 'cơm' },
      { icon: '🍲', label: 'nấu ăn, lẩu' },
      { icon: '🥗', label: 'rau, salad' },
      { icon: '🍎', label: 'trái cây' },
      { icon: '🥩', label: 'thịt' },
      { icon: '🐟', label: 'cá, hải sản' },
      { icon: '🍞', label: 'bánh mì' },
      { icon: '☕', label: 'cà phê' },
      { icon: '🧋', label: 'trà sữa, nước' },
      { icon: '🍺', label: 'bia rượu, nhậu' },
      { icon: '🎂', label: 'bánh kem, sinh nhật' },
    ],
  },
  {
    title: 'Đi lại',
    icons: [
      { icon: '🛵', label: 'xe máy, đi lại' },
      { icon: '🚗', label: 'ô tô, xe hơi' },
      { icon: '⛽', label: 'xăng dầu' },
      { icon: '🚌', label: 'xe buýt' },
      { icon: '🚕', label: 'taxi, xe ôm' },
      { icon: '🚲', label: 'xe đạp' },
      { icon: '✈️', label: 'máy bay, du lịch' },
      { icon: '🚆', label: 'tàu hoả' },
      { icon: '🅿️', label: 'gửi xe, bãi đỗ' },
      { icon: '🔧', label: 'sửa xe, bảo dưỡng' },
    ],
  },
  {
    title: 'Nhà cửa',
    icons: [
      { icon: '🏠', label: 'nhà cửa, tiền nhà' },
      { icon: '💡', label: 'điện' },
      { icon: '💧', label: 'nước' },
      { icon: '🔥', label: 'gas' },
      { icon: '🌐', label: 'internet, mạng' },
      { icon: '📶', label: 'điện thoại, cước' },
      { icon: '🛋️', label: 'nội thất' },
      { icon: '🛏️', label: 'phòng ngủ, chăn ga' },
      { icon: '🧹', label: 'dọn dẹp, giúp việc' },
      { icon: '🧺', label: 'giặt là' },
      { icon: '🧴', label: 'đồ dùng, hoá phẩm' },
      { icon: '🪑', label: 'bàn ghế' },
    ],
  },
  {
    title: 'Sức khoẻ',
    icons: [
      { icon: '💊', label: 'thuốc, y tế' },
      { icon: '🏥', label: 'bệnh viện' },
      { icon: '🩺', label: 'khám bệnh' },
      { icon: '🦷', label: 'nha khoa, răng' },
      { icon: '👓', label: 'mắt kính' },
      { icon: '💪', label: 'tập gym, thể thao' },
      { icon: '🧘', label: 'yoga, thư giãn' },
      { icon: '🛡️', label: 'bảo hiểm' },
    ],
  },
  {
    title: 'Học hành',
    icons: [
      { icon: '📚', label: 'giáo dục, sách' },
      { icon: '🏫', label: 'trường học, học phí' },
      { icon: '✏️', label: 'dụng cụ học tập' },
      { icon: '🎒', label: 'cặp sách' },
      { icon: '💻', label: 'máy tính, thiết bị' },
      { icon: '🎓', label: 'tốt nghiệp, khoá học' },
    ],
  },
  {
    title: 'Giải trí',
    icons: [
      { icon: '🎬', label: 'phim ảnh, rạp' },
      { icon: '🎮', label: 'trò chơi, game' },
      { icon: '📺', label: 'truyền hình, thuê bao' },
      { icon: '🎧', label: 'nhạc, tai nghe' },
      { icon: '🎤', label: 'karaoke, hát' },
      { icon: '⚽', label: 'bóng đá, thể thao' },
      { icon: '🏖️', label: 'nghỉ mát, biển' },
      { icon: '🎨', label: 'nghệ thuật, sở thích' },
    ],
  },
  {
    title: 'Mua sắm',
    icons: [
      { icon: '🛍️', label: 'mua sắm' },
      { icon: '🛒', label: 'đi chợ, siêu thị' },
      { icon: '👕', label: 'quần áo' },
      { icon: '👟', label: 'giày dép' },
      { icon: '👜', label: 'túi xách, phụ kiện' },
      { icon: '💄', label: 'mỹ phẩm, làm đẹp' },
      { icon: '💇', label: 'cắt tóc, salon' },
      { icon: '📱', label: 'điện thoại, đồ công nghệ' },
      { icon: '🎁', label: 'quà tặng, thưởng' },
    ],
  },
  {
    title: 'Gia đình',
    icons: [
      { icon: '👶', label: 'em bé, con nhỏ' },
      { icon: '🧒', label: 'con cái' },
      { icon: '👵', label: 'ông bà, biếu' },
      { icon: '🐶', label: 'thú cưng, chó' },
      { icon: '🐱', label: 'thú cưng, mèo' },
      { icon: '💐', label: 'hoa, lễ nghĩa' },
      { icon: '💍', label: 'cưới hỏi, ma chay' },
      { icon: '🙏', label: 'cúng lễ, từ thiện' },
    ],
  },
  {
    title: 'Tiền bạc',
    icons: [
      { icon: '💰', label: 'lương, tiền' },
      { icon: '💵', label: 'tiền mặt' },
      { icon: '💳', label: 'thẻ, trả góp' },
      { icon: '🏦', label: 'ngân hàng, tiết kiệm' },
      { icon: '📈', label: 'kinh doanh, đầu tư' },
      { icon: '📊', label: 'chứng khoán, lãi' },
      { icon: '🪙', label: 'thu khác, lặt vặt' },
      { icon: '🧾', label: 'hoá đơn, thuế' },
      { icon: '🤝', label: 'hợp đồng, làm thêm' },
      { icon: '🏆', label: 'thưởng, giải' },
      { icon: '🐖', label: 'heo đất, để dành' },
      { icon: '🎯', label: 'mục tiêu' },
    ],
  },
  {
    title: 'Khác',
    icons: [
      { icon: '📦', label: 'chi khác, linh tinh' },
      { icon: '⭐', label: 'quan trọng' },
      { icon: '🔖', label: 'đánh dấu' },
      { icon: '🗂️', label: 'hồ sơ, giấy tờ' },
      { icon: '⏰', label: 'định kỳ, hàng tháng' },
      { icon: '🌱', label: 'cây cối, vườn' },
      { icon: '❓', label: 'chưa rõ' },
    ],
  },
];

/** Toàn bộ biểu tượng, phẳng — dùng để tra nhanh một icon có trong bộ hay không. */
export const ALL_ICONS: IconOption[] = ICON_GROUPS.flatMap((g) => g.icons);

export function findIcon(icon: string): IconOption | undefined {
  return ALL_ICONS.find((i) => i.icon === icon);
}

/** Lọc theo từ khoá tiếng Việt, bỏ dấu để gõ "an uong" cũng ra "ăn uống". */
export function filterGroups(query: string): IconGroup[] {
  const needle = normalize(query);
  if (!needle) return ICON_GROUPS;
  return ICON_GROUPS.map((group) => ({
    title: group.title,
    icons: group.icons.filter(
      (i) => normalize(i.label).includes(needle) || normalize(group.title).includes(needle),
    ),
  })).filter((group) => group.icons.length > 0);
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .trim();
}
