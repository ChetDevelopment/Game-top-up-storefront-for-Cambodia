"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, ShieldBan } from "lucide-react";

interface Blocked {
  id: string;
  type: string;
  value: string;
  reason: string | null;
  createdAt: string;
}

const TYPES = ["email", "phone", "ip", "uid"] as const;

export default function BanlistPage() {
  const [items, setItems] = useState<Blocked[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ type: "email", value: "", reason: "" });
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/admin/banlist");
    if (res.ok) setItems(await res.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function add() {
    setSaving(true);
    const res = await fetch("/api/admin/banlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) { setForm({ type: form.type, value: "", reason: "" }); await load(); }
    else {
      const d = await res.json().catch(() => null);
      alert(d?.error || "Failed");
    }
    setSaving(false);
  }

  async function remove(id: string) {
    if (!confirm("Remove from banlist?")) return;
    await fetch(`/api/admin/banlist/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="p-4 sm:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold">Banlist</h1>
          <p className="text-royal-muted text-sm">Blocked emails, phones, IPs and UIDs from placing orders.</p>
        </div>
      </div>

      <div className="card p-5 mb-6">
        <h2 className="font-semibold mb-4 inline-flex items-center gap-2"><ShieldBan className="h-4 w-4 text-red-400" /> Add entry</h2>
        <div className="grid sm:grid-cols-4 gap-3">
          <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input className="input sm:col-span-2" placeholder="value" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
          <input className="input" placeholder="reason (optional)" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
        </div>
        <div className="mt-4">
          <button onClick={add} disabled={saving || !form.value} className="btn-primary">
            <Plus className="h-4 w-4" /> Block
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-royal-muted text-sm">Loading...</div>
      ) : items.length === 0 ? (
        <div className="card p-10 text-center text-royal-muted text-sm">No bans in place.</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-royal-muted border-b border-royal-border">
              <tr>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Value</th>
                <th className="py-3 px-4">Reason</th>
                <th className="py-3 px-4">Added</th>
                <th className="py-3 px-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-royal-border/60">
              {items.map((b) => (
                <tr key={b.id}>
                  <td className="py-2 px-4"><span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 uppercase">{b.type}</span></td>
                  <td className="py-2 px-4 font-mono">{b.value}</td>
                  <td className="py-2 px-4 text-royal-muted">{b.reason || "—"}</td>
                  <td className="py-2 px-4 text-xs text-royal-muted">{new Date(b.createdAt).toLocaleString()}</td>
                  <td className="py-2 px-4 text-right">
                    <button onClick={() => remove(b.id)} className="text-red-400 hover:text-red-300"><Trash2 className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

