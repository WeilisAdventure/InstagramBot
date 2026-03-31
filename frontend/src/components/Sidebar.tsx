import { NavLink } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { getSettings, updateSettings } from '../api/client';

const dotColorMap: Record<string, string> = {
  '#185FA5': 'blue',
  '#534AB7': 'purple',
  '#22c55e': 'green',
  '#d97706': 'amber',
  '#9ca3af': 'gray',
};

const sections = [
  { group: '概览', items: [
    { path: '/', label: '总览仪表盘', dotColor: '#185FA5' },
  ]},
  { group: '核心功能', items: [
    { path: '/conversations', label: '私信对话', dotColor: '#22c55e' },
    { path: '/rules', label: '评论触发规则', dotColor: '#185FA5' },
    { path: '/simulate', label: '模拟测试', dotColor: '#534AB7' },
  ]},
  { group: '配置', items: [
    { path: '/knowledge', label: '知识库', dotColor: '#d97706' },
    { path: '/settings', label: '系统设置', dotColor: '#9ca3af' },
  ]},
];

export default function Sidebar() {
  const [t1, setT1] = useState(true);
  const [t2, setT2] = useState(true);

  useEffect(() => {
    getSettings().then((s) => { setT1(s.auto_reply_enabled); setT2(s.comment_trigger_enabled); }).catch(() => {});
  }, []);

  const toggle = async (which: 1 | 2) => {
    if (which === 1) { const n = !t1; setT1(n); await updateSettings({ auto_reply_enabled: n }); }
    else { const n = !t2; setT2(n); await updateSettings({ comment_trigger_enabled: n }); }
  };

  return (
    <aside className="sidebar" style={{ height: '100vh', position: 'sticky', top: 0 }}>
      {/* Brand header */}
      <div className="sidebar-header">
        <div className="brand">
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              background: 'linear-gradient(135deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)',
            }}
          >
            <svg viewBox="0 0 24 24" style={{ width: 15, height: 15, fill: '#fff' }}>
              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
            </svg>
          </div>
          <div>
            <div className="brand-name">InstaBot</div>
            <div className="brand-sub">AI 客服助手</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1" style={{ paddingTop: 8, paddingBottom: 8 }}>
        {sections.map((sec) => (
          <div key={sec.group}>
            <div className="nav-group">{sec.group}</div>
            {sec.items.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
              >
                <span className={`nav-dot ${dotColorMap[item.dotColor] || 'gray'}`} />
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* Bottom toggles & status */}
      <div className="flex-col gap-6" style={{ padding: '10px 12px', borderTop: '0.5px solid var(--border-soft)' }}>
        <div className="flex items-center justify-between">
          <div className="flex-col" style={{ gap: 1 }}>
            <span className="text-xs">AI 自动回复</span>
            <span style={{ fontSize: 10, color: t1 ? '#16a34a' : 'var(--text-muted)' }}>{t1 ? '运行中' : '已暂停'}</span>
          </div>
          <button className={`toggle${t1 ? '' : ' off'}`} onClick={() => toggle(1)} />
        </div>
        <div className="flex items-center justify-between">
          <div className="flex-col" style={{ gap: 1 }}>
            <span className="text-xs">评论触发</span>
            <span style={{ fontSize: 10, color: t2 ? '#16a34a' : 'var(--text-muted)' }}>{t2 ? '运行中' : '已暂停'}</span>
          </div>
          <button className={`toggle${t2 ? '' : ' off'}`} onClick={() => toggle(2)} />
        </div>
      </div>
    </aside>
  );
}
