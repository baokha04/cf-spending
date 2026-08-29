/**
 * Hỏi đáp về chi tiêu (RAG).
 *
 * Nguyên tắc: LLM không được tự cộng số. Mọi con số tổng hợp đều tính sẵn bằng
 * SQL rồi mới đưa vào prompt; mô hình chỉ diễn giải. Giao dịch liên quan lấy từ
 * tìm kiếm ngữ nghĩa và được trả về UI làm nguồn để người dùng đối chiếu.
 */
import type { AskResponse, DashboardSummary } from '../../shared/types';
import type { Env } from '../env';
import { aiEnabled } from '../env';
import { semanticSearch } from './search';

export const ANSWER_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
export const ANSWER_MODEL_FALLBACK = '@cf/meta/llama-3.1-8b-instruct-fast';
const CONTEXT_TRANSACTIONS = 12;

const vnd = new Intl.NumberFormat('vi-VN');

function money(n: number): string {
  return `${vnd.format(n)} đ`;
}

function totalsBlock(label: string, month: string, t: DashboardSummary['totals']['current']): string {
  return [
    `${label} (${month}):`,
    `  - Tổng thu: ${money(t.income)}`,
    `  - Tổng chi: ${money(t.expense)}`,
    `  - Chênh lệch thu trừ chi: ${money(t.net)}`,
    `  - Trong đó chi cố định hàng tháng: ${money(t.monthlyExpense)}`,
    `  - Trong đó chi phát sinh: ${money(t.oneOffExpense)}`,
    `  - Số giao dịch: ${t.count}`,
  ].join('\n');
}

export function buildPrompt(question: string, summary: DashboardSummary, lines: string[]): string {
  const categories = summary.byCategory
    .filter((c) => c.kind === 'expense' && (c.current > 0 || c.previous > 0))
    .slice(0, 15)
    .map((c) => `  - ${c.name}: tháng này ${money(c.current)}, tháng trước ${money(c.previous)}`)
    .join('\n');

  return [
    'SỐ LIỆU TỔNG HỢP (đã tính chính xác từ cơ sở dữ liệu, không được tính lại):',
    totalsBlock('Tháng hiện tại', summary.months.current, summary.totals.current),
    totalsBlock('Tháng trước', summary.months.previous, summary.totals.previous),
    '',
    'CHI THEO DANH MỤC:',
    categories || '  (chưa có dữ liệu)',
    '',
    'CÁC GIAO DỊCH LIÊN QUAN TỚI CÂU HỎI:',
    lines.length > 0 ? lines.join('\n') : '  (không tìm thấy giao dịch liên quan)',
    '',
    `CÂU HỎI: ${question}`,
  ].join('\n');
}

const SYSTEM_PROMPT = [
  'Bạn là trợ lý phân tích chi tiêu gia đình. Trả lời bằng tiếng Việt, ngắn gọn, tối đa 6 câu.',
  'Chỉ dùng số liệu được cung cấp. Các con số tổng hợp đã được tính sẵn — hãy trích dẫn lại,',
  'tuyệt đối không tự cộng trừ để tạo ra con số mới. Nếu dữ liệu không đủ để trả lời,',
  'hãy nói thẳng là chưa đủ dữ liệu thay vì suy đoán.',
].join(' ');

export async function askAboutSpending(
  env: Env,
  householdId: string,
  question: string,
  summary: DashboardSummary,
): Promise<AskResponse> {
  const search = await semanticSearch(env, householdId, question, CONTEXT_TRANSACTIONS);
  const sources = search.hits.map((h) => h.transaction);

  if (!aiEnabled(env)) {
    return {
      answer:
        'Tính năng hỏi đáp AI đang tắt (AI_FEATURES=off). Dưới đây là các giao dịch khớp từ khoá để bạn tự đối chiếu.',
      sources,
      mode: search.mode,
    };
  }

  const lines = sources.map(
    (t) =>
      `  - ${t.occurredOn} | ${t.direction === 'income' ? 'Thu' : 'Chi'} | ${money(t.amount)} | ` +
      `${t.categoryName ?? 'chưa phân loại'} | ${t.recurrence === 'monthly' ? 'hàng tháng' : 'phát sinh'} | ${t.note}`,
  );
  const prompt = buildPrompt(question, summary, lines);

  for (const model of [ANSWER_MODEL, ANSWER_MODEL_FALLBACK]) {
    try {
      const res = (await env.AI.run(model as never, {
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        max_tokens: 600,
      } as never)) as unknown as { response?: string };
      const answer = res?.response?.trim();
      if (answer) return { answer, sources, mode: search.mode };
    } catch (err) {
      console.error(`Model ${model} lỗi`, err);
    }
  }

  return {
    answer: 'Không tạo được câu trả lời lúc này. Bạn xem tạm các giao dịch liên quan bên dưới nhé.',
    sources,
    mode: search.mode,
  };
}
