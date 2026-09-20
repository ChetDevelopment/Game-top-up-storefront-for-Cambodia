"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Save, ArrowLeft, Trash2, Image as ImageIcon, ExternalLink } from "lucide-react";
import Link from "next/link";

interface PostForm {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  coverUrl: string;
  tag: string;
  published: boolean;
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 80);
}

export default function EditBlogPostPage() {
  const params = useParams() as { id: string };
  const router = useRouter();
  const [form, setForm] = useState<PostForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function load() {
    const res = await fetch(`/api/admin/blog/${params.id}`);
    if (res.ok) {
      const p = await res.json();
      setForm({
        title: p.title,
        slug: p.slug,
        excerpt: p.excerpt ?? "",
        content: p.content,
        coverUrl: p.coverUrl ?? "",
        tag: p.tag ?? "",
        published: p.published,
      });
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function upload(file: File) {
    if (!form) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
    if (res.ok) {
      const data = await res.json();
      setForm({ ...form, coverUrl: data.url });
    }
    setUploading(false);
  }

  async function save() {
    if (!form) return;
    setSaving(true);
    const res = await fetch(`/api/admin/blog/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      alert(data?.error || "Save failed");
    }
    setSaving(false);
  }

  async function remove() {
    if (!confirm("Delete this post permanently?")) return;
    await fetch(`/api/admin/blog/${params.id}`, { method: "DELETE" });
    router.push("/admin/blog");
  }

  if (!form) return <div className="p-8 text-royal-muted">Loading...</div>;

  return (
    <div className="p-4 sm:p-8 max-w-3xl">
      <Link href="/admin/blog" className="text-sm text-royal-muted hover:text-royal-primary inline-flex items-center gap-1 mb-4">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl sm:text-3xl font-bold">Edit Post</h1>
        {form.published && (
          <a href={`/blog/${form.slug}`} target="_blank" rel="noreferrer" className="text-xs text-royal-muted hover:text-royal-primary inline-flex items-center gap-1">
            <ExternalLink className="h-3 w-3" /> View live
          </a>
        )}
      </div>

      <div className="card p-5 space-y-4">
        <div>
          <label className="label">Title *</label>
          <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </div>
        <div>
          <label className="label">Slug</label>
          <input className="input font-mono text-sm" value={form.slug} onChange={(e) => setForm({ ...form, slug: slugify(e.target.value) })} />
        </div>
        <div>
          <label className="label">Tag</label>
          <input className="input" value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value })} />
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
          {form.coverUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={form.coverUrl} alt="" className="mt-3 h-32 rounded-lg border border-royal-border object-cover" />
          )}
        </div>
        <div>
          <label className="label">Excerpt</label>
          <textarea className="input min-h-[80px]" value={form.excerpt} onChange={(e) => setForm({ ...form, excerpt: e.target.value })} />
        </div>
        <div>
          <label className="label">Content *</label>
          <textarea className="input min-h-[400px] font-mono text-sm" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
        </div>
        <div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.published} onChange={(e) => setForm({ ...form, published: e.target.checked })} />
            <span className="text-sm">Published</span>
          </label>
        </div>
        <div className="flex justify-between pt-2">
          <button onClick={save} disabled={saving} className="btn-primary">
            <Save className="h-4 w-4" /> {saving ? "Saving..." : "Save changes"}
          </button>
          <button onClick={remove} className="text-sm text-red-400 hover:text-red-300 inline-flex items-center gap-1">
            <Trash2 className="h-4 w-4" /> Delete
          </button>
        </div>
      </div>
    </div>
  );
}
