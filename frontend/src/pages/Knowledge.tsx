import { useEffect, useState, useRef } from 'react';
import { getKnowledge, createKnowledge, updateKnowledge, deleteKnowledge, deleteAllKnowledge, uploadKnowledgeFile } from '../api/client';
import type { KnowledgeEntry } from '../types';

const icons = ['💰', '📦', '🔧', '🎁', '💡', '🏷️', '📋', '🔔'];
const iconBgs = ['avatar-blue', 'avatar-green', 'avatar-amber', 'avatar-pink', 'avatar-blue', 'avatar-green', 'avatar-amber', 'avatar-pink'];

export default function Knowledge() {
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [editing, setEditing] = useState<{ id?: number; question: string; answer: string; category: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => getKnowledge().then(setEntries).catch(() => {});
  useEffect(() => { load(); }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await uploadKnowledgeFile(file);
      load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '上传失败');
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const save = async () => {
    if (!editing) return;
    if (editing.id) {
      await updateKnowledge(editing.id, editing);
    } else {
      await createKnowledge(editing);
    }
    setEditing(null);
    load();
  };

  const remove = async (id: number) => {
    if (!confirm('确定删除这条知识？')) return;
    await deleteKnowledge(id);
    load();
  };

  return (
    <div className="flex-col" style={{ height: '100%' }}>
      {/* Page Header */}
      <div className="panel-header">
        <div>
          <div className="panel-title">知识库管理</div>
          <div className="panel-sub">AI 回复参考的问答数据</div>
        </div>
        {!editing && (
          <div className="flex gap-8">
            {entries.length > 0 && (
              <button className="btn" style={{ color: '#dc2626', borderColor: '#dc2626' }} onClick={async () => {
                if (!confirm('确定清空全部知识库？')) return;
                await deleteAllKnowledge();
                load();
              }}>清空</button>
            )}
            <button className="btn" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? '上传中...' : '上传文件'}
            </button>
            <input ref={fileRef} type="file" accept=".txt,.md,.csv,.json" onChange={handleUpload} style={{ display: 'none' }} />
            <button className="btn-primary" onClick={() => setEditing({ question: '', answer: '', category: '' })}>
              + 添加知识
            </button>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal" style={{ marginTop: '10vh' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">{editing.id ? '编辑知识' : '添加知识'}</div>
              <button className="modal-close" onClick={() => setEditing(null)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="field">
                <label className="uppercase-label" style={{ display: 'block', marginBottom: 6 }}>问题</label>
                <input
                  type="text"
                  value={editing.question}
                  onChange={(e) => setEditing({ ...editing, question: e.target.value })}
                  placeholder="例：产品价格是多少？"
                />
              </div>
              <div className="field">
                <label className="uppercase-label" style={{ display: 'block', marginBottom: 6 }}>回答</label>
                <textarea
                  rows={3}
                  value={editing.answer}
                  onChange={(e) => setEditing({ ...editing, answer: e.target.value })}
                  placeholder="AI 回复时参考的标准答案..."
                />
              </div>
              <div className="field">
                <label className="uppercase-label" style={{ display: 'block', marginBottom: 6 }}>分类（可选）</label>
                <input
                  type="text"
                  value={editing.category}
                  onChange={(e) => setEditing({ ...editing, category: e.target.value })}
                  placeholder="例：价格、配送、售后"
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setEditing(null)}>取消</button>
              <button className="btn-primary" onClick={save}>保存</button>
            </div>
          </div>
        </div>
      )}

      {/* Scrollable Content */}
      <div className="scroll-y">
        {/* List */}
        <div className="flex-col gap-8 mb-16">
          {entries.length === 0 && !editing && (
            <div className="text-muted" style={{ textAlign: 'center', padding: '48px 0', fontSize: 12 }}>
              暂无知识条目，点击上方添加
            </div>
          )}
          {entries.map((e, i) => (
            <div key={e.id} className="card flex items-start gap-8" style={{ position: 'relative' }}>
              <div className={`avatar avatar-sm ${iconBgs[i % iconBgs.length]}`} style={{ borderRadius: 8, fontSize: 14 }}>
                {icons[i % icons.length]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm" style={{ color: 'var(--text-primary)', marginBottom: 2 }}>
                  {e.question}
                  {e.category && (
                    <span className="badge badge-off" style={{ marginLeft: 8 }}>{e.category}</span>
                  )}
                </div>
                <div className="text-xs" style={{ lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                  {e.answer}
                </div>
              </div>
              <div className="flex gap-6 flex-shrink-0">
                <button
                  className="icon-btn"
                  onClick={() => setEditing({ id: e.id, question: e.question, answer: e.answer, category: e.category })}
                  style={{ fontSize: 11, color: '#185FA5' }}
                >
                  编辑
                </button>
                <button
                  className="icon-btn"
                  onClick={() => remove(e.id)}
                  style={{ fontSize: 11, color: '#dc2626' }}
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Add Button (dashed) */}
        {!editing && entries.length > 0 && (
          <button
            className="btn-dashed"
            onClick={() => setEditing({ question: '', answer: '', category: '' })}
          >
            + 添加新问答
          </button>
        )}
      </div>
    </div>
  );
}
