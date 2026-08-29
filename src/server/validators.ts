import { z } from 'zod';
import { DATE_RE, isValidDate, isValidMonth } from './dates';

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

export const transactionCreateSchema = z.object({
  occurredOn: isoDate,
  note: z.string().trim().max(500).default(''),
  detail: detailSchema.default(''),
  payee: payeeSchema.default(''),
  paymentMethod: paymentMethodSchema,
  amount: amountSchema,
  direction: z.enum(['income', 'expense']),
  recurrence: z.enum(['monthly', 'one_off']),
  categoryId: z.string().trim().min(1).nullish(),
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
    categoryId: z.string().trim().min(1).nullish(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Không có trường nào để cập nhật' });

export const largeQuerySchema = z.object({
  month: monthParam.optional(),
  /** Ngưỡng "khoản lớn" tính bằng đồng. */
  min: z.coerce.number().int().min(1).max(Number.MAX_SAFE_INTEGER).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export const askSchema = z.object({
  question: z.string().trim().min(3, 'Câu hỏi quá ngắn').max(500),
});

/** Gom lỗi zod thành một câu tiếng Việt để hiển thị thẳng lên UI. */
export function formatZodError(error: z.ZodError): string {
  return error.issues.map((i) => i.message).join('; ');
}
