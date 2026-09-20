"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Plus, Trash2, Save, X, Image as ImageIcon, Pencil, Crop, RotateCw } from "lucide-react";
import ReactCrop, { Crop as CropType, centerCrop, makeAspectCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";

interface Banner {
  id: string;
  title: string;
  subtitle: string | null;
  imageUrl: string;
  linkUrl: string | null;
  ctaLabel: string | null;
  active: boolean;
  sortOrder: number;
}

const empty = {
  title: "",
  subtitle: "",
  imageUrl: "",
  linkUrl: "",
  ctaLabel: "",
  active: true,
  sortOrder: 0,
};

export default function BannersAdminPage() {
  const [items, setItems] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Banner | null>(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Cropper states
  const [showCropper, setShowCropper] = useState(false);
  const [cropImage, setCropImage] = useState<string | null>(null);
  const [crop, setCrop] = useState<CropType>();
  const [completedCrop, setCompletedCrop] = useState<CropType>();
  const imgRef = useRef<HTMLImageElement>(null);

  function centerAspectCrop(mediaWidth: number, mediaHeight: number, aspect: number) {
    return centerCrop(
      makeAspectCrop({ unit: "%", width: 90 }, aspect, mediaWidth, mediaHeight),
      mediaWidth,
      mediaHeight
    );
  }

  function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const { width, height } = e.currentTarget;
    const aspect = 4 / 1; // 16:4 ratio = 1920:480
    setCrop(centerAspectCrop(width, height, aspect));
  }

  const getCroppedImage = useCallback(async () => {
    if (!imgRef.current || !completedCrop) return null;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const scaleX = imgRef.current.naturalWidth / imgRef.current.width;
    const scaleY = imgRef.current.naturalHeight / imgRef.current.height;

    const cropX = (completedCrop.x / 100) * imgRef.current.width;
    const cropY = (completedCrop.y / 100) * imgRef.current.height;
    const cropWidth = (completedCrop.width / 100) * imgRef.current.width;
    const cropHeight = (completedCrop.height / 100) * imgRef.current.height;

    const targetWidth = 1920;
    const targetHeight = 480;

    canvas.width = targetWidth;
    canvas.height = targetHeight;
    ctx.drawImage(
      imgRef.current,
      cropX * scaleX,
      cropY * scaleY,
      cropWidth * scaleX,
      cropHeight * scaleY,
      0,
      0,
      targetWidth,
      targetHeight
    );

    return new Promise<string>((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob) return resolve("");
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      }, "image/jpeg", 0.9);
    });
  }, [completedCrop]);

  async function applyCrop() {
    const croppedDataUrl = await getCroppedImage();
    if (croppedDataUrl) {
      setForm((f) => ({ ...f, imageUrl: croppedDataUrl }));
      setShowCropper(false);
      setCropImage(null);
    }
  }

  function openCropModal(dataUrl: string) {
    setCropImage(dataUrl);
    setShowCropper(true);
  }

  async function load() {
    setLoading(true);
    const res = await fetch("/api/admin/banners");
    if (res.ok) setItems(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function openNew() {
    setEditing(null);
    setForm(empty);
  }

  function openEdit(b: Banner) {
    setEditing(b);
    setForm({
      title: b.title,
      subtitle: b.subtitle ?? "",
      imageUrl: b.imageUrl,
      linkUrl: b.linkUrl ?? "",
      ctaLabel: b.ctaLabel ?? "",
      active: b.active,
      sortOrder: b.sortOrder,
    });
  }

  async function upload(file: File) {
    setUploading(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      openCropModal(dataUrl);
      setUploading(false);
    };
    reader.readAsDataURL(file);
  }

  async function save() {
    setSaving(true);
    const url = editing ? `/api/admin/banners/${editing.id}` : "/api/admin/banners";
    const method = editing ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        subtitle: form.subtitle || null,
        linkUrl: form.linkUrl || null,
        ctaLabel: form.ctaLabel || null,
      }),
    });
    if (res.ok) {
      setForm(empty);
      setEditing(null);
      await load();
    } else {
      alert("Save failed");
    }
    setSaving(false);
  }

  async function remove(id: string) {
    if (!confirm("Delete this banner?")) return;
    await fetch(`/api/admin/banners/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="p-4 sm:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold">Hero Banners</h1>
          <p className="text-royal-muted text-sm">Slides shown on the homepage carousel.</p>
        </div>
        <button onClick={openNew} className="btn-primary">
          <Plus className="h-4 w-4" /> 
          New
        </button>
      </div>

      {/* Editor */}
      <div className="card p-5 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">{editing ? `Edit — ${editing.title}` : "New banner"}</h2>
          {editing && (
            <button onClick={openNew} className="text-xs text-royal-muted hover:text-royal-text inline-flex items-center gap-1">
              <X className="h-3 w-3" /> 
              Cancel edit
            </button>
          )}
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Title *</label>
            <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div>
            <label className="label">Subtitle</label>
            <input className="input" value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Image *</label>
            <div className="flex items-center gap-3">
              <input
                type="text"
                className="input flex-1"
                placeholder="https://... or /uploads/..."
                value={form.imageUrl}
                onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
              />
              <label className="btn-ghost cursor-pointer">
                <ImageIcon className="h-4 w-4" />
                {uploading ? "Uploading..." : "Upload"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
                />
              </label>
            </div>
            <p className="text-xs text-royal-muted mt-1">Recommended: 1920x480px (16:4 ratio). Image will be cropped to fit.</p>
            {form.imageUrl && (
              <>
                {/* Live Preview - Shows exactly how it looks on site */}
                <div className="mt-3">
                  <p className="text-xs font-bold text-royal-muted mb-2">📱 Live Preview (User site):</p>
                  <div className="relative h-48 sm:h-72 lg:h-80 w-full rounded-lg overflow-hidden border border-royal-border bg-royal-card">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={form.imageUrl} alt="" className="h-full w-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-4">
                      <p className="font-display text-lg font-bold text-white drop-shadow">{form.title || "Banner Title"}</p>
                      {form.subtitle && <p className="text-xs text-white/80 mt-1">{form.subtitle}</p>}
                      {form.ctaLabel && (
                        <span className="mt-2 inline-flex items-center gap-1 rounded-lg bg-royal-primary px-3 py-1 text-xs font-semibold text-black">
                          {form.ctaLabel}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {/* Admin thumbnail */}
                <p className="text-xs font-bold text-royal-muted mt-3 mb-1">Admin preview:</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={form.imageUrl} alt="" className="h-32 rounded-lg border border-royal-border object-cover w-full" />
              </>
            )}
          </div>
          <div>
            <label className="label">Link URL</label>
            <input className="input" value={form.linkUrl} onChange={(e) => setForm({ ...form, linkUrl: e.target.value })} placeholder="/games/pubg-mobile" />
          </div>
          <div>
            <label className="label">CTA Label</label>
            <input className="input" value={form.ctaLabel} onChange={(e) => setForm({ ...form, ctaLabel: e.target.value })} placeholder="Top up now" />
          </div>
          <div>
            <label className="label">Sort order</label>
            <input type="number" className="input" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: parseInt(e.target.value) || 0 })} />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
              <span className="text-sm">Active</span>
            </label>
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          <button onClick={save} disabled={saving || !form.title || !form.imageUrl} className="btn-primary">
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : editing ? "Save changes" : "Create banner"}
          </button>
          {form.imageUrl && (
            <button
              type="button"
              onClick={() => openCropModal(form.imageUrl)}
              className="btn-ghost"
            >
              <Crop className="h-4 w-4" />
              Recrop Image
            </button>
          )}
        </div>
      </div>

      {/* Cropper Modal */}
      {showCropper && cropImage && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-royal-card rounded-xl p-4 max-w-4xl w-full max-h-[90vh] overflow-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold flex items-center gap-2">
                <Crop className="h-5 w-5" />
                Crop Banner Image
              </h3>
              <button onClick={() => { setShowCropper(false); setCropImage(null); }} className="text-royal-muted hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-royal-muted mb-3">Drag to adjust crop area. Image will be saved at 1920x480px.</p>
            <div className="max-h-[60vh] overflow-auto">
              <ReactCrop
                crop={crop}
                onChange={(_, pct) => setCrop(pct)}
                onComplete={(_, pct) => setCompletedCrop(pct)}
                aspect={4 / 1}
              >
                <img
                  ref={imgRef}
                  src={cropImage}
                  alt="Crop preview"
                  onLoad={onImageLoad}
                  className="max-h-[60vh] w-auto"
                />
              </ReactCrop>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => { setShowCropper(false); setCropImage(null); }} className="btn-ghost">
                Cancel
              </button>
              <button onClick={applyCrop} className="btn-primary">
                <RotateCw className="h-4 w-4" />
                Apply Crop
              </button>
            </div>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="text-royal-muted text-sm">Loading...</div>
      ) : items.length === 0 ? (
        <div className="card p-10 text-center text-royal-muted text-sm">No banners yet.</div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((b) => (
            <div key={b.id} className="card overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={b.imageUrl} alt="" className="h-40 w-full object-cover" />
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{b.title}</h3>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${b.active ? "bg-green-500/10 text-green-400" : "bg-royal-muted/10 text-royal-muted"}`}>
                    {b.active ? "LIVE" : "HIDDEN"}
                  </span>
                </div>
                {b.subtitle && <p className="text-xs text-royal-muted mt-1">{b.subtitle}</p>}
                <div className="mt-4 flex gap-2">
                  <button onClick={() => openEdit(b)} className="text-xs btn-ghost px-3 py-1.5 inline-flex items-center gap-1">
                    <Pencil className="h-3 w-3" />
                    Edit
                  </button>
                  <button onClick={() => remove(b.id)} className="text-xs text-red-400 hover:text-red-300 inline-flex items-center gap-1">
                    <Trash2 className="h-3 w-3" /> 
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

