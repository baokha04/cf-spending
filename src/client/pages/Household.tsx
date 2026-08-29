import { useCallback, useEffect, useState } from 'react';
import type { Member } from '../../shared/types';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { fullDateLabel } from '../lib/format';

export function Household() {
  const { me, setMe, refresh } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setMembers((await api.members()).members);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được danh sách thành viên');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!me) return null;
  const { household, user } = me;

  async function rotate() {
    if (!confirm('Đổi mã mời? Mã cũ sẽ không dùng được nữa.')) return;
    setError(null);
    try {
      const res = await api.rotateInviteCode();
      setNotice(`Mã mời mới: ${res.inviteCode}`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không đổi được mã mời');
    }
  }

  async function join(e: React.FormEvent) {
    e.preventDefault();
    if (!confirm('Chuyển sang hộ gia đình khác? Bạn sẽ không còn thấy số liệu của hộ hiện tại.')) return;
    setError(null);
    setNotice(null);
    try {
      setMe(await api.joinHousehold(joinCode));
      setJoinCode('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không vào được hộ gia đình');
    }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(household.inviteCode);
      setNotice('Đã chép mã mời.');
    } catch {
      setNotice(`Mã mời: ${household.inviteCode}`);
    }
  }

  return (
    <>
      <div className="page-head">
        <h1>Hộ gia đình</h1>
      </div>

      {error && <div className="alert error">{error}</div>}
      {notice && <div className="alert info">{notice}</div>}

      <section className="card">
        <h2 className="card-title">{household.name}</h2>
        <p className="card-sub">
          Bạn là {household.role === 'owner' ? 'chủ hộ' : 'thành viên'} · Đơn vị tiền {household.currency}
        </p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Mã mời:</span>
          <span className="code">{household.inviteCode}</span>
          <button type="button" onClick={() => void copyCode()}>
            Chép mã
          </button>
          {household.role === 'owner' && (
            <button type="button" onClick={() => void rotate()}>
              Đổi mã
            </button>
          )}
        </div>
        <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginBottom: 0 }}>
          Người nhà dùng mã này khi đăng ký để vào chung hộ và thấy chung số liệu.
        </p>
      </section>

      <section className="card">
        <h2 className="card-title">Thành viên</h2>
        <p className="card-sub">{members.length} người</p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Tên</th>
                <th>Email</th>
                <th>Vai trò</th>
                <th>Tham gia</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.userId}>
                  <td>
                    {m.displayName}
                    {m.userId === user.id && <span className="pill" style={{ marginLeft: 8 }}>Bạn</span>}
                  </td>
                  <td>{m.email}</td>
                  <td>{m.role === 'owner' ? 'Chủ hộ' : 'Thành viên'}</td>
                  <td>{fullDateLabel(new Date(m.joinedAt).toISOString().slice(0, 10))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2 className="card-title">Chuyển sang hộ khác</h2>
        <p className="card-sub">
          Mỗi tài khoản thuộc đúng một hộ tại một thời điểm. Nhập mã mời để chuyển.
        </p>
        <form onSubmit={join} className="toolbar" style={{ marginBottom: 0 }}>
          <div className="field" style={{ flex: '1 1 200px' }}>
            <label htmlFor="join-code">Mã mời</label>
            <input
              id="join-code"
              required
              placeholder="ABCD-EFGH"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
            />
          </div>
          <button type="submit">Chuyển hộ</button>
        </form>
      </section>
    </>
  );
}
