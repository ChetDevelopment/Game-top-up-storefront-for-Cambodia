"use client";

import { useEffect, useState } from "react";
import HomePopup from "@/components/HomePopup";
import { Eye, X, Image as ImageIcon, Save } from "lucide-react";

export default function AdminPopupPage() {
  const [form, setForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then(setForm);
  }, []);

  async function uploadImage(file: File) {
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
      if (res.ok) {
        const data = await res.json();
        setForm((f: any) => ({ ...f, popupImageUrl: data.url }));
      }
    } catch (err) {
      console.error(err);
    }
    setUploading(false);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        popupActive: !!form.popupActive,
        popupTitle: form.popupTitle || null,
        popupContent: form.popupContent || null,
        popupImageUrl: form.popupImageUrl || null,
      }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (!form) return <div className="p-8 text-royal-muted">Loading...</div>;

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="font-display text-3xl font-bold mb-2">Homepage Pop-up</h1>
      <p className="text-royal-muted mb-6">Show an announcement popup when users visit the homepage.</p>

      <form onSubmit={save} className="card p-6 space-y-5">
        <label className="flex items-center gap-3 p-4 rounded-lg border border-royal-border bg-royal-surface">
          <input
            type="checkbox"
            checked={form.popupActive}
            onChange={(e) => setForm({ ...form, popupActive: e.target.checked })}
          />
          <div className="flex-1">
            <div className="font-medium">Pop-up Active</div>
            <div className="text-xs text-royal-muted">Show a modal announcement when users visit the homepage.</div>
          </div>
        </label>

        {form.popupActive && (
          <div className="space-y-4 pl-4 border-l-2 border-royal-primary/30">
            <div>
              <label className="label">Pop-up Title</label>
              <input
                className="input"
                value={form.popupTitle || ""}
                onChange={(e) => setForm({ ...form, popupTitle: e.target.value })}
                placeholder="e.g. Happy New Year!"
              />
            </div>
            <div>
              <label className="label">Pop-up Content</label>
              <textarea
                className="input"
                rows={3}
                value={form.popupContent || ""}
                onChange={(e) => setForm({ ...form, popupContent: e.target.value })}
                placeholder="Detailed announcement message..."
              />
            </div>
            <div>
              <label className="label">Pop-up Image (optional)</label>
              <div className="flex items-center gap-3">
                <input
                  className="input flex-1"
                  value={form.popupImageUrl || ""}
                  onChange={(e) => setForm({ ...form, popupImageUrl: e.target.value })}
                  placeholder="https://... or upload below"
                />
                <label className="btn-ghost cursor-pointer py-3.5">
                  <ImageIcon className="h-4 w-4" />
                  <span className="text-xs font-bold uppercase tracking-widest">
                    {uploading ? "Uploading..." : "Upload"}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0])}
                  />
                </label>
              </div>
              {form.popupImageUrl && (
                <div className="mt-3 relative inline-block group">
                  <img
                    src={form.popupImageUrl}
                    alt="Preview"
                    className="h-24 w-auto rounded-xl border border-royal-border object-cover transition-transform group-hover:scale-105"
                  />
                  <button
                    type="button"
                    onClick={() => setForm((f: any) => ({ ...f, popupImageUrl: null }))}
                    className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowPreview(true)}
              className="text-xs font-bold text-royal-primary hover:text-royal-accent flex items-center gap-1.5 transition-colors group"
            >
              <Eye className="h-3.5 w-3.5" />
              <span className="group-hover:underline">Preview How It Looks</span>
            </button>
          </div>
        )}

        <div className="flex items-center gap-3 pt-2">
          <button type="submit" disabled={saving} className="btn-primary">
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : "Save Popup"}
          </button>
          {saved && <span className="text-sm text-green-400">✓ Saved</span>}
        </div>
      </form>

      {showPreview && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-300"
          onClick={() => setShowPreview(false)}
        >
          <div
            className="relative w-full max-w-lg scale-90 sm:scale-100"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowPreview(false)}
              className="absolute -top-14 right-0 flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-black tracking-widest transition-all"
            >
              <X className="h-4 w-4" />
              CLOSE PREVIEW
            </button>

            <HomePopup
              settings={{ ...form, popupActive: true }}
              forceShow={true}
              onClose={() => setShowPreview(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}