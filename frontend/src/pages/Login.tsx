import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../api/client';

export default function Login() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(password);
      navigate('/');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '登录失败');
    }
    setLoading(false);
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-secondary)',
    }}>
      <form onSubmit={handleSubmit} style={{
        width: 320, padding: 32, borderRadius: 12,
        background: 'var(--bg-primary)', border: '1px solid var(--border-soft)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12, margin: '0 auto 12px',
            background: 'linear-gradient(135deg, #833AB4, #FD1D1D, #F77737)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg viewBox="0 0 24 24" style={{ width: 26, height: 26, fill: '#fff' }}>
              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
            </svg>
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>InstaBot</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>AI 客服助手</div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="输入管理密码"
            autoFocus
            style={{ width: '100%', padding: '10px 12px', fontSize: 14 }}
          />
        </div>

        {error && (
          <div style={{
            marginBottom: 12, padding: '8px 12px', borderRadius: 6,
            background: '#fef2f2', color: '#dc2626', fontSize: 12,
          }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          className="btn-primary"
          disabled={loading || !password}
          style={{ width: '100%', padding: '10px 0', fontSize: 14, opacity: loading || !password ? 0.5 : 1 }}
        >
          {loading ? '登录中...' : '登录'}
        </button>
      </form>
    </div>
  );
}
