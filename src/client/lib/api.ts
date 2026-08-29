import type {
  AskResponse,
  Category,
  DashboardSummary,
  LargeTransactionsResponse,
  MeResponse,
  Member,
  PaymentMethod,
  SearchResponse,
  Transaction,
  TransactionPage,
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
  createTransaction: (body: TransactionInput) => post<Transaction>('/transactions', body),
  updateTransaction: (id: string, body: Partial<TransactionInput>) =>
    request<Transaction>(`/transactions/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteTransaction: (id: string) =>
    request<{ deleted: boolean }>(`/transactions/${id}`, { method: 'DELETE' }),
  restoreTransaction: (id: string) => post<Transaction>(`/transactions/${id}/restore`),

  dashboard: (month: string) => request<DashboardSummary>(`/dashboard/summary?month=${month}`),

  search: (q: string) => request<SearchResponse>(`/search?q=${encodeURIComponent(q)}`),
  ask: (question: string) => post<AskResponse>('/ask', { question }),
  reindex: () =>
    post<{ processed: number; ok: number; failed: number; hasMore: boolean }>('/admin/reindex'),
};
