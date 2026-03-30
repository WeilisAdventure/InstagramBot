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
        <div className="card mb-16" style={{ maxWidth: 560, padding: 16 }}>
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
