"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useCsrfToken } from "@/lib/useCsrfToken";
import { 
  Plus, 
  Gamepad2, 
  ChevronUp, 
  ChevronDown, 
  Star, 
  Pencil, 
  Trash2,
  Package,
  CheckCircle2,
  XCircle,
  AlertCircle
} from "lucide-react";

export default function AdminGamesPage() {
  const [games, setGames] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/admin/games");
    setGames(await res.json());
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function toggleActive(game: any) {
    await fetch(`/api/admin/games/${game.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !game.active }),
    });
    await load();
  }

  async function toggleFeatured(game: any) {
    await fetch(`/api/admin/games/${game.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ featured: !game.featured }),
    });
    await load();
  }

  async function deleteGame(game: any) {
    if (!confirm(`Delete "${game.name}" and all its products/orders? This cannot be undone.`)) return;
    await fetch(`/api/admin/games/${game.id}`, { method: "DELETE" });
    await load();
  }

  async function reorder(id: string, direction: "up" | "down") {
    await fetch("/api/admin/games/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, direction }),
    });
    await load();
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="font-display text-3xl font-bold">Games</h1>
          <p className="text-royal-muted">Manage the games you sell top-ups for.</p>
        </div>
        <button onClick={() => setCreating(true)} className="btn-primary">
          <Plus className="h-4 w-4" />
          Add Game
        </button>
      </div>

      {(creating || editing) && (
        <GameForm
          initial={editing}
          onCancel={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={async () => {
            setCreating(false);
            setEditing(null);
            await load();
          }}
        />
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-royal-surface text-royal-muted text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-5 py-3">Game</th>
                <th className="text-left px-5 py-3">Slug</th>
                <th className="text-left px-5 py-3">Publisher</th>
                <th className="text-right px-5 py-3">Products</th>
                <th className="text-right px-5 py-3">Orders</th>
                <th className="text-center px-5 py-3">Featured</th>
                <th className="text-center px-5 py-3">Active</th>
                <th className="text-right px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-royal-border">
              {loading ? (
                <tr><td colSpan={8} className="px-5 py-12 text-center text-royal-muted">Loading...</td></tr>
              ) : games.length === 0 ? (
                <tr><td colSpan={8} className="px-5 py-16 text-center">
                    <div className="h-12 w-12 rounded-full bg-royal-surface flex items-center justify-center mx-auto mb-3 text-royal-muted">
                      <Gamepad2 className="h-6 w-6" />
                    </div>
                    <p className="text-royal-muted mb-1">No games yet</p>
                    <p className="text-xs text-royal-muted/60 mb-3">Add your first game to start selling top-ups.</p>
                    <button onClick={() => setCreating(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-royal-primary px-4 py-2 text-sm font-semibold text-black hover:bg-royal-primary/90 transition-colors">
                      <Plus className="h-4 w-4" />
                      Add Game
                    </button>
                </td></tr>
              ) : (
                games.map((g, idx) => (
                  <tr key={g.id} className="hover:bg-royal-surface/50">
                    <td className="px-5 py-3 font-medium">
                      <div className="flex items-center gap-2">
                        <div className="flex flex-col">
                          <button
                            onClick={() => reorder(g.id, "up")}
                            disabled={idx === 0}
                            className="p-0.5 text-royal-muted hover:text-royal-primary disabled:opacity-20 transition-colors"
                            title="Move up"
                          >
                            <ChevronUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => reorder(g.id, "down")}
                            disabled={idx === games.length - 1}
                            className="p-0.5 text-royal-muted hover:text-royal-primary disabled:opacity-20 transition-colors"
                            title="Move down"
                          >
                            <ChevronDown className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <span>{g.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-royal-muted">{g.slug}</td>
                    <td className="px-5 py-3 text-royal-muted">{g.publisher}</td>
                    <td className="px-5 py-3 text-right font-mono">{g._count.products}</td>
                    <td className="px-5 py-3 text-right font-mono">{g._count.orders}</td>
                    <td className="px-5 py-3 text-center">
                      <button onClick={() => toggleFeatured(g)} className={g.featured ? "text-royal-accent" : "text-royal-muted hover:text-royal-accent/50"}>
                        <Star className={`h-4 w-4 ${g.featured ? "fill-current" : ""}`} />
                      </button>
                    </td>
                    <td className="px-5 py-3 text-center">
                      <button onClick={() => toggleActive(g)}>
                        <span className={`inline-block h-5 w-9 rounded-full relative transition-colors ${g.active ? "bg-green-500" : "bg-royal-border"}`}>
                          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${g.active ? "translate-x-4" : "translate-x-0.5"}`} />
                        </span>
                      </button>
                    </td>
                    <td className="px-5 py-3 text-right space-x-2">
                      <Link href={`/admin/products?gameId=${g.id}`} className="inline-flex items-center gap-1 text-royal-primary text-xs hover:underline">
                        <Package className="h-3 w-3" />
                        Products
                      </Link>
                      <button onClick={() => setEditing(g)} className="inline-flex items-center gap-1 text-royal-accent text-xs hover:underline">
                        <Pencil className="h-3 w-3" />
                        Edit
                      </button>
                      <button onClick={() => deleteGame(g)} className="inline-flex items-center gap-1 text-red-400 text-xs hover:underline">
                        <Trash2 className="h-3 w-3" />
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function GameForm({ initial, onCancel, onSaved }: { initial: any; onCancel: () => void; onSaved: () => void }) {
  const { token: csrfToken } = useCsrfToken();
  const [form, setForm] = useState({
    slug: initial?.slug || "",
    name: initial?.name || "",
    publisher: initial?.publisher || "",
    description: initial?.description || "",
    imageUrl: initial?.imageUrl || "",
    bannerUrl: initial?.bannerUrl || "",
    currencyName: initial?.currencyName || "",
    uidLabel: initial?.uidLabel || "Player ID",
    uidExample: initial?.uidExample || "",
    requiresServer: initial?.requiresServer || false,
    servers: (() => { try { return (JSON.parse(initial?.servers || "[]") as string[]).join(", "); } catch { return ""; } })(),
    featured: initial?.featured || false,
    active: initial?.active ?? true,
    sortOrder: initial?.sortOrder || 0,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const payload = {
      ...form,
      imageUrl: form.imageUrl || undefined,
      bannerUrl: form.bannerUrl || undefined,
      description: form.description || undefined,
      uidExample: form.uidExample || undefined,
      servers: JSON.stringify(form.servers.split(",").map((s: string) => s.trim()).filter(Boolean)),
    };
    const url = initial ? `/api/admin/games/${initial.id}` : "/api/admin/games";
    const method = initial ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken || "" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to save");
      setSaving(false);
      return;
    }
    onSaved();
  }

  return (
    <form onSubmit={save} className="card p-6 mb-6">
      <h3 className="font-semibold text-lg mb-4">{initial ? "Edit Game" : "Add New Game"}</h3>

      <div className="grid md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="label">Name</label>
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </div>
        <div>
          <label className="label">Slug (URL-safe)</label>
          <input
            className="input font-mono"
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })}
            disabled={!!initial}
            required
          />
        </div>
        <div>
          <label className="label">Publisher</label>
          <input className="input" value={form.publisher} onChange={(e) => setForm({ ...form, publisher: e.target.value })} required />
        </div>
        <div>
          <label className="label">Currency Name (e.g. Diamonds)</label>
          <input className="input" value={form.currencyName} onChange={(e) => setForm({ ...form, currencyName: e.target.value })} required />
        </div>
        <div>
          <label className="label">Image (cover)</label>
          <ImageField
            value={form.imageUrl}
            onChange={(v) => setForm({ ...form, imageUrl: v })}
            required
            csrfToken={csrfToken}
          />
        </div>
        <div>
          <label className="label">Banner (optional, wide)</label>
          <ImageField
            value={form.bannerUrl}
            onChange={(v) => setForm({ ...form, bannerUrl: v })}
            csrfToken={csrfToken}
          />
        </div>
        <div>
          <label className="label">UID Label</label>
          <input className="input" value={form.uidLabel} onChange={(e) => setForm({ ...form, uidLabel: e.target.value })} />
        </div>
        <div>
          <label className="label">UID Example</label>
          <input className="input" value={form.uidExample} onChange={(e) => setForm({ ...form, uidExample: e.target.value })} />
        </div>
        <div className="md:col-span-2">
          <label className="label">Description</label>
          <input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div>
          <label className="label">Servers (comma-separated, leave blank if not needed)</label>
          <input className="input" value={form.servers} onChange={(e) => setForm({ ...form, servers: e.target.value })} placeholder="America, Europe, Asia" />
        </div>
        <div>
          <label className="label">Sort Order</label>
          <input className="input" type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })} />
        </div>
      </div>

      <div className="flex gap-6 mb-6">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.requiresServer} onChange={(e) => setForm({ ...form, requiresServer: e.target.checked })} />
          Requires server selection
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.featured} onChange={(e) => setForm({ ...form, featured: e.target.checked })} />
          Featured
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
          Active
        </label>
      </div>

      {error && <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300 mb-4">{error}</div>}

      <div className="flex gap-3">
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? "Saving..." : initial ? "Save Changes" : "Create Game"}
        </button>
        <button type="button" onClick={onCancel} className="btn-ghost">Cancel</button>
      </div>
    </form>
  );
}

function ImageField({
  value,
  onChange,
  required,
  csrfToken,
}: {
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  csrfToken?: string | null;
}) {
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleFile(file: File) {
    setErr(null);
    if (file.size > 5 * 1024 * 1024) {
      setErr("Max 5MB.");
      return;
    }
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const headers: Record<string, string> = {};
      if (csrfToken) headers["x-csrf-token"] = csrfToken;

      const res = await fetch("/api/admin/upload", {
        method: "POST",
        body: fd,
        headers,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      onChange(data.url);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        {value ? (
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-royal-border bg-royal-bg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value} alt="" className="h-full w-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          </div>
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-dashed border-royal-border bg-royal-bg text-xs text-royal-muted">
            No image
          </div>
        )}
        <label className="btn-ghost cursor-pointer text-sm">
          {uploading ? "Uploading..." : value ? "Replace" : "Upload"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
        </label>
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="text-xs text-red-400 hover:underline"
          >
            Clear
          </button>
        )}
      </div>
      <input
        className="input font-mono text-xs"
        placeholder="Paste image URL (e.g., https://cdn.tykhai.com/games/mlbb.jpg)"
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
      />
      {err && <div className="text-xs text-red-400">{err}</div>}
    </div>
  );
}

