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
  categoryId: string | null;
  categoryName: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: number;
  updatedAt: number;
  /** Khác null nghĩa là đã xoá mềm: vẫn hiện trong danh sách nhưng không vào số liệu. */
  deletedAt: number | null;
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
