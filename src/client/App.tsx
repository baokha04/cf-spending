import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth-context';
import { Dashboard } from './pages/Dashboard';
import { Transactions } from './pages/Transactions';
import { Categories } from './pages/Categories';
import { Household } from './pages/Household';
import { Ask } from './pages/Ask';
import { Login } from './pages/Login';
import { Register } from './pages/Register';

const NAV = [
  { to: '/', label: 'Tổng quan', end: true },
  { to: '/giao-dich', label: 'Giao dịch' },
  { to: '/danh-muc', label: 'Danh mục' },
  { to: '/hoi-dap', label: 'Hỏi đáp' },
  { to: '/ho-gia-dinh', label: 'Hộ gia đình' },
];

function Shell({ children }: { children: React.ReactNode }) {
  const { me, logout } = useAuth();
  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">Chi tiêu gia đình</span>
        <nav>
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
        <button type="button" className="ghost" onClick={() => void logout()}>
          Đăng xuất
        </button>
      </header>
      <main>{children}</main>
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
        <Route path="/danh-muc" element={<RequireAuth><Categories /></RequireAuth>} />
        <Route path="/hoi-dap" element={<RequireAuth><Ask /></RequireAuth>} />
        <Route path="/ho-gia-dinh" element={<RequireAuth><Household /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
