"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, Loader2 } from "lucide-react";

export default function AdminBundlesPage() {
  const [bundles, setBundles] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  
  const [form, setForm] = useState({
    name: "",
    description: "",
    products: [] as string[],
    bundlePrice: 0,
    badge: "",
    expiresAt: "",
  });

  async function load() {
    setLoading(true);
    const [bundlesRes, productsRes] = await Promise.all([
      fetch("/api/admin/bundles"),
      fetch("/api/products?active=true")
    ]);
    const bundlesData = await bundlesRes.json();
    const productsData = await productsRes.json();
    setBundles(bundlesData);
    const prods = Array.isArray(productsData) ? productsData : (productsData.products || []);
    setProducts(prods);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.products.length < 2) {
      alert("Select at least 2 products");
      return;
    }
    setSubmitting(true);
    const res = await fetch("/api/admin/bundles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setForm({ name: "", description: "", products: [], bundlePrice: 0, badge: "", expiresAt: "" });
      load();
    } else {
      alert("Failed to create bundle");
    }
    setSubmitting(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this bundle?")) return;
    await fetch("/api/admin/bundles", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    load();
  }

  function toggleProduct(productId: string) {
    setForm(prev => ({
      ...prev,
      products: prev.products.includes(productId)
        ? prev.products.filter(id => id !== productId)
        : [...prev.products, productId]
    }));
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-royal-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-8">
      <h1 className="font-display text-3xl font-bold mb-2">Product Bundles</h1>
      <p className="text-royal-muted mb-6">Create discounted product bundles.</p>

      <div className="grid lg:grid-cols-2 gap-8">
        <div>
          <form onSubmit={handleSubmit} className="card p-6 space-y-4">
            <h2 className="font-bold text-lg">Create New Bundle</h2>
            
            <div>
              <label className="label">Bundle Name</label>
              <input
                type="text"
                className="input"
                value={form.name}
                onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                required
              />
            </div>

            <div>
              <label className="label">Description (optional)</label>
              <textarea
                className="input"
                rows={2}
                value={form.description}
                onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
              />
            </div>

            <div>
              <label className="label">Select Products (min 2)</label>
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto border border-royal-border rounded-lg p-2">
                {products.map((p: any) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggleProduct(p.id)}
                    className={`p-2 rounded text-left text-sm transition-all ${
                      form.products.includes(p.id)
                        ? "bg-royal-primary/20 text-royal-primary border border-royal-primary"
                        : "bg-royal-surface text-royal-muted border border-transparent hover:border-royal-border"
                    }`}
                  >
                    {p.name} - ${p.priceUsd.toFixed(2)}
                  </button>
                ))}
              </div>
              <p className="text-xs text-royal-muted mt-1">
                Selected: {form.products.length} products
              </p>
            </div>

            <div>
              <label className="label">Bundle Price ($)</label>
              <input
                type="number"
                step="0.01"
                className="input"
                value={form.bundlePrice}
                onChange={e => setForm(prev => ({ ...prev, bundlePrice: parseFloat(e.target.value) || 0 }))}
                required
              />
            </div>

            <div>
              <label className="label">Badge (optional)</label>
              <input
                type="text"
                className="input"
                placeholder="Best Value"
                value={form.badge}
                onChange={e => setForm(prev => ({ ...prev, badge: e.target.value }))}
              />
            </div>

            <div>
              <label className="label">Expires At (optional)</label>
              <input
                type="datetime-local"
                className="input"
                value={form.expiresAt}
                onChange={e => setForm(prev => ({ ...prev, expiresAt: e.target.value }))}
              />
            </div>

            <button type="submit" disabled={submitting} className="btn-primary w-full">
              {submitting ? "Creating..." : "Create Bundle"}
            </button>
          </form>
        </div>

        <div>
          <h2 className="font-bold text-lg mb-4">Existing Bundles</h2>
          <div className="space-y-3">
            {bundles.length === 0 ? (
              <p className="text-royal-muted">No bundles yet.</p>
            ) : (
              bundles.map((bundle: any) => (
                <div key={bundle.id} className="card p-4 flex items-center justify-between">
                  <div>
                    <h3 className="font-bold">{bundle.name}</h3>
                    <p className="text-xs text-royal-muted">
                      {JSON.parse(bundle.products).length} products · ${bundle.bundlePrice.toFixed(2)}
                      {bundle.badge && <span className="ml-2 text-royal-primary">{bundle.badge}</span>}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDelete(bundle.id)}
                    className="p-2 text-royal-muted hover:text-red-400"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}