import { z } from 'zod';
import { DATE_RE, isValidDate, isValidMonth } from './dates';
import { TIME_RE } from '../shared/time';
import { EXPIRY_WINDOW_DAYS, MAX_EXPIRY_WINDOW_DAYS } from '../shared/expiry';

const isoDate = z
  .string()
  .regex(DATE_RE, 'Ngày phải có dạng YYYY-MM-DD')
  .refine(isValidDate, 'Ngày không tồn tại');

export const monthParam = z.string().refine(isValidMonth, 'Tháng phải có dạng YYYY-MM');

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(254)
  .email('Email không hợp lệ');

export const passwordSchema = z
  .string()
  .min(8, 'Mật khẩu tối thiểu 8 ký tự')
  .max(200, 'Mật khẩu quá dài');

export const registerSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    displayName: z.string().trim().min(1, 'Cần nhập tên hiển thị').max(60),
    householdName: z.string().trim().min(1).max(80).optional(),
    inviteCode: z.string().trim().min(1).max(20).optional(),
  })
  .refine((v) => Boolean(v.householdName) !== Boolean(v.inviteCode), {
    message: 'Chọn một trong hai: tạo hộ mới hoặc nhập mã mời',
    path: ['householdName'],
  });

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
});

export const joinSchema = z.object({
  inviteCode: z.string().trim().min(1).max(20),
});

export const categoryCreateSchema = z.object({
  name: z.string().trim().min(1, 'Cần nhập tên danh mục').max(60),
  kind: z.enum(['income', 'expense']),
  icon: z.string().trim().max(8).nullish(),
});

export const categoryUpdateSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  icon: z.string().trim().max(8).nullish(),
  isArchived: z.boolean().optional(),
});

/**
 * Số tiền: nhận number hoặc chuỗi người dùng gõ ("1.500.000", "1,500,000").
 * VND không có đơn vị lẻ nên ép về số nguyên đồng.
 */
const amountSchema = z
  .union([z.number(), z.string()])
  .transform((v, ctx) => {
    const raw = typeof v === 'number' ? v : Number(v.replace(/[.,\s]/g, ''));
    if (!Number.isFinite(raw)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Số tiền không hợp lệ' });
      return z.NEVER;
    }
    const rounded = Math.round(raw);
    if (rounded <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Số tiền phải lớn hơn 0' });
      return z.NEVER;
    }
    if (rounded > Number.MAX_SAFE_INTEGER) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Số tiền quá lớn' });
      return z.NEVER;
    }
    return rounded;
  });

/** Hình thức thanh toán; null/chuỗi rỗng nghĩa là chưa ghi. */
const paymentMethodSchema = z
  .enum(['cash', 'bank', 'card', 'ewallet', 'other'])
  .nullish()
  .or(z.literal('').transform(() => null));

/** Mô tả dài cho một khoản — chỗ ghi thêm thông tin của các khoản lớn. */
const detailSchema = z.string().trim().max(2000, 'Phần chi tiết tối đa 2000 ký tự');
const payeeSchema = z.string().trim().max(120, 'Tên bên nhận/nguồn tiền tối đa 120 ký tự');

/**
 * Hạn phải từ ngày phát sinh trở đi; bằng nhau vẫn hợp lệ (khoản chỉ có giá trị
 * đúng hôm đó). Ràng buộc này không nằm ở CHECK trong SQLite vì thông báo lỗi
 * phải nói được bằng tiếng Việt.
 */
export const EXPIRY_ORDER_MESSAGE = 'Ngày hết hạn phải từ ngày phát sinh trở đi';

export const transactionCreateSchema = z
  .object({
    occurredOn: isoDate,
    note: z.string().trim().max(500).default(''),
    detail: detailSchema.default(''),
    payee: payeeSchema.default(''),
    paymentMethod: paymentMethodSchema,
    amount: amountSchema,
    direction: z.enum(['income', 'expense']),
    recurrence: z.enum(['monthly', 'one_off']),
    /** null hoặc bỏ trống nghĩa là khoản này không có hạn phải gia hạn. */
    expiresOn: isoDate.nullish(),
    categoryId: z.string().trim().min(1).nullish(),
  })
  .refine((v) => !v.expiresOn || v.expiresOn >= v.occurredOn, {
    message: EXPIRY_ORDER_MESSAGE,
    path: ['expiresOn'],
  });

