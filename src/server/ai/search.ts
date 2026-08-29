/**
 * Tìm kiếm giao dịch theo ngữ nghĩa.
 *
 * Cô lập dữ liệu hai lớp: lọc `household_id` ngay trong truy vấn Vectorize, rồi
 * nạp lại bản ghi từ D1 cũng với `household_id` — metadata của vector có thể cũ
 * hoặc sai, D1 mới là nguồn sự thật.
 */
import type { SearchResponse, Transaction } from '../../shared/types';
import type { Env } from '../env';
import { aiEnabled } from '../env';
import { getTransactionsByIds, listTransactions } from '../db/queries';
import { embedQuery } from './embed';

export const SEARCH_TOP_K = 20;

async function keywordFallback(
  env: Env,
  householdId: string,
  query: string,
  limit: number,
  notice: string,
): Promise<SearchResponse> {
  const { items } = await listTransactions(env.DB, householdId, { q: query, limit });
  return {
    mode: 'keyword',
    hits: items.map((transaction) => ({ transaction, score: 0 })),
    notice,
  };
}

export async function semanticSearch(
  env: Env,
  householdId: string,
  query: string,
  limit = SEARCH_TOP_K,
): Promise<SearchResponse> {
  if (!aiEnabled(env)) {
    return keywordFallback(env, householdId, query, limit, 'Tính năng AI đang tắt — dùng tìm kiếm từ khoá.');
  }

  let matches: VectorizeMatches;
  try {
    const vector = await embedQuery(env, query);
    matches = await env.VECTORIZE.query(vector, {
      topK: limit,
      filter: { household_id: householdId },
      returnMetadata: 'indexed',
    });
  } catch (err) {
    console.error('semanticSearch thất bại, rơi về từ khoá', err);
    return keywordFallback(env, householdId, query, limit, 'Tìm kiếm ngữ nghĩa tạm lỗi — dùng tìm kiếm từ khoá.');
  }

  const ids = matches.matches.map((m) => m.id);
  const rows = await getTransactionsByIds(env.DB, householdId, ids);
  const byId = new Map<string, Transaction>(rows.map((t) => [t.id, t]));

  // Giữ nguyên thứ tự điểm số của Vectorize; bỏ id không còn trong D1
  // (đã xoá mềm, hoặc vector mồ côi của hộ khác).
  const hits = matches.matches
    .map((m) => {
      const transaction = byId.get(m.id);
      return transaction ? { transaction, score: m.score } : null;
    })
    .filter((h): h is { transaction: Transaction; score: number } => h !== null);

  return { mode: 'semantic', hits };
}
