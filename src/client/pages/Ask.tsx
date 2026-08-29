import { useState } from 'react';
import type { AskResponse, SearchResponse } from '../../shared/types';
import { api } from '../lib/api';
import { TransactionTable } from '../components/TransactionTable';

const SUGGESTIONS = [
  'Tháng này tiêu nhiều nhất vào đâu?',
  'Chi cố định tháng này có tăng so với tháng trước không?',
  'Những khoản ăn uống lớn gần đây',
];

export function Ask() {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<AskResponse | null>(null);
  const [search, setSearch] = useState<SearchResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function ask(text: string) {
    const q = text.trim();
    if (q.length < 3) return;
    setBusy(true);
    setError(null);
    setSearch(null);
    try {
      setAnswer(await api.ask(q));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không hỏi được');
    } finally {
      setBusy(false);
    }
  }

  async function runSearch() {
    const q = question.trim();
    if (q.length < 2) return;
    setBusy(true);
    setError(null);
    setAnswer(null);
    try {
      setSearch(await api.search(q));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tìm được');
    } finally {
      setBusy(false);
    }
  }

  async function reindex() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.reindex();
      setNotice(
        `Đã đồng bộ ${res.ok}/${res.processed} giao dịch lên chỉ mục tìm kiếm.` +
          (res.hasMore ? ' Vẫn còn giao dịch chờ, bấm lại để chạy tiếp.' : ''),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không đồng bộ được');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <h1>Tìm kiếm và hỏi đáp</h1>
        <button type="button" onClick={() => void reindex()} disabled={busy}>
          Đồng bộ chỉ mục
        </button>
      </div>

      <section className="card">
        <h2 className="card-title">Hỏi bằng câu chữ tự nhiên</h2>
        <p className="card-sub">
          Tìm kiếm hiểu theo ý nghĩa, không cần khớp đúng từ. Câu trả lời luôn kèm giao dịch nguồn để bạn đối chiếu.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void ask(question);
          }}
        >
          <div className="toolbar" style={{ marginBottom: 10 }}>
            <div className="field" style={{ flex: '1 1 320px' }}>
              <label htmlFor="q">Câu hỏi hoặc từ khoá</label>
              <input
                id="q"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Tháng này tiêu nhiều nhất vào đâu?"
              />
            </div>
            <button type="submit" className="primary" disabled={busy || question.trim().length < 3}>
              {busy ? 'Đang xử lý…' : 'Hỏi AI'}
            </button>
            <button type="button" onClick={() => void runSearch()} disabled={busy || question.trim().length < 2}>
              Chỉ tìm giao dịch
            </button>
          </div>
        </form>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              className="ghost"
              style={{ border: '1px solid var(--border)', fontSize: '0.82rem' }}
              onClick={() => {
                setQuestion(s);
                void ask(s);
              }}
              disabled={busy}
            >
              {s}
            </button>
          ))}
        </div>
      </section>

      {error && <div className="alert error">{error}</div>}
      {notice && <div className="alert info">{notice}</div>}

      {answer && (
        <section className="card">
          <h2 className="card-title">Trả lời</h2>
          <p className="card-sub">
            {answer.mode === 'semantic'
              ? 'Dựa trên số liệu tổng hợp và các giao dịch bên dưới'
              : 'Tìm kiếm ngữ nghĩa không khả dụng — đang dùng khớp từ khoá'}
          </p>
          <p style={{ whiteSpace: 'pre-wrap', marginTop: 0 }}>{answer.answer}</p>
          <h3 style={{ marginTop: 18, marginBottom: 8 }}>Giao dịch nguồn</h3>
          <TransactionTable items={answer.sources} onChanged={() => void ask(question)} compact />
        </section>
      )}

      {search && (
        <section className="card">
          <h2 className="card-title">Kết quả tìm kiếm</h2>
          <p className="card-sub">
            {search.notice ?? `Tìm theo ngữ nghĩa · ${search.hits.length} kết quả`}
          </p>
          <TransactionTable
            items={search.hits.map((h) => h.transaction)}
            onChanged={() => void runSearch()}
            compact
          />
        </section>
      )}
    </>
  );
}