export const transactionUpdateSchema = z
  .object({
    occurredOn: isoDate.optional(),
    note: z.string().trim().max(500).optional(),
    detail: detailSchema.optional(),
    payee: payeeSchema.optional(),
    paymentMethod: paymentMethodSchema,
    amount: amountSchema.optional(),
    direction: z.enum(['income', 'expense']).optional(),
    recurrence: z.enum(['monthly', 'one_off']).optional(),
    /** Gửi null để bỏ hạn; không gửi trường này thì hạn cũ giữ nguyên. */
    expiresOn: isoDate.nullish(),
    categoryId: z.string().trim().min(1).nullish(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Không có trường nào để cập nhật' });

/**
 * Tách một khoản làm hai: `amount` là phần cắt ra thành giao dịch mới, phần còn
 * lại ở nguyên khoản gốc.
 *
 * Chiều thu/chi, tính chất, ngày và hạn đều thừa kế từ khoản gốc nên không có ở
 * đây: tách là chia nhỏ đúng một sự việc đã xảy ra, tổng của hai mảnh phải bằng
 * số tiền ban đầu. Muốn đổi những thứ đó thì sửa từng khoản sau khi tách.
 *
 * Ràng buộc "phần còn lại vẫn lớn hơn 0" không kiểm được ở đây vì schema không
 * biết số tiền gốc; route so trước khi ghi, và CHECK (amount > 0) trong database
 * là chốt chặn cuối nếu có hai người tách cùng lúc.
 */
export const transactionSplitSchema = z.object({
  amount: amountSchema,
  note: z.string().trim().max(500).optional(),
  detail: detailSchema.optional(),
  payee: payeeSchema.optional(),
  paymentMethod: paymentMethodSchema,
  categoryId: z.string().trim().min(1).nullish(),
});

export const SPLIT_TOO_LARGE_MESSAGE =
  'Số tiền tách phải nhỏ hơn số tiền của khoản gốc, để khoản gốc còn lại lớn hơn 0';

/**
 * Danh sách nhắc gia hạn. `days` là cửa sổ nhắc: 0 nghĩa là chỉ những khoản
 * hết hạn hôm nay trở về trước.
 */
export const expiringQuerySchema = z.object({
  days: z.coerce
    .number()
    .int()
    .min(0)
    .max(MAX_EXPIRY_WINDOW_DAYS, `Cửa sổ nhắc tối đa ${MAX_EXPIRY_WINDOW_DAYS} ngày`)
    .default(EXPIRY_WINDOW_DAYS),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export const largeQuerySchema = z.object({
  month: monthParam.optional(),
  /** Ngưỡng "khoản lớn" tính bằng đồng. */
  min: z.coerce.number().int().min(1).max(Number.MAX_SAFE_INTEGER).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export const askSchema = z.object({
  question: z.string().trim().min(3, 'Câu hỏi quá ngắn').max(500),
});

/* ==================================================== lịch hoạt động ===== */

export const FAMILY_RELATIONS = ['bo', 'me', 'con', 'ong', 'ba', 'khac'] as const;
export const MEMBER_COLORS = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8'] as const;
export const ACTIVITY_KINDS = ['work', 'teach', 'study', 'other'] as const;

/** Khoảng ngày tối đa của một lần hỏi lịch — đủ cho lưới tháng 6×7 = 42 ô. */
export const MAX_SCHEDULE_SPAN_DAYS = 62;

const timeSchema = z.string().regex(TIME_RE, 'Giờ phải có dạng HH:MM');

/** Tham số ?kind= trên các endpoint lịch. */
export const activityKindParam = z.enum(ACTIVITY_KINDS);

/** Các thứ trong tuần; khử trùng và sắp tăng dần để lưu xuống luôn ở dạng chuẩn. */
const daysOfWeekSchema = z
  .array(z.number().int().min(1, 'Thứ không hợp lệ').max(7, 'Thứ không hợp lệ'))
  .min(1, 'Chọn ít nhất một thứ trong tuần')
  .max(7)
  .transform((days) => [...new Set(days)].sort((a, b) => a - b));

export const familyMemberCreateSchema = z.object({
  name: z.string().trim().min(1, 'Cần nhập tên thành viên').max(60),
  nickname: z.string().trim().max(30).default(''),
  relation: z.enum(FAMILY_RELATIONS).default('khac'),
  color: z.enum(MEMBER_COLORS),
  icon: z.string().trim().max(8).nullish(),
  birthDate: isoDate.nullish(),
  /** Gắn với tài khoản đăng nhập nào; bỏ trống cho người không có tài khoản. */
  userId: z.string().trim().min(1).nullish(),
  sortOrder: z.number().int().min(0).max(999).default(0),
});

export const familyMemberUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    nickname: z.string().trim().max(30).optional(),
    relation: z.enum(FAMILY_RELATIONS).optional(),
    color: z.enum(MEMBER_COLORS).optional(),
    icon: z.string().trim().max(8).nullish(),
    birthDate: isoDate.nullish(),
    userId: z.string().trim().min(1).nullish(),
    sortOrder: z.number().int().min(0).max(999).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Không có trường nào để cập nhật' });

/** Giờ kết thúc sớm hơn hoặc bằng giờ bắt đầu = ca qua đêm; bằng nhau là buổi dài 0. */
const timeRangeRefine = <T extends { startTime?: string; endTime?: string }>(v: T) =>
  v.startTime === undefined || v.endTime === undefined || v.startTime !== v.endTime;
const TIME_RANGE_MESSAGE = 'Giờ kết thúc phải khác giờ bắt đầu';

/** effectiveTo là mốc bao gồm, nên bằng effectiveFrom vẫn hợp lệ (buổi lẻ). */
const effectiveRangeRefine = <T extends { effectiveFrom?: string; effectiveTo?: string | null }>(
  v: T,
) => !v.effectiveFrom || !v.effectiveTo || v.effectiveTo >= v.effectiveFrom;
const EFFECTIVE_RANGE_MESSAGE = 'Ngày kết thúc phải từ ngày bắt đầu trở đi';

export const activityCreateSchema = z
  .object({
    memberId: z.string().trim().min(1, 'Cần chọn thành viên'),
    title: z.string().trim().min(1, 'Cần nhập tên hoạt động').max(80),
    kind: z.enum(ACTIVITY_KINDS),
    location: z.string().trim().max(120).default(''),
    note: z.string().trim().max(500).default(''),
    daysOfWeek: daysOfWeekSchema,
    startTime: timeSchema,
    endTime: timeSchema,
    effectiveFrom: isoDate,
    effectiveTo: isoDate.nullish(),
  })
  .refine(timeRangeRefine, { message: TIME_RANGE_MESSAGE, path: ['endTime'] })
  .refine(effectiveRangeRefine, { message: EFFECTIVE_RANGE_MESSAGE, path: ['effectiveTo'] });

export const activityUpdateSchema = z
  .object({
    memberId: z.string().trim().min(1).optional(),
    title: z.string().trim().min(1).max(80).optional(),
    kind: z.enum(ACTIVITY_KINDS).optional(),
    location: z.string().trim().max(120).optional(),
    note: z.string().trim().max(500).optional(),
    daysOfWeek: daysOfWeekSchema.optional(),
    startTime: timeSchema.optional(),
    endTime: timeSchema.optional(),
    effectiveFrom: isoDate.optional(),
    effectiveTo: isoDate.nullish(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Không có trường nào để cập nhật' })
  // Sửa một trong hai giờ thì phải gửi cả cặp — nếu không server không biết giờ
  // còn lại là bao nhiêu để tính lại độ dài.
  .refine((v) => (v.startTime === undefined) === (v.endTime === undefined), {
    message: 'Đổi giờ thì phải gửi cả giờ bắt đầu và giờ kết thúc',
    path: ['endTime'],
  })
  .refine(timeRangeRefine, { message: TIME_RANGE_MESSAGE, path: ['endTime'] })
  .refine(effectiveRangeRefine, { message: EFFECTIVE_RANGE_MESSAGE, path: ['effectiveTo'] });

export const activityExceptionSchema = z
  .object({
    occursOn: isoDate,
    status: z.enum(['cancelled', 'moved']),
    newDate: isoDate.nullish(),
    newStartTime: timeSchema.nullish(),
    newEndTime: timeSchema.nullish(),
    note: z.string().trim().max(200).default(''),
  })
  .refine((v) => v.status !== 'moved' || v.newDate || v.newStartTime, {
    message: 'Dời buổi thì phải đổi ngày hoặc đổi giờ',
    path: ['newDate'],
  })
  .refine((v) => Boolean(v.newStartTime) === Boolean(v.newEndTime), {
    message: 'Đổi giờ thì phải gửi cả giờ bắt đầu và giờ kết thúc',
    path: ['newEndTime'],
  })
  .refine((v) => !v.newStartTime || v.newStartTime !== v.newEndTime, {
    message: TIME_RANGE_MESSAGE,
    path: ['newEndTime'],
  })
  // 'cancelled' mà kèm ngày/giờ mới là mâu thuẫn — bắt sớm còn hơn lặng lẽ bỏ qua.
  .refine((v) => v.status !== 'cancelled' || !(v.newDate || v.newStartTime), {
    message: 'Nghỉ buổi thì không kèm ngày hay giờ mới',
    path: ['status'],
  });

export const scheduleQuerySchema = z
  .object({
    from: isoDate,
    to: isoDate,
    memberId: z.string().trim().min(1).optional(),
    kind: z.enum(ACTIVITY_KINDS).optional(),
  })
  .refine((v) => v.to >= v.from, { message: 'Ngày kết thúc phải từ ngày bắt đầu trở đi', path: ['to'] });

/** Gom lỗi zod thành một câu tiếng Việt để hiển thị thẳng lên UI. */
export function formatZodError(error: z.ZodError): string {
  return error.issues.map((i) => i.message).join('; ');
}
