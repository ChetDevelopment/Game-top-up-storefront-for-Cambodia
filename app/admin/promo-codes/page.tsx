"use client";

import { useEffect, useState } from "react";
import { Tag, Plus, Trash2, ToggleLeft, ToggleRight } from "lucide-react";

interface PromoCode {
  id: string;
  code: string;
  discountType: string;
  discountValue: number;
  minOrderUsd: number;
  maxUses: number;
  usedCount: number;
  expiresAt: string | null;
  active: boolean;
  createdAt: string;
}

export default function AdminPromoCodesPage() {
  const [codes, setCodes] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  // Create form
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState<"PERCENT" | "FIXED">("PERCENT");
  const [discountValue, setDiscountValue] = useState("");
  const [minOrderUsd, setMinOrderUsd] = useState("0");
  const [maxUses, setMaxUses] = useState("0");
  const [expiresAt, setExpiresAt] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  async function loadCodes() {
    setLoading(true);
    const res = await fetch("/api/admin/promo-codes");
    const data = await res.json();
    setCodes(data);
    setLoading(false);
  }

  useEffect(() => {
    loadCodes();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    try {
      const res = await fetch("/api/admin/promo-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim(),
          discountType,
          discountValue: parseFloat(discountValue),
          minOrderUsd: parseFloat(minOrderUsd) || 0,
          maxUses: parseInt(maxUses) || 0,
          expiresAt: expiresAt || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create");
      setCreating(false);
      setCode("");
      setDiscountValue("");
      setMinOrderUsd("0");
      setMaxUses("0");
      setExpiresAt("");
      loadCodes();
    } catch (err: any) {
      setFormError(err.message);
    }
  }

  async function toggleActive(id: string, active: boolean) {
    await fetch(`/api/admin/promo-codes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !active }),
    });
    loadCodes();
  }

  async function deleteCode(id: string) {
    if (!confirm("Delete this promo code?")) return;
    await fetch(`/api/admin/promo-codes/${id}`, { method: "DELETE" });
    loadCodes();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold">Promo Codes</h1>
          <p className="text-royal-muted text-sm">Create and manage discount codes for customers.</p>
        </div>
        <button
          onClick={() => setCreating(!creating)}
          className="btn-primary text-sm"
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          New Code
        </button>
      </div>

      {/* Create form */}
      {creating && (
        <form onSubmit={handleCreate} className="card p-5 mb-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Code</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="input font-mono uppercase"
                placeholder="SUMMER20"
                required
              />
            </div>
            <div>
              <label className="label">Discount Type</label>
              <select
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value as any)}
                className="input"
              >
                <option value="PERCENT">Percentage (%)</option>
                <option value="FIXED">Fixed Amount ($)</option>
              </select>
            </div>
            <div>
              <label className="label">
                Discount Value {discountType === "PERCENT" ? "(%)" : "($)"}
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                className="input"
                required
              />
            </div>
            <div>
              <label className="label">Min. Order ($)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={minOrderUsd}
                onChange={(e) => setMinOrderUsd(e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="label">Max Uses (0 = unlimited)</label>
              <input
                type="number"
                min="0"
                value={maxUses}
                onChange={(e) => setMaxUses(e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="label">Expires At (optional)</label>
              <input
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="input"
              />
            </div>
          </div>
          {formError && <p className="text-sm text-red-400">{formError}</p>}
          <div className="flex gap-3">
            <button type="submit" className="btn-primary text-sm">Create Code</button>
            <button type="button" onClick={() => setCreating(false)} className="btn-ghost text-sm">Cancel</button>
          </div>
        </form>
      )}

      {/* Table */}
      {loading ? (
        <div className="text-center py-12 text-royal-muted">Loading...</div>
      ) : codes.length === 0 ? (
        <div className="text-center py-16">
          <Tag className="h-12 w-12 text-royal-muted/40 mx-auto mb-4" />
          <p className="text-royal-muted mb-2">No promo codes yet</p>
          <button onClick={() => setCreating(true)} className="btn-primary text-sm">
            <Plus className="h-4 w-4" /> Create Your First Code
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-royal-border text-royal-muted text-left">
                <th className="py-3 px-3 font-medium">Code</th>
                <th className="py-3 px-3 font-medium">Discount</th>
                <th className="py-3 px-3 font-medium hidden sm:table-cell">Min Order</th>
                <th className="py-3 px-3 font-medium">Uses</th>
                <th className="py-3 px-3 font-medium hidden md:table-cell">Expires</th>
                <th className="py-3 px-3 font-medium">Status</th>
                <th className="py-3 px-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {codes.map((c) => {
                const expired = c.expiresAt && new Date(c.expiresAt) < new Date();
                const maxedOut = c.maxUses > 0 && c.usedCount >= c.maxUses;
                return (
                  <tr key={c.id} className="border-b border-royal-border/50 hover:bg-royal-surface/50">
                    <td className="py-3 px-3 font-mono font-bold text-royal-primary">{c.code}</td>
                    <td className="py-3 px-3">
                      {c.discountType === "PERCENT" ? `${c.discountValue}%` : `$${c.discountValue.toFixed(2)}`}
                    </td>
                    <td className="py-3 px-3 hidden sm:table-cell">
                      {c.minOrderUsd > 0 ? `$${c.minOrderUsd.toFixed(2)}` : "—"}
                    </td>
                    <td className="py-3 px-3">
                      {c.usedCount}{c.maxUses > 0 ? `/${c.maxUses}` : "/∞"}
                    </td>
                    <td className="py-3 px-3 hidden md:table-cell text-xs">
                      {c.expiresAt
                        ? new Date(c.expiresAt).toLocaleDateString()
                        : "Never"}
                      {expired && <span className="text-red-400 ml-1">(expired)</span>}
                    </td>
                    <td className="py-3 px-3">
                      {!c.active || expired || maxedOut ? (
                        <span className="text-xs text-red-400 font-medium">
                          {expired ? "Expired" : maxedOut ? "Maxed" : "Disabled"}
                        </span>
                      ) : (
                        <span className="text-xs text-green-400 font-medium">Active</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => toggleActive(c.id, c.active)}
                          className="p-1.5 rounded-lg hover:bg-royal-surface transition-colors text-royal-muted hover:text-royal-text"
                          title={c.active ? "Disable" : "Enable"}
                        >
                          {c.active ? (
                            <ToggleRight className="h-4 w-4 text-green-400" />
                          ) : (
                            <ToggleLeft className="h-4 w-4" />
                          )}
                        </button>
                        <button
                          onClick={() => deleteCode(c.id)}
                          className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors text-royal-muted hover:text-red-400"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

