import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Category, Transaction } from '../../shared/types';
import { api } from '../lib/api';
import { useExpiry } from '../lib/expiry-context';
import { useReturnTo } from '../lib/navigation';
import { SplitTransactionForm } from '../components/SplitTransactionForm';
import { TransactionForm } from '../components/TransactionForm';

export type EditorMode = 'create' | 'edit' | 'copy' | 'split';

const HEADINGS: Record<EditorMode, { title: string; sub: string }> = {
  create: {
    title: 'Thêm giao dịch',
    sub: 'Ghi ngay khi vừa chi để không quên khoản nhỏ.',
  },
  edit: {
    title: 'Sửa giao dịch',
    sub: 'Sửa xong lưu lại; mọi thay đổi ghi đè lên đúng bản ghi cũ.',
  },
  copy: {
    title: 'Sao chép giao dịch',
    sub: 'Đã điền sẵn theo giao dịch được chọn, ngày đổi thành hôm nay. Sửa lại rồi lưu thành giao dịch mới.',
  },
  split: {
    title: 'Tách giao dịch',
    sub: 'Cắt một phần số tiền ra thành giao dịch riêng. Khoản gốc bị trừ đúng chừng ấy nên tổng thu chi không đổi.',
  },
};

/**
 * Màn hình nhập một giao dịch — thêm, sửa, sao chép hoặc tách.
 *
 * Tách hẳn khỏi trang danh sách chứ không nằm cạnh nó: form và bảng cùng lúc
 * trên một màn hình thì trên điện thoại chẳng đủ chỗ cho cả hai, mà lúc đang gõ
 * cũng chẳng ai nhìn bảng. Bốn việc gộp vào một trang vì cả bốn đều là "một
 * giao dịch, một form, xong thì quay lại danh sách" — chỉ khác nhau ở dữ liệu
 * điền sẵn và ở API gọi lúc lưu.
 */
export function TransactionEditor({ mode }: { mode: EditorMode }) {
  const { id } = useParams();
  const { to, goBack } = useReturnTo('/giao-dich');
  const { refresh: refreshExpiry } = useExpiry();

  const [categories, setCategories] = useState<Category[]>([]);
  const [source, setSource] = useState<Transaction | null>(null);
  // 'create' không phải chờ giao dịch nào nên vào thẳng form được.
  const [loading, setLoading] = useState(mode !== 'create');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .categories()
      .then((r) => setCategories(r.categories))
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    if (mode === 'create' || !id) return;
    let cancelled = false;
    setLoading(true);
    api
      .transaction(id)
      .then((tx) => {
        if (cancelled) return;
        setSource(tx);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Không tải được giao dịch');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, id]);

  /** Lưu xong: về danh sách, và cập nhật cả chuông lẫn thẻ nhắc gia hạn. */
  function finish() {
    void refreshExpiry();
    goBack();
  }

  const heading = HEADINGS[mode];

  return (
    <>
      {/* Đường lui đặt trên tiêu đề, không phải nép bên phải: đây là màn hình con
          của danh sách, và trên điện thoại thì ngón cái với tới đầu trang dễ hơn. */}
      <Link className="back-link" to={to}>
        ← Danh sách giao dịch
      </Link>
      <div className="page-head">
        <div>
          <h1>{heading.title}</h1>
          <p className="page-sub">{heading.sub}</p>
        </div>
      </div>

      <section className="card form-page">
        {loading ? (
          <p className="empty">Đang tải…</p>
        ) : error ? (
          <div className="alert error">{error}</div>
        ) : mode === 'split' ? (
          source && (
            <SplitTransactionForm
              source={source}
              categories={categories}
              onSplit={finish}
              onCancel={() => goBack()}
            />
          )
        ) : (
          <TransactionForm
            categories={categories}
            editing={mode === 'edit' ? source : null}
            copying={mode === 'copy' ? source : null}
            onSaved={finish}
            onCancel={() => goBack()}
          />
        )}
      </section>
    </>
  );
}
