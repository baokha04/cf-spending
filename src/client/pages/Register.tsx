import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';

type Mode = 'create' | 'join';

export function Register() {
  const { setMe } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('create');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [householdName, setHouseholdName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setMe(
        await api.register({
          email,
          password,
          displayName,
          ...(mode === 'create' ? { householdName } : { inviteCode }),
        }),
      );
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tạo tài khoản thất bại');
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <h1>Tạo tài khoản</h1>
        <p className="sub">Mỗi tài khoản thuộc về một hộ gia đình. Cả nhà cùng hộ thì thấy chung số liệu.</p>

        <form onSubmit={submit}>
          {error && <div className="alert error">{error}</div>}

          <div className="field">
            <label htmlFor="displayName">Tên hiển thị</label>
            <input
              id="displayName"
              required
              maxLength={60}
              placeholder="Khoa"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="password">Mật khẩu (tối thiểu 8 ký tự)</label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="field">
            <span style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: 4, fontWeight: 500 }}>
              Hộ gia đình
            </span>
            <div className="segmented">
              <button type="button" aria-pressed={mode === 'create'} onClick={() => setMode('create')}>
                Tạo hộ mới
              </button>
              <button type="button" aria-pressed={mode === 'join'} onClick={() => setMode('join')}>
                Vào hộ có sẵn
              </button>
            </div>
          </div>

          {mode === 'create' ? (
            <div className="field">
              <label htmlFor="householdName">Tên hộ gia đình</label>
              <input
                id="householdName"
                required
                maxLength={80}
                placeholder="Nhà mình"
                value={householdName}
                onChange={(e) => setHouseholdName(e.target.value)}
              />
            </div>
          ) : (
            <div className="field">
              <label htmlFor="inviteCode">Mã mời</label>
              <input
                id="inviteCode"
                required
                placeholder="ABCD-EFGH"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
              />
            </div>
          )}

          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Đang tạo…' : 'Tạo tài khoản'}
          </button>
        </form>

        <p className="auth-foot">
          Đã có tài khoản? <Link to="/dang-nhap">Đăng nhập</Link>
        </p>
      </div>
    </div>
  );
}
