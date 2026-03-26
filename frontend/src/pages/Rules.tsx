import { useEffect, useState } from 'react';
import { getRules, createRule, updateRule, deleteRule } from '../api/client';
import type { Rule, RuleCreate } from '../types';

const emptyRule: RuleCreate = {
  name: '',
  keywords: [],
  match_mode: 'contains',
  public_reply_template: '',
  dm_template: '',
  follow_up_mode: 'ai',
  is_active: true,
};

export default function Rules() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [editing, setEditing] = useState<RuleCreate & { id?: number } | null>(null);
  const [keywordInput, setKeywordInput] = useState('');

  const load = () => getRules().then(setRules).catch(() => {});
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!editing) return;
    if (editing.id) {
      await updateRule(editing.id, editing);
    } else {
      await createRule(editing);
    }
    setEditing(null);
    load();
  };

  const remove = async (id: number) => {
    if (!confirm('Delete this rule?')) return;
    await deleteRule(id);
    load();
  };

  const addKeyword = () => {
    if (!editing || !keywordInput.trim()) return;
    setEditing({ ...editing, keywords: [...editing.keywords, keywordInput.trim()] });
    setKeywordInput('');
  };

  const removeKeyword = (idx: number) => {
    if (!editing) return;
    setEditing({ ...editing, keywords: editing.keywords.filter((_, i) => i !== idx) });
  };

  if (editing) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">{editing.id ? 'Edit Rule' : 'New Rule'}</h1>
          <button onClick={() => setEditing(null)} className="text-gray-500 hover:text-gray-700">Cancel</button>
        </div>
        <div className="bg-white rounded-xl shadow p-6 space-y-4 max-w-2xl">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Rule Name</label>
            <input
              className="w-full border rounded-lg px-3 py-2"
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              placeholder="e.g. Price Inquiry"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Keywords</label>
            <div className="flex gap-2 flex-wrap mb-2">
              {editing.keywords.map((kw, i) => (
                <span key={i} className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-sm flex items-center gap-1">
                  {kw}
                  <button onClick={() => removeKeyword(i)} className="text-blue-500 hover:text-blue-700">&times;</button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                className="flex-1 border rounded-lg px-3 py-2"
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addKeyword())}
                placeholder="Add keyword and press Enter"
              />
              <button onClick={addKeyword} className="bg-blue-500 text-white px-4 py-2 rounded-lg">Add</button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Match Mode</label>
            <select
              className="w-full border rounded-lg px-3 py-2"
              value={editing.match_mode}
              onChange={(e) => setEditing({ ...editing, match_mode: e.target.value })}
            >
              <option value="contains">Contains</option>
              <option value="exact">Exact Match</option>
              <option value="regex">Regex</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Public Reply Template</label>
            <textarea
              className="w-full border rounded-lg px-3 py-2"
              rows={2}
              value={editing.public_reply_template}
              onChange={(e) => setEditing({ ...editing, public_reply_template: e.target.value })}
              placeholder="Reply shown publicly under the comment. Use {name} for username."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">DM Template</label>
            <textarea
              className="w-full border rounded-lg px-3 py-2"
              rows={2}
              value={editing.dm_template}
              onChange={(e) => setEditing({ ...editing, dm_template: e.target.value })}
              placeholder="DM sent to the commenter. Use {name} for username."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Follow-up Mode</label>
            <select
              className="w-full border rounded-lg px-3 py-2"
              value={editing.follow_up_mode}
              onChange={(e) => setEditing({ ...editing, follow_up_mode: e.target.value })}
            >
              <option value="ai">AI Auto-Reply</option>
              <option value="human">Human Agent</option>
            </select>
          </div>
          <button onClick={save} className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700">
            Save Rule
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Comment Trigger Rules</h1>
        <button
          onClick={() => setEditing({ ...emptyRule })}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          + New Rule
        </button>
      </div>
      <div className="space-y-3">
        {rules.length === 0 && <p className="text-gray-500">No rules yet. Create one to get started.</p>}
        {rules.map((rule) => (
          <div key={rule.id} className="bg-white rounded-xl shadow p-4 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">{rule.name}</h3>
                <span className={`text-xs px-2 py-0.5 rounded-full ${rule.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {rule.is_active ? 'Active' : 'Inactive'}
                </span>
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                  {rule.follow_up_mode === 'ai' ? 'AI' : 'Human'}
                </span>
              </div>
              <p className="text-sm text-gray-500 mt-1">
                Keywords: {rule.keywords.join(', ')} ({rule.match_mode})
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setEditing({ ...rule })}
                className="text-blue-600 hover:text-blue-800 text-sm"
              >
                Edit
              </button>
              <button
                onClick={() => remove(rule.id)}
                className="text-red-500 hover:text-red-700 text-sm"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
