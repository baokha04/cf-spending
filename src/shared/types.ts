/** Kiểu dùng chung giữa Pages Functions và React client. */

export type Direction = 'income' | 'expense';
export type Recurrence = 'monthly' | 'one_off';
/** Hình thức thanh toán; null nghĩa là chưa ghi. */
export type PaymentMethod = 'cash' | 'bank' | 'card' | 'ewallet' | 'other';
export type MemberRole = 'owner' | 'member';

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
}

export interface Household {
  id: string;
  name: string;
  inviteCode: string;
  currency: string;
  role: MemberRole;
}

export interface MeResponse {
  user: SessionUser;
  household: Household;
}

export interface Member {
  userId: string;
  displayName: string;
  email: string;
  role: MemberRole;
  joinedAt: number;
}

export interface Category {
  id: string;
  name: string;
  kind: Direction;
  icon: string | null;
  isArchived: boolean;
  /** Khác null nghĩa là đã xoá mềm: không chọn được nữa nhưng khôi phục lại được. */
  deletedAt: number | null;
}

export interface Transaction {
  id: string;
  occurredOn: string; // YYYY-MM-DD
  note: string;
  /** Mô tả dài: lý do chi, gồm những gì, kèm chứng từ nào… Rỗng là chưa ghi. */
  detail: string;
  /** Trả cho ai / nhận từ đâu. Rỗng là chưa ghi. */
  payee: string;
  paymentMethod: PaymentMethod | null;
  amount: number; // đồng, luôn dương
  direction: Direction;
  recurrence: Recurrence;
  /**
   * Ngày phải gia hạn hoặc làm lại khoản này ('YYYY-MM-DD'); null là không có
   * hạn. Bảo hiểm, tiền thuê nhà, gói cước… — mốc để nhắc trước khi tới hạn.
   */
  expiresOn: string | null;
  categoryId: string | null;
  categoryName: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: number;
  updatedAt: number;
  /** Khác null nghĩa là đã xoá mềm: vẫn hiện trong danh sách nhưng không vào số liệu. */
  deletedAt: number | null;
}

/** Một khoản sắp tới hạn, kèm sẵn số ngày còn lại tính theo hôm nay của server. */
export interface ExpiringTransaction {
  transaction: Transaction;
  /** Số ngày còn lại: 0 là hết hạn hôm nay, âm là đã quá hạn. */
  daysLeft: number;
}

export interface ExpiringResponse {
  /** Hôm nay theo giờ Việt Nam — mốc mà `daysLeft` đếm từ đó. */
  today: string;
  /** Cửa sổ nhắc, tính bằng ngày. */
  days: number;
  /** Đã quá hạn mà chưa gia hạn; cũ nhất đứng trước. */
  overdue: ExpiringTransaction[];
  /** Hết hạn từ hôm nay tới hết cửa sổ nhắc; gần nhất đứng trước. */
  soon: ExpiringTransaction[];
}

export interface TransactionPage {
  items: Transaction[];
  nextCursor: string | null;
}

export interface MonthTotals {
  income: number;
  expense: number;
  net: number;
  monthlyExpense: number; // chi cố định hàng tháng
  oneOffExpense: number; // chi phát sinh
  monthlyIncome: number;
  oneOffIncome: number;
  count: number;
}

export interface CategoryBreakdownRow {
  categoryId: string | null;
  name: string;
  kind: Direction;
  current: number;
  previous: number;
  delta: number;
}

export interface DailyPoint {
  /** Ngày trong tháng, 1..31 */
  day: number;
  current: number;
  previous: number;
}

export interface DashboardSummary {
  months: { current: string; previous: string };
  currency: string;
  totals: { current: MonthTotals; previous: MonthTotals };
  byCategory: CategoryBreakdownRow[];
  dailyExpense: DailyPoint[];
  recent: Transaction[];
}

