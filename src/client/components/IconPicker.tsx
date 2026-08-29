import { useEffect, useMemo, useRef, useState } from 'react';
import { filterGroups, findIcon } from '../lib/icons';

interface Props {
  value: string;
  onChange: (icon: string) => void;
  /** Dùng cho nút mở bảng chọn, để `<label htmlFor>` trỏ đúng chỗ. */
  id: string;
}

/**
 * Chọn biểu tượng từ danh sách cố định thay vì gõ emoji bằng tay.
 *
 * Nút hiện biểu tượng đang chọn; bấm vào mở bảng có ô tìm và các nhóm. Bảng
 * đóng khi chọn xong, khi bấm ra ngoài, hoặc khi bấm Esc.
 */
export function IconPicker({ value, onChange, id }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  // Neo bảng vào mép phải khi mở ra sát rìa màn hình, không thì nó lòi ra ngoài.
  const [alignRight, setAlignRight] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setAlignRight(false);
      return;
    }
    const box = panel.current?.getBoundingClientRect();
    if (box && box.right > document.documentElement.clientWidth - 8) setAlignRight(true);
  }, [open]);

  const groups = useMemo(() => filterGroups(query), [query]);
  // Biểu tượng cũ nhập tay (từ trước khi có bảng chọn) vẫn hiện được trên nút.
  const known = findIcon(value);

  function pick(icon: string) {
    onChange(icon);
    setOpen(false);
    setQuery('');
  }

  return (
    <div className="icon-picker" ref={root}>
      <button
        type="button"
        id={id}
        className="icon-trigger"
        aria-expanded={open}
        aria-haspopup="dialog"
        title={value ? (known?.label ?? value) : 'Chọn biểu tượng'}
        onClick={() => setOpen((prev) => !prev)}
      >
        {value ? (
          <span className="icon-glyph">{value}</span>
        ) : (
          <span className="icon-empty">Chọn</span>
        )}
      </button>

      {open && (
        <div
          ref={panel}
          className={`icon-panel${alignRight ? ' align-right' : ''}`}
          role="dialog"
          aria-label="Chọn biểu tượng"
        >
          <div className="icon-panel-head">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm: ăn, xe, điện…"
              aria-label="Tìm biểu tượng"
            />
            <button type="button" className="ghost" onClick={() => pick('')}>
              Bỏ biểu tượng
            </button>
          </div>

          <div className="icon-panel-body">
            {groups.length === 0 ? (
              <p className="empty" style={{ padding: 16 }}>
                Không có biểu tượng nào khớp.
              </p>
            ) : (
              groups.map((group) => (
                <div key={group.title} className="icon-group">
                  <p className="icon-group-title">{group.title}</p>
                  <div className="icon-grid">
                    {group.icons.map((option) => (
                      <button
                        key={option.icon}
                        type="button"
                        className="icon-option"
                        aria-label={option.label}
                        aria-pressed={value === option.icon}
                        title={option.label}
                        onClick={() => pick(option.icon)}
                      >
                        {option.icon}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
