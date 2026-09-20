"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save, ArrowLeft, Image as ImageIcon } from "lucide-react";
import Link from "next/link";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
}

export default function NewBlogPostPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    title: "",
    slug: "",
    excerpt: "",
    content: "",
    coverUrl: "",
    tag: "",
    published: false,
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function upload(file: File) {
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
    if (res.ok) {
      const data = await res.json();
      setForm((f) => ({ ...f, coverUrl: data.url }));
    }
    setUploading(false);
  }

  async function save() {
    setSaving(true);
    const slug = form.slug || slugify(form.title);
    const res = await fetch("/api/admin/blog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, slug }),
    });
    if (res.ok) {
      const p = await res.json();
      router.push(`/admin/blog/${p.id}`);
    } else {
      const data = await res.json().catch(() => null);
      alert(data?.error || "Save failed");
    }
    setSaving(false);
  }

  return (
    <div className="p-4 sm:p-8 max-w-3xl">
      <Link href="/admin/blog" className="text-sm text-royal-muted hover:text-royal-primary inline-flex items-center gap-1 mb-4">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>
      <h1 className="font-display text-2xl sm:text-3xl font-bold mb-6">New Blog Post</h1>

      <div className="card p-5 space-y-4">
        <div>
          <label className="label">Title *</label>
          <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value, slug: form.slug || slugify(e.target.value) })} />
        </div>
        <div>
          <label className="label">Slug</label>
          <input className="input font-mono text-sm" value={form.slug} onChange={(e) => setForm({ ...form, slug: slugify(e.target.value) })} placeholder="auto-generated from title" />
        </div>
        <div>
          <label className="label">Tag</label>
          <input className="input" value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value })} placeholder="news, guide, promo" />
        </div>
        <div>
          <label className="label">Cover image</label>
          <div className="flex items-center gap-3">
            <input className="input flex-1" value={form.coverUrl} onChange={(e) => setForm({ ...form, coverUrl: e.target.value })} />
            <label className="btn-ghost cursor-pointer">
              <ImageIcon className="h-4 w-4" />
              {uploading ? "..." : "Upload"}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            </label>
          </div>
        </div>
        <div>
          <label className="label">Excerpt</label>
          <textarea className="input min-h-[80px]" value={form.excerpt} onChange={(e) => setForm({ ...form, excerpt: e.target.value })} />
        </div>
        <div>
          <label className="label">Content * (plain text or simple HTML)</label>
          <textarea className="input min-h-[400px] font-mono text-sm" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
        </div>
        <div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.published} onChange={(e) => setForm({ ...form, published: e.target.checked })} />
            <span className="text-sm">Publish immediately</span>
          </label>
        </div>
        <div>
          <button onClick={save} disabled={saving || !form.title || !form.content} className="btn-primary">
            <Save className="h-4 w-4" /> {saving ? "Saving..." : "Create post"}
          </button>
        </div>
      </div>
    </div>
  );
}