/** Một chiều thu hoặc chi trong báo cáo khoản lớn. */
export interface LargeTransactionGroup {
  items: Transaction[];
  /** Tổng của riêng các khoản vượt ngưỡng. */
  total: number;
  /** Tổng toàn tháng của chiều này, để tính tỷ trọng. */
  monthTotal: number;
  count: number;
  monthCount: number;
  /** Số khoản lớn chưa ghi chi tiết — phần cần bổ sung thông tin. */
  missingDetail: number;
}

export interface LargeTransactionsResponse {
  month: string;
  threshold: number;
  currency: string;
  income: LargeTransactionGroup;
  expense: LargeTransactionGroup;
}

export interface SearchHit {
  transaction: Transaction;
  score: number;
}

export interface SearchResponse {
  mode: 'semantic' | 'keyword';
  hits: SearchHit[];
  /** Có giá trị khi phải rơi về tìm kiếm từ khoá. */
  notice?: string;
}

export interface AskResponse {
  answer: string;
  sources: Transaction[];
  mode: 'semantic' | 'keyword';
}

export interface ApiError {
  error: string;
}

/* ==================================================== lịch hoạt động ===== */

export type FamilyRelation = 'bo' | 'me' | 'con' | 'ong' | 'ba' | 'khac';
/** Khoá màu, không phải mã hex — bảng màu nằm trong CSS nên sáng/tối mỗi bên một giá trị. */
export type MemberColor = 'c1' | 'c2' | 'c3' | 'c4' | 'c5' | 'c6' | 'c7' | 'c8';
export type ActivityKind = 'work' | 'teach' | 'study' | 'other';
/** ISO-8601: 1 = Thứ 2 … 7 = Chủ nhật. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface FamilyMember {
  id: string;
  name: string;
  nickname: string;
  relation: FamilyRelation;
  color: MemberColor;
  icon: string | null;
  birthDate: string | null; // YYYY-MM-DD
  /** Tài khoản đăng nhập gắn với người này; null nghĩa là người không có tài khoản. */
  userId: string | null;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
  /** Khác null nghĩa là đã xoá mềm: lịch của họ biến khỏi calendar nhưng khôi phục được. */
  deletedAt: number | null;
}

/** Khuôn mẫu lặp hàng tuần, chưa phải buổi cụ thể. */
export interface Activity {
  id: string;
  memberId: string;
  memberName: string;
  title: string;
  kind: ActivityKind;
  location: string;
  note: string;
  daysOfWeek: Weekday[];
  startTime: string; // 'HH:MM'
  endTime: string; // 'HH:MM'
  durationMin: number;
  /** Kết thúc rơi sang hôm sau. */
  overnight: boolean;
  effectiveFrom: string;
  /** Bao gồm; null nghĩa là chưa có ngày kết thúc. */
  effectiveTo: string | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

/** Ngoại lệ của đúng một buổi: nghỉ hẳn, hoặc dời ngày/giờ. */
export interface ActivityException {
  id: string;
  activityId: string;
  /** Ngày của buổi gốc theo khuôn mẫu. */
  occursOn: string;
  status: 'cancelled' | 'moved';
  newDate: string | null;
  newStartTime: string | null;
  newDurationMin: number | null;
  note: string;
}

/** Một buổi cụ thể đã trải ra từ khuôn mẫu, đã áp ngoại lệ. */
export interface Occurrence {
  activityId: string;
  memberId: string;
  title: string;
  kind: ActivityKind;
  location: string;
  /** Ngày buổi bắt đầu. Ca qua đêm kết thúc ở hôm sau. */
  date: string;
  startTime: string;
  endTime: string;
  startMinute: number;
  durationMin: number;
  overnight: boolean;
  /** Ngày gốc theo khuôn mẫu — khoá để tạo hoặc xoá ngoại lệ đúng buổi này. */
  sourceDate: string;
  /** Buổi này đã bị một ngoại lệ dời giờ hoặc dời ngày. */
  moved: boolean;
}

export interface ScheduleResponse {
  from: string;
  /** Bao gồm. */
  to: string;
  members: FamilyMember[];
  occurrences: Occurrence[];
}
