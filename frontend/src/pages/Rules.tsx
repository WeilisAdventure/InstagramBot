import { useEffect, useState } from 'react';
import { getRules, createRule, updateRule, deleteRule } from '../api/client';
import type { Rule, RuleCreate } from '../types';

const emptyRule: RuleCreate = {
  name: '', keywords: [], match_mode: 'contains',
  public_reply_template: '', dm_template: '', follow_up_mode: 'ai', is_active: true,
};

export default function Rules() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [editing, setEditing] = useState<RuleCreate & { id?: number } | null>(null);
  const [keywordInput, setKeywordInput] = useState('');

  const load = () => getRules().then(setRules).catch(() => {});
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!editing) return;
    if (editing.id) await updateRule(editing.id, editing);
    else await createRule(editing);
    setEditing(null); load();
  };

  const remove = async (id: number) => {
    if (!confirm('确定删除？')) return;
    await deleteRule(id); load();
  };

  const addKeyword = () => {
    if (!editing || !keywordInput.trim()) return;
    // Support comma-separated input
    const newKw = keywordInput.split(/[,，]/).map(s => s.trim()).filter(Boolean);
    if (newKw.length === 0) return;
    setEditing({ ...editing, keywords: [...editing.keywords, ...newKw] });
    setKeywordInput('');
  };

  /* ---- Edit Form ---- */
  if (editing) {
    return (
      <div className="flex-col" style={{ height: '100%' }}>
        {/* Page Header */}
        <div className="panel-header">
          <div>
            <div className="panel-title">
              {editing.id ? '编辑规则' : '新建规则'}
            </div>
            <div className="panel-sub">配置自动回复触发条件</div>
          </div>
          <button onClick={() => setEditing(null)}>取消</button>
        </div>

        {/* Scrollable Form */}
        <div className="scroll-y">
          <div className="card" style={{ maxWidth: 520, padding: 16 }}>
            {/* 规则名称 */}
            <div className="field">
              <label className="field-label">规则名称</label>
              <input
                type="text"
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder="例：价格咨询"
              />
            </div>

            {/* 关键词 */}
            <div className="field">
              <label className="field-label">关键词</label>
              <div className="flex gap-6" style={{ flexWrap: 'wrap', marginBottom: 8 }}>
                {editing.keywords.map((kw, i) => (
                  <span key={i} className="keyword-tag">
                    {kw}
                    <button
                      onClick={() => setEditing({ ...editing, keywords: editing.keywords.filter((_, j) => j !== i) })}
                    >&times;</button>
                  </span>
                ))}
              </div>
              <input
                type="text"
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addKeyword())}
                placeholder="输入关键词按回车添加，支持逗号分隔批量添加"
              />
            </div>

            {/* Match mode + Follow-up mode */}
            <div className="grid-2 mb-12">
              <div className="field">
                <label className="field-label">匹配方式</label>
                <select
                  value={editing.match_mode}
                  onChange={(e) => setEditing({ ...editing, match_mode: e.target.value })}
                >
                  <option value="contains">包含</option>
                  <option value="exact">精确匹配</option>
                  <option value="regex">正则</option>
                </select>
              </div>
              <div className="field">
                <label className="field-label">后续模式</label>
                <select
                  value={editing.follow_up_mode}
                  onChange={(e) => setEditing({ ...editing, follow_up_mode: e.target.value })}
                >
                  <option value="ai">AI 自动回复</option>
                  <option value="human">转接人工</option>
                </select>
              </div>
            </div>

            {/* Public reply template */}
            <div className="field">
              <label className="field-label">公开回复模板</label>
              <textarea
                rows={2}
                value={editing.public_reply_template}
                onChange={(e) => setEditing({ ...editing, public_reply_template: e.target.value })}
                placeholder="评论下方的公开回复，用 {name} 代替用户名"
              />
            </div>

            {/* DM template */}
            <div className="field">
              <label className="field-label">私信模板</label>
              <textarea
                rows={2}
                value={editing.dm_template}
                onChange={(e) => setEditing({ ...editing, dm_template: e.target.value })}
                placeholder="发送给评论者的私信，用 {name} 代替用户名"
              />
            </div>

            {/* Save button */}
            <button className="btn-primary" onClick={save}>保存规则</button>
          </div>
        </div>
      </div>
    );
  }

  /* ---- Rule List ---- */
  return (
    <div className="flex-col" style={{ height: '100%' }}>
      {/* Page Header */}
      <div className="panel-header">
        <div>
          <div className="panel-title">评论触发规则</div>
          <div className="panel-sub">管理自动化回复流程</div>
        </div>
        <button className="btn-primary" onClick={() => setEditing({ ...emptyRule })}>
          + 新建规则
        </button>
      </div>

      {/* Scrollable Content */}
      <div className="scroll-y">
        <div className="flex-col gap-8">
          {rules.length === 0 && (
            <div className="text-muted" style={{ textAlign: 'center', padding: '48px 0', fontSize: 12 }}>
              暂无规则，点击右上角创建
            </div>
          )}
          {rules.map((rule) => (
            <RuleCard
              key={rule.id}
              rule={rule}
              onEdit={() => setEditing({ ...rule })}
              onDelete={() => remove(rule.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---- Rule Card ---- */

function RuleCard({ rule, onEdit, onDelete }: { rule: Rule; onEdit: () => void; onDelete: () => void }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="rule-card"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Top row: name + badge + actions */}
      <div className="rule-top">
        <div className="flex items-center gap-8 flex-1 min-w-0">
          <span className="nav-dot" style={{ background: rule.is_active ? '#22c55e' : 'rgba(0,0,0,0.25)' }} />
          <span className="rule-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {rule.name}
          </span>
        </div>
        <div className="flex items-center gap-8">
          <div className="flex gap-8" style={{ opacity: hovered ? 1 : 0, transition: 'opacity 0.15s' }}>
            <button className="icon-btn" onClick={onEdit} style={{ fontSize: 11, color: '#185FA5' }}>编辑</button>
            <button className="icon-btn" onClick={onDelete} style={{ fontSize: 11, color: '#dc2626' }}>删除</button>
          </div>
        </div>
      </div>

      {/* Flow chips */}
      <div className="flow-row">
        <span className="fb fb-blue" style={{ fontSize: 10, padding: '2px 8px' }}>评论含: &ldquo;{rule.keywords.join('、')}&rdquo;</span>
        <span className="flow-arrow">&rarr;</span>
        <span className="fb fb-green" style={{ fontSize: 10, padding: '2px 8px' }}>回复评论</span>
        <span className="flow-arrow">&rarr;</span>
        <span className="fb fb-purple" style={{ fontSize: 10, padding: '2px 8px' }}>发送私信</span>
        <span className="flow-arrow">&rarr;</span>
        <span className="fb fb-amber" style={{ fontSize: 10, padding: '2px 8px' }}>
          {rule.follow_up_mode === 'ai' ? 'AI跟进' : '人工跟进'}
        </span>
      </div>

      {/* Meta */}
      <div className="rule-meta">
        <span className="rule-meta-item">关键词 {rule.keywords.length} 个</span>
        <span className="rule-meta-item">匹配: {rule.match_mode === 'contains' ? '包含' : rule.match_mode === 'exact' ? '精确' : '正则'}</span>
        <span className="rule-meta-item">跟进: {rule.follow_up_mode === 'ai' ? 'AI 自动' : '人工'}</span>
        <span className="rule-meta-item">已触发 <span>{rule.trigger_count}</span> 次</span>
      </div>
    </div>
  );
}
