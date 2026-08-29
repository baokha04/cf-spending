import { useEffect, useState } from 'react';

/**
 * Theo dõi một media query. Dùng cho những chỗ CSS không với tới được —
 * chủ yếu là biểu đồ Recharts, nơi bề rộng trục và chiều cao phải truyền
 * vào bằng số chứ không đặt được bằng stylesheet.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(query).matches,
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    setMatches(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/**
 * Ngưỡng "điện thoại". 720px bao trọn iPhone 16 Pro (402pt) và 16 Pro Max
 * (440pt) ở chiều dọc, đồng thời khớp với breakpoint trong styles.css —
 * hai bên phải đổi cùng nhau.
 */
export const PHONE_QUERY = '(max-width: 720px)';

export function useIsPhone(): boolean {
  return useMediaQuery(PHONE_QUERY);
}
