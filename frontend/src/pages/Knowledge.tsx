import { useEffect, useState } from 'react';
import { getKnowledge, createKnowledge, updateKnowledge, deleteKnowledge } from '../api/client';
import type { KnowledgeEntry } from '../types';

export default function Knowledge() {
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [editing, setEditing] = useState<{ id?: number; question: string; answer: string; category: string } | null>(null);

  const load = () => getKnowledge().then(setEntries).catch(() => {});
  useEffect(() => { load(); }, []);

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
    if (!confirm('Delete this entry?')) return;
    await deleteKnowledge(id);
    load();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Knowledge Base</h1>
        <button
          onClick={() => setEditing({ question: '', answer: '', category: '' })}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          + Add Entry
        </button>
      </div>

      {editing && (
        <div className="bg-white rounded-xl shadow p-6 max-w-2xl mb-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Question</label>
            <input
              className="w-full border rounded-lg px-3 py-2"
              value={editing.question}
              onChange={(e) => setEditing({ ...editing, question: e.target.value })}
              placeholder="e.g. What are your delivery hours?"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Answer</label>
            <textarea
              className="w-full border rounded-lg px-3 py-2"
              rows={3}
              value={editing.answer}
              onChange={(e) => setEditing({ ...editing, answer: e.target.value })}
              placeholder="The answer AI should reference..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category (optional)</label>
            <input
              className="w-full border rounded-lg px-3 py-2"
              value={editing.category}
              onChange={(e) => setEditing({ ...editing, category: e.target.value })}
              placeholder="e.g. Pricing, Delivery, Policy"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={save} className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700">Save</button>
            <button onClick={() => setEditing(null)} className="text-gray-500 hover:text-gray-700 px-4 py-2">Cancel</button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {entries.length === 0 && !editing && <p className="text-gray-500">No knowledge entries yet. Add Q&As for the AI to reference.</p>}
        {entries.map((e) => (
          <div key={e.id} className="bg-white rounded-xl shadow p-4">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-medium">Q: {e.question}</h3>
                  {e.category && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{e.category}</span>}
                </div>
                <p className="text-sm text-gray-600">A: {e.answer}</p>
              </div>
              <div className="flex gap-2 ml-4">
                <button onClick={() => setEditing({ id: e.id, question: e.question, answer: e.answer, category: e.category })} className="text-blue-600 hover:text-blue-800 text-sm">Edit</button>
                <button onClick={() => remove(e.id)} className="text-red-500 hover:text-red-700 text-sm">Delete</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
