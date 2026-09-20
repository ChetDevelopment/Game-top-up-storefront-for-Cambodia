"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, Save, X, Pencil } from "lucide-react";

interface Faq {
  id: string;
  question: string;
  answer: string;
  category: string;
  active: boolean;
  sortOrder: number;
}

const empty = { question: "", answer: "", category: "general", active: true, sortOrder: 0 };

export default function FaqsAdminPage() {
  const [items, setItems] = useState<Faq[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Faq | null>(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/admin/faqs");
    if (res.ok) setItems(await res.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function openNew() { setEditing(null); setForm(empty); }
  function openEdit(f: Faq) {
    setEditing(f);
    setForm({ question: f.question, answer: f.answer, category: f.category, active: f.active, sortOrder: f.sortOrder });
  }

  async function save() {
    setSaving(true);
    const url = editing ? `/api/admin/faqs/${editing.id}` : "/api/admin/faqs";
    const method = editing ? "PATCH" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    if (res.ok) { setForm(empty); setEditing(null); await load(); }
    else alert("Save failed");
    setSaving(false);
  }

  async function remove(id: string) {
    if (!confirm("Delete this FAQ?")) return;
    await fetch(`/api/admin/faqs/${id}`, { method: "DELETE" });
    await load();
  }

  const grouped = items.reduce<Record<string, Faq[]>>((acc, f) => {
    (acc[f.category] = acc[f.category] || []).push(f);
    return acc;
  }, {});

  return (
    <div className="p-4 sm:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold">FAQ</h1>
          <p className="text-royal-muted text-sm">Shown on the public /faq page.</p>
        </div>
        <button onClick={openNew} className="btn-primary">
          <Plus className="h-4 w-4" /> 
          New
        </button>
      </div>

      <div className="card p-5 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">{editing ? "Edit FAQ" : "New FAQ"}</h2>
          {editing && (
            <button onClick={openNew} className="text-xs text-royal-muted hover:text-royal-text inline-flex items-center gap-1">
              <X className="h-3 w-3" /> 
              Cancel
            </button>
          )}
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="label">Question *</label>
            <input className="input" value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Answer *</label>
            <textarea className="input min-h-[120px]" value={form.answer} onChange={(e) => setForm({ ...form, answer: e.target.value })} />
          </div>
          <div>
            <label className="label">Category</label>
            <input className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="general / payment / delivery" />
          </div>
          <div>
            <label className="label">Sort order</label>
            <input type="number" className="input" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: parseInt(e.target.value) || 0 })} />
          </div>
          <div className="sm:col-span-2">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
              <span className="text-sm">Active</span>
            </label>
          </div>
        </div>
        <div className="mt-5">
          <button onClick={save} disabled={saving || !form.question || !form.answer} className="btn-primary">
            <Save className="h-4 w-4" /> 
            {saving ? "Saving..." : editing ? "Save" : "Create"}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-royal-muted text-sm">Loading...</div>
      ) : items.length === 0 ? (
        <div className="card p-10 text-center text-royal-muted text-sm">No FAQs yet.</div>
      ) : (
        Object.entries(grouped).map(([cat, list]) => (
          <div key={cat} className="mb-8">
            <h2 className="text-xs uppercase tracking-widest text-royal-muted mb-3">{cat}</h2>
            <div className="space-y-2">
              {list.map((f) => (
                <div key={f.id} className="card p-4 flex items-start gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">{f.question}</h3>
                      {!f.active && <span className="text-[10px] px-2 py-0.5 rounded-full bg-royal-muted/10 text-royal-muted">HIDDEN</span>}
                    </div>
                    <p className="text-sm text-royal-muted mt-1 whitespace-pre-wrap">{f.answer}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => openEdit(f)} className="text-xs btn-ghost px-3 py-1.5 inline-flex items-center gap-1">
                      <Pencil className="h-3 w-3" />
                      Edit
                    </button>
                    <button onClick={() => remove(f.id)} className="text-xs text-red-400 hover:text-red-300">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

