import type {
  Activity,
  ActivityException,
  ActivityKind,
  AskResponse,
  Category,
  DashboardSummary,
  ExpiringResponse,
  FamilyMember,
  FamilyRelation,
  LargeTransactionsResponse,
  MeResponse,
  Member,
  MemberColor,
  PaymentMethod,
  ScheduleResponse,
  SearchResponse,
  Transaction,
  TransactionPage,
  Weekday,
} from '../../shared/types';

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  });

  if (!res.ok) {
    let message = `Lỗi ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      /* phản hồi không phải JSON — giữ thông báo mặc định */
    }
    throw new ApiError(message, res.status);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });

function query(params: Record<string, string | number | undefined | null>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}

export interface TransactionInput {
  occurredOn: string;
  note: string;
  detail: string;
  payee: string;
  paymentMethod: PaymentMethod | null;
  amount: number | string;
  direction: 'income' | 'expense';
  recurrence: 'monthly' | 'one_off';
  /** null nghĩa là không có hạn; gửi null khi sửa để bỏ hạn đang có. */
  expiresOn: string | null;
  categoryId: string | null;
}

export interface TransactionQuery {
  from?: string;
  to?: string;
  direction?: string;
  recurrence?: string;
  categoryId?: string;
  q?: string;
  /** '1' để kèm cả giao dịch đã xoá mềm. */
  includeDeleted?: '1';
  limit?: number;
  cursor?: string;
}

export interface FamilyMemberInput {
  name: string;
  nickname?: string;
  relation?: FamilyRelation;
  color: MemberColor;
  icon?: string | null;
  birthDate?: string | null;
  /** Tài khoản đăng nhập gắn với người này; null cho người không có tài khoản. */
  userId?: string | null;
  sortOrder?: number;
}

export interface ActivityInput {
  memberId: string;
  title: string;
  kind: ActivityKind;
  location?: string;
  note?: string;
  daysOfWeek: Weekday[];
  /** 'HH:MM'. Kết thúc sớm hơn bắt đầu nghĩa là ca qua đêm. */
  startTime: string;
  endTime: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
}

export interface ExceptionInput {
  occursOn: string;
  status: 'cancelled' | 'moved';
  newDate?: string | null;
  newStartTime?: string | null;
  newEndTime?: string | null;
  note?: string;
}

export const api = {
  register: (body: {
    email: string;
    password: string;
    displayName: string;
    householdName?: string;
    inviteCode?: string;
  }) => post<MeResponse>('/auth/register', body),

  login: (body: { email: string; password: string }) => post<MeResponse>('/auth/login', body),
  logout: () => post<{ ok: true }>('/auth/logout'),
  me: () => request<MeResponse>('/auth/me'),

  members: () => request<{ members: Member[] }>('/household/members'),
  joinHousehold: (inviteCode: string) => post<MeResponse>('/household/join', { inviteCode }),
  rotateInviteCode: () => post<{ inviteCode: string }>('/household/invite-code/rotate'),

  categories: (options: { includeArchived?: boolean; includeDeleted?: boolean } = {}) =>
    request<{ categories: Category[] }>(
      `/categories${query({
        includeArchived: options.includeArchived ? '1' : undefined,
        includeDeleted: options.includeDeleted ? '1' : undefined,
      })}`,
    ),
  /** `restored` báo rằng tên này thuộc một danh mục đã xoá và nó vừa được dựng lại. */
  createCategory: (body: { name: string; kind: 'income' | 'expense'; icon?: string | null }) =>
    post<Category & { restored?: boolean }>('/categories', body),
  updateCategory: (id: string, body: { name?: string; icon?: string | null; isArchived?: boolean }) =>
    request<Category>(`/categories/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteCategory: (id: string) =>
    request<{ deleted: boolean; transactions: number }>(`/categories/${id}`, { method: 'DELETE' }),
  restoreCategory: (id: string) => post<Category>(`/categories/${id}/restore`),

  transactions: (q: TransactionQuery = {}) =>
    request<TransactionPage>(`/transactions${query({ ...q })}`),
  transaction: (id: string) => request<Transaction>(`/transactions/${id}`),
  largeTransactions: (q: { month?: string; min?: number; limit?: number } = {}) =>
    request<LargeTransactionsResponse>(`/transactions/large${query({ ...q })}`),
  /** Khoản quá hạn và khoản hết hạn trong `days` ngày tới; mặc định một tuần. */
  expiringTransactions: (q: { days?: number; limit?: number } = {}) =>
    request<ExpiringResponse>(`/transactions/expiring${query({ ...q })}`),
  createTransaction: (body: TransactionInput) => post<Transaction>('/transactions', body),
  updateTransaction: (id: string, body: Partial<TransactionInput>) =>
    request<Transaction>(`/transactions/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteTransaction: (id: string) =>
    request<{ deleted: boolean }>(`/transactions/${id}`, { method: 'DELETE' }),
  restoreTransaction: (id: string) => post<Transaction>(`/transactions/${id}/restore`),

  dashboard: (month: string) => request<DashboardSummary>(`/dashboard/summary?month=${month}`),

  familyMembers: (options: { includeDeleted?: boolean } = {}) =>
    request<{ members: FamilyMember[] }>(
      `/family-members${query({ includeDeleted: options.includeDeleted ? '1' : undefined })}`,
    ),
  createFamilyMember: (body: FamilyMemberInput) => post<FamilyMember>('/family-members', body),
  updateFamilyMember: (id: string, body: Partial<FamilyMemberInput>) =>
    request<FamilyMember>(`/family-members/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  /** `activities` là số hoạt động của người này — để nói rõ hậu quả của việc xoá. */
  deleteFamilyMember: (id: string) =>
    request<{ deleted: boolean; activities: number }>(`/family-members/${id}`, { method: 'DELETE' }),
  restoreFamilyMember: (id: string) => post<FamilyMember>(`/family-members/${id}/restore`),

  activities: (options: { memberId?: string; kind?: ActivityKind; includeDeleted?: boolean } = {}) =>
    request<{ activities: Activity[] }>(
      `/activities${query({
        memberId: options.memberId,
        kind: options.kind,
        includeDeleted: options.includeDeleted ? '1' : undefined,
      })}`,
    ),
  createActivity: (body: ActivityInput) => post<Activity>('/activities', body),
  updateActivity: (id: string, body: Partial<ActivityInput>) =>
    request<Activity>(`/activities/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteActivity: (id: string) =>
    request<{ deleted: boolean }>(`/activities/${id}`, { method: 'DELETE' }),
  restoreActivity: (id: string) => post<Activity>(`/activities/${id}/restore`),

  /** Chép cả lịch của một người sang một người khác; ngoại lệ không đi theo. */
  copySchedule: (body: { fromMemberId: string; toMemberId: string }) =>
    post<{ copied: number; fromName: string; toName: string }>('/activities/copy', body),

  exceptions: (activityId: string) =>
    request<{ exceptions: ActivityException[] }>(`/activities/${activityId}/exceptions`),
  addException: (activityId: string, body: ExceptionInput) =>
    post<ActivityException>(`/activities/${activityId}/exceptions`, body),
  removeException: (activityId: string, occursOn: string) =>
    request<{ deleted: boolean }>(`/activities/${activityId}/exceptions/${occursOn}`, {
      method: 'DELETE',
    }),

  /** Một endpoint cho cả lưới tuần lẫn lưới tháng; `to` là mốc bao gồm. */
  schedule: (q: { from: string; to: string; memberId?: string; kind?: ActivityKind }) =>
    request<ScheduleResponse>(`/schedule${query({ ...q })}`),

  search: (q: string) => request<SearchResponse>(`/search?q=${encodeURIComponent(q)}`),
  ask: (question: string) => post<AskResponse>('/ask', { question }),
  reindex: () =>
    post<{ processed: number; ok: number; failed: number; hasMore: boolean }>('/admin/reindex'),
};
