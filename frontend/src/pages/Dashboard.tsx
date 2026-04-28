import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDashboardStats } from '../api/client';
import type { DashboardStats } from '../types';

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const navigate = useNavigate();

  useEffect(() => { getDashboardStats().then(setStats).catch(() => {}); }, []);

  return (
    <div className="scroll-y">
      {/* Panel Header */}
      <div className="mb-12" style={{ borderBottom: '0.5px solid var(--border-soft)', paddingBottom: 10 }}>
        <div className="panel-title">总览仪表盘</div>
        <div className="panel-sub">Instagram 自动化客服概览</div>
      </div>

      {/* Hero Card */}
      <div className="card-surface mb-12">
        <div className="flex items-center gap-8 mb-8">
          <div
            style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'linear-gradient(135deg, #833AB4, #FD1D1D, #F77737)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}
          >
            <svg viewBox="0 0 24 24" style={{ width: 18, height: 18, fill: '#fff' }}>
              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
            </svg>
          </div>
          <div>
            <div className="panel-title">InstaBot — Instagram AI 客服助手</div>
            <div className="text-sm">自动处理评论触发、私信对话、翻译与 AI 回复</div>
          </div>
        </div>
        {/* Flow Diagram */}
        <FlowDiagram />
      </div>

      {/* Stats Grid */}
      <div className="stats-grid mb-12">
        <StatCard value={stats?.weekly_conversations ?? '-'} label="本周对话数" />
        <StatCard value={stats ? `${stats.ai_resolution_rate}%` : '-'} label="AI 解决率" />
        <StatCard value={stats?.comment_triggers ?? '-'} label="评论触发次数" />
      </div>

      {/* Feature Cards */}
      <div className="grid-2">
        <FeatureCard icon="💬" name="评论触发规则" desc="用户评论含关键词 → 自动发送私信 + 可选公开回复评论" onClick={() => navigate('/rules')} />
        <FeatureCard icon="✉️" name="私信对话管理" desc="AI 回复 / 人工回复随时切换，英中翻译，AI 优化输入" onClick={() => navigate('/conversations')} />
        <FeatureCard icon="📥" name="评论收件箱" desc="收集所有进店评论，触发关闭也能看到，并可一键转私信回复" onClick={() => navigate('/comments')} />
      </div>
    </div>
  );
}

/* ---- Sub-components ---- */

function StatCard({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="stat-card">
      <div className="stat-number">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function FlowDiagram() {
  const nodeBase: React.CSSProperties = {
    padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600,
    textAlign: 'center', whiteSpace: 'nowrap', lineHeight: 1.4,
  };
  const diamond: React.CSSProperties = {
    ...nodeBase, transform: 'rotate(0deg)', border: '1.5px dashed var(--border-mid)',
    background: 'var(--bg-primary)', color: 'var(--text-secondary)', borderRadius: 6,
  };
  const arrow: React.CSSProperties = {
    fontSize: 14, color: 'var(--text-tertiary)', lineHeight: 1,
  };
  const label: React.CSSProperties = {
    fontSize: 9, color: 'var(--text-tertiary)', fontWeight: 500,
  };

  return (
    <div style={{ display: 'flex', gap: 24, marginTop: 4, overflowX: 'auto', paddingBottom: 4 }}>
      {/* Left branch: DM */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 160 }}>
        <div style={{ ...nodeBase, background: 'var(--bg-primary)', border: '1px solid var(--border-mid)', color: 'var(--text-primary)' }}>
          私信
        </div>
        <span style={arrow}>↓</span>
        <div style={{ ...nodeBase, background: 'var(--blue-50)', border: '1px solid #B5D4F4', color: 'var(--blue-800)', fontSize: 10 }}>
          保存到对话
        </div>
        <span style={arrow}>↓</span>
        <div style={diamond}>全局自动回复？</div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <span style={label}>开</span>
            <span style={arrow}>↓</span>
            <div style={{ ...nodeBase, background: 'var(--green-50)', border: '1px solid #C0DD97', color: 'var(--green-800)' }}>
              AI 自动回复
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <span style={label}>关</span>
            <span style={arrow}>↓</span>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ ...nodeBase, background: 'var(--green-50)', border: '1px solid #C0DD97', color: 'var(--green-800)', fontSize: 10 }}>
                  AI 回复
                </div>
                <div style={{ ...nodeBase, background: 'var(--amber-50)', border: '1px solid #FAC775', color: 'var(--amber-800)', fontSize: 10 }}>
                  人工回复
                </div>
              </div>
              <span style={arrow}>↓</span>
              <div style={{ ...nodeBase, background: 'var(--blue-50)', border: '1px solid #B5D4F4', color: 'var(--blue-800)', fontSize: 10 }}>
                确认发送
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div style={{ width: 1, background: 'var(--border-soft)', alignSelf: 'stretch', margin: '8px 0' }} />

      {/* Right branch: Comment */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 100 }}>
        <div style={{ ...nodeBase, background: 'var(--bg-primary)', border: '1px solid var(--border-mid)', color: 'var(--text-primary)' }}>
          评论
        </div>
        <span style={arrow}>↓</span>
        <div style={diamond}>匹配规则？</div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <span style={label}>是</span>
            <span style={arrow}>↓</span>
            <div style={{ ...nodeBase, background: 'var(--purple-50)', border: '1px solid #AFA9EC', color: 'var(--purple-800)' }}>
              公开回复
            </div>
            <span style={arrow}>↓</span>
            <div style={{ ...nodeBase, background: 'var(--blue-50)', border: '1px solid #B5D4F4', color: 'var(--blue-800)' }}>
              发送 DM
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, paddingTop: 0 }}>
            <span style={label}>否</span>
            <span style={arrow}>↓</span>
            <div style={{ ...nodeBase, background: 'var(--bg-primary)', border: '1px solid var(--border-mid)', color: 'var(--text-tertiary)', fontSize: 10 }}>
              忽略
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureCard({ icon, name, desc, onClick }: { icon: string; name: string; desc: string; onClick: () => void }) {
  return (
    <div className="card" onClick={onClick} style={{ cursor: 'pointer' }}>
      <div className="avatar-sm mb-8" style={{ borderRadius: 8, background: 'var(--bg-secondary)', fontSize: 16, width: 32, height: 32 }}>
        {icon}
      </div>
      <div className="font-medium text-sm mb-2" style={{ color: 'var(--text-primary)' }}>{name}</div>
      <div className="text-xs" style={{ lineHeight: 1.6 }}>{desc}</div>
    </div>
  );
}
