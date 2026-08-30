import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth-context';
import { useTheme } from './lib/theme';
import { THEME_LABEL, nextMode } from '../shared/theme';
import { Dashboard } from './pages/Dashboard';
import { Transactions } from './pages/Transactions';
import { LargeTransactions } from './pages/LargeTransactions';
import { Categories } from './pages/Categories';
import { Household } from './pages/Household';
import { Ask } from './pages/Ask';
import { Login } from './pages/Login';
import { Register } from './pages/Register';

/**
 * Biểu tượng thanh tab. Vẽ bằng SVG nét để sắc ở màn hình 3x của iPhone Pro,
 * currentColor để tự đổi màu theo trạng thái chọn và theo nền sáng/tối.
 */
function TabIcon({ name }: { name: string }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  switch (name) {
    case 'overview':
      return (
        <svg {...common}>
          <path d="M3 20h18" />
          <path d="M6 20V11" />
          <path d="M12 20V5" />
          <path d="M18 20v-6" />
        </svg>
      );
    case 'transactions':
      return (
        <svg {...common}>
          <path d="M4 7h11" />
          <path d="m12 4 3 3-3 3" />
          <path d="M20 17H9" />
          <path d="m12 14-3 3 3 3" />
        </svg>
      );
    case 'categories':
      return (
        <svg {...common}>
          <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h4.2a2 2 0 0 1 1.4.6l8.3 8.3a2 2 0 0 1 0 2.8l-4.3 4.3a2 2 0 0 1-2.8 0L4 11.7a2 2 0 0 1-.6-1.4z" />
          <circle cx="7.8" cy="8.2" r="1.2" />
        </svg>
      );
    case 'large':
      // Đường gấp có một đỉnh nhô cao — hình ảnh của khoản bất thường trong tháng.
      return (
        <svg {...common}>
          <path d="M3 16h3l3.5-9 4 12 3-7h4.5" />
        </svg>
      );
    case 'ask':
      return (
        <svg {...common}>
          <path d="M21 12a8 8 0 0 1-8 8H7l-4 3 1.2-4.2A8 8 0 1 1 21 12z" />
          <path d="M9.7 9.5a2.4 2.4 0 0 1 4.6.8c0 1.6-2.3 2-2.3 3.2" />
          <path d="M12 17h.01" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M3 20v-1.5A4.5 4.5 0 0 1 7.5 14h2A4.5 4.5 0 0 1 14 18.5V20" />
          <circle cx="8.5" cy="8" r="3.2" />
          <path d="M16 20v-1.6a4.4 4.4 0 0 0-2.3-3.8" />
          <path d="M15.5 5.2a3.2 3.2 0 0 1 0 5.6" />
        </svg>
      );
  }
}

/**
 * Nút xoay vòng giao diện: Theo máy → Sáng → Tối → Theo máy.
 *
 * Ba trạng thái chứ không phải hai, vì "theo máy" là hành vi mặc định xưa nay —
 * nút hai trạng thái sẽ khoá mất đường quay về nó. Chỉ có một biểu tượng nên
 * nhãn nằm ở aria-label/title, và nói luôn bấm nữa thì sang chế độ gì.
 */
function ThemeToggle() {
  const { mode, cycle } = useTheme();
  const common = {
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  const icon =
    mode === 'light' ? (
      <svg {...common}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    ) : mode === 'dark' ? (
      <svg {...common}>
        <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
      </svg>
    ) : (
      <svg {...common}>
        <rect x="2.5" y="4" width="19" height="12.5" rx="2" />
        <path d="M8.5 20.5h7M12 16.5v4" />
      </svg>
    );

  const label = `Giao diện: ${THEME_LABEL[mode]}. Bấm để chuyển sang ${THEME_LABEL[nextMode(mode)]}.`;
  return (
    <button type="button" className="ghost theme-toggle" onClick={cycle} aria-label={label} title={label}>
      {icon}
    </button>
  );
}

const NAV = [
  // shortLabel: nhãn cho thanh tab hẹp trên điện thoại (mỗi tab ~78pt).
  { to: '/', label: 'Tổng quan', shortLabel: 'Tổng quan', icon: 'overview', end: true },
  { to: '/giao-dich', label: 'Giao dịch', shortLabel: 'Giao dịch', icon: 'transactions' },
  { to: '/khoan-lon', label: 'Khoản lớn', shortLabel: 'Khoản lớn', icon: 'large' },
  { to: '/danh-muc', label: 'Danh mục', shortLabel: 'Danh mục', icon: 'categories' },
  { to: '/hoi-dap', label: 'Hỏi đáp', shortLabel: 'Hỏi đáp', icon: 'ask' },
  { to: '/ho-gia-dinh', label: 'Hộ gia đình', shortLabel: 'Gia đình', icon: 'household' },
];

function Shell({ children }: { children: React.ReactNode }) {
  const { me, logout } = useAuth();
  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">Chi tiêu gia đình</span>
        {/* Điều hướng ngang chỉ dùng ở màn hình rộng; điện thoại dùng .tabbar. */}
        <nav className="nav-wide">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `navlink${isActive ? ' active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <span className="spacer" />
        <span className="who">
          {me?.user.displayName} · {me?.household.name}
        </span>
        <ThemeToggle />
        <button type="button" className="ghost" onClick={() => void logout()}>
          Đăng xuất
        </button>
      </header>
      <main>{children}</main>
      {/* Thanh tab cố định ở đáy, nằm trong tầm ngón cái trên iPhone. */}
      <nav className="tabbar" aria-label="Điều hướng chính">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `tab${isActive ? ' active' : ''}`}
          >
            <TabIcon name={item.icon} />
            <span className="tab-label">{item.shortLabel}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { me, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="auth-wrap">Đang tải…</div>;
  if (!me) return <Navigate to="/dang-nhap" replace state={{ from: location.pathname }} />;
  return <Shell>{children}</Shell>;
}

function GuestOnly({ children }: { children: React.ReactNode }) {
  const { me, loading } = useAuth();
  if (loading) return <div className="auth-wrap">Đang tải…</div>;
  if (me) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/dang-nhap" element={<GuestOnly><Login /></GuestOnly>} />
        <Route path="/dang-ky" element={<GuestOnly><Register /></GuestOnly>} />
        <Route path="/" element={<RequireAuth><Dashboard /></RequireAuth>} />
        <Route path="/giao-dich" element={<RequireAuth><Transactions /></RequireAuth>} />
        <Route path="/khoan-lon" element={<RequireAuth><LargeTransactions /></RequireAuth>} />
        <Route path="/danh-muc" element={<RequireAuth><Categories /></RequireAuth>} />
        <Route path="/hoi-dap" element={<RequireAuth><Ask /></RequireAuth>} />
        <Route path="/ho-gia-dinh" element={<RequireAuth><Household /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
