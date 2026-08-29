/**
 * Sinh embedding cho giao dịch và đồng bộ sang Vectorize.
 *
 * Ghi vector diễn ra ngoài đường request chính (`ctx.waitUntil`), nên lỗi ở đây
 * không được phép làm hỏng thao tác của người dùng. Cột `transactions.embed_status`
 * đóng vai trò hàng đợi: 'pending'/'error' sẽ được `POST /api/admin/reindex` nhặt lại.
 */
import type { Direction, Recurrence } from '../../shared/types';
import type { Env } from '../env';
import { aiEnabled } from '../env';
import { setEmbedStatus } from '../db/queries';

/** Model đa ngữ, xử lý tiếng Việt tốt. 1024 chiều — phải khớp index Vectorize. */
export const EMBED_MODEL = '@cf/baai/bge-m3';
export const EMBED_DIMENSIONS = 1024;

export interface EmbeddableTransaction {
  id: string;
  household_id: string;
  occurred_on: string;
  note: string;
  detail: string;
  payee: string;
  amount: number;
  direction: Direction;
  recurrence: Recurrence;
  category_name: string | null;
}

/** Văn bản đem embed: gộp nội dung với các nhãn để tìm kiếm bắt được cả ngữ cảnh. */
export function embeddingText(tx: EmbeddableTransaction): string {
  const direction = tx.direction === 'income' ? 'khoản thu' : 'khoản chi';
  const recurrence = tx.recurrence === 'monthly' ? 'hàng tháng cố định' : 'phát sinh';
  const parts = [
    tx.note || '(không có nội dung)',
    tx.category_name ?? 'chưa phân loại',
    direction,
    recurrence,
    `ngày ${tx.occurred_on}`,
    `${tx.amount} đồng`,
  ];
  // Phần chi tiết và bên nhận chỉ có ở những khoản được ghi kỹ, thường là khoản
  // lớn — đưa vào embedding để hỏi đáp trả lời được "vì sao tháng này chi nhiều".
  if (tx.payee) parts.push(`bên nhận ${tx.payee}`);
  if (tx.detail) parts.push(tx.detail);
  return parts.join(' · ');
}

export async function embedTexts(env: Env, texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const res = (await env.AI.run(EMBED_MODEL as never, { text: texts } as never)) as unknown as {
    data: number[][];
  };
  if (!res?.data || res.data.length !== texts.length) {
    throw new Error('Workers AI trả về số embedding không khớp số văn bản gửi đi');
  }
  return res.data;
}

export async function embedQuery(env: Env, query: string): Promise<number[]> {
  const [vector] = await embedTexts(env, [query]);
  return vector;
}

/**
 * Đẩy một lô giao dịch lên Vectorize rồi đánh dấu embed_status.
 * `household_id` nằm trong metadata để lọc theo hộ khi truy vấn.
 */
export async function upsertTransactionVectors(
  env: Env,
  rows: EmbeddableTransaction[],
): Promise<{ ok: number; failed: number }> {
  if (rows.length === 0) return { ok: 0, failed: 0 };
  if (!aiEnabled(env)) {
    await setEmbedStatus(env.DB, rows.map((r) => r.id), 'skipped');
    return { ok: 0, failed: 0 };
  }

  try {
    const vectors = await embedTexts(env, rows.map(embeddingText));
    await env.VECTORIZE.upsert(
      rows.map((row, i) => ({
        id: row.id,
        values: vectors[i],
        metadata: {
          household_id: row.household_id,
          occurred_on: row.occurred_on,
          direction: row.direction,
          recurrence: row.recurrence,
        },
      })),
    );
    await setEmbedStatus(env.DB, rows.map((r) => r.id), 'ok');
    return { ok: rows.length, failed: 0 };
  } catch (err) {
    console.error('upsertTransactionVectors thất bại', err);
    await setEmbedStatus(env.DB, rows.map((r) => r.id), 'error');
    return { ok: 0, failed: rows.length };
  }
}

export async function deleteTransactionVector(env: Env, id: string): Promise<void> {
  if (!aiEnabled(env)) return;
  try {
    await env.VECTORIZE.deleteByIds([id]);
  } catch (err) {
    // Vector mồ côi chỉ gây nhiễu nhẹ: kết quả tìm kiếm được đối chiếu lại với
    // D1 (đã lọc deleted_at) nên giao dịch đã xoá không lọt ra ngoài.
    console.error('deleteTransactionVector thất bại', err);
  }
}

/** Nạp lại dữ liệu cần thiết rồi embed — dùng cho ghi lẻ sau khi tạo/sửa. */
export async function embedTransactionById(env: Env, householdId: string, id: string): Promise<void> {
  const row = await env.DB.prepare(
    `SELECT t.id, t.household_id, t.occurred_on, t.note, t.detail, t.payee,
            t.amount, t.direction, t.recurrence, c.name AS category_name
     FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
     WHERE t.household_id = ? AND t.id = ? AND t.deleted_at IS NULL`,
  )
    .bind(householdId, id)
    .first<EmbeddableTransaction>();
  if (!row) return;
  await upsertTransactionVectors(env, [row]);
}
