import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { simulateComment } from '../api/client';
import type { SimulateResult } from '../types';

export default function Simulate() {
  const [commentText, setCommentText] = useState('');
  const [username, setUsername] = useState('test_user');
  const [results, setResults] = useState<SimulateResult[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const run = async () => {
    if (!commentText.trim()) return;
    setLoading(true);
    try {
      const result = await simulateComment(commentText, username);
      setResults([result, ...results]);
    } catch { alert('测试失败'); }
    setLoading(false);
  };

  return (
    <div className="flex-col" style={{ height: '100%' }}>
      {/* Panel Header */}
      <div className="panel-header">
        <div>
          <div className="panel-title">模拟测试</div>
          <div className="panel-sub">模拟评论触发自动回复</div>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="scroll-y">
        {/* Mock Instagram Post Card */}
        <div className="card mb-16" style={{ maxWidth: 560, padding: 16 }}>
          {/* Post header */}
          <div className="flex items-center gap-8" style={{ paddingBottom: 12, marginBottom: 12, borderBottom: '0.5px solid var(--border-soft)' }}>
            <div className="avatar avatar-sm" style={{ width: 32, height: 32, background: 'var(--bg-secondary)' }}>
              <svg style={{ width: 16, height: 16, color: 'var(--text-tertiary)' }} fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
            </div>
            <div>
              <div className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>your_brand</div>
              <span className="tag-pill" style={{ background: 'var(--bg-secondary)', color: 'var(--text-tertiary)' }}>赞助</span>
            </div>
          </div>

          {/* Image placeholder */}
          <div className="flex items-center justify-center mb-12" style={{ background: 'var(--bg-secondary)', borderRadius: 8, height: 160 }}>
            <span className="text-xs">图片区域</span>
          </div>

          {/* Username input */}
          <div className="field">
            <label className="uppercase-label" style={{ display: 'block', marginBottom: 6 }}>模拟用户名</label>
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>

          {/* Comment input */}
          <div className="field">
            <label className="uppercase-label" style={{ display: 'block', marginBottom: 6 }}>模拟评论内容</label>
            <textarea
              rows={3} value={commentText} onChange={(e) => setCommentText(e.target.value)}
              placeholder="输入一条评论，测试是否会触发规则..."
            />
          </div>

          <button className="btn-primary" onClick={run} disabled={loading} style={{ opacity: loading ? 0.5 : 1 }}>
            {loading ? '测试中...' : '发送评论'}
          </button>
        </div>

        {/* Trigger Log */}
        <div className="uppercase-label mb-12">触发日志</div>
        <div className="flex-col gap-8">
          {results.length === 0 && (
            <div className="text-muted" style={{ textAlign: 'center', padding: '32px 0', fontSize: 12 }}>尚无测试记录</div>
          )}
          {results.map((r, i) => (
            <div key={i} className={`log-item ${r.triggered ? 'triggered' : 'missed'}`}>
              <div className="log-body">
                <div className="flex items-center gap-8 mb-4">
                  <span className={`badge ${r.triggered ? 'badge-on' : 'badge-off'}`}>
                    {r.triggered ? '已触发' : '未触发'}
                  </span>
                  {r.matched_rule && (
                    <span className="badge badge-purple">规则：{r.matched_rule}</span>
                  )}
                </div>
                {r.public_reply && (
                  <div className="log-text">
                    <span className="log-user">公开回复：</span>{r.public_reply}
                  </div>
                )}
                {r.dm_content && (
                  <div className="log-text mt-2">
                    <span className="log-user">私信：</span>{r.dm_content}
                  </div>
                )}
                {r.conversation_id && (
                  <button className="icon-btn mt-4" onClick={() => navigate(`/conversations/${r.conversation_id}`)} style={{ color: '#185FA5', fontSize: 11 }}>
                    查看对话 &rarr;
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
