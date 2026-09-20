"use client";

import { useEffect, useState } from "react";
import { User, Loader2 } from "lucide-react";

export default function AdminResellersPage() {
  const [resellers, setResellers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/admin/resellers");
    const data = await res.json();
    setResellers(data);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleAction(resellerId: string, action: "approve" | "revoke") {
    await fetch("/api/admin/resellers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resellerId, action }),
    });
    load();
  }

  return (
    <div className="p-8">
      <h1 className="font-display text-3xl font-bold mb-2">Resellers</h1>
      <p className="text-royal-muted mb-6">Manage reseller accounts.</p>

      {loading ? (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="h-8 w-8 text-royal-primary animate-spin" />
        </div>
      ) : resellers.length === 0 ? (
        <div className="card p-12 text-center">
          <User className="h-12 w-12 text-royal-muted/30 mx-auto mb-4" />
          <p className="text-royal-muted">No resellers yet.</p>
          <p className="text-xs text-royal-muted/60 mt-1">
            Users with role RESELLER will appear here.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-royal-surface text-royal-muted text-xs uppercase">
              <tr>
                <th className="text-left p-4">Email</th>
                <th className="text-left p-4">Name</th>
                <th className="text-right p-4">Orders</th>
                <th className="text-right p-4">Total Spent</th>
                <th className="text-center p-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-royal-border">
              {resellers.map((r: any) => (
                <tr key={r.id} className="hover:bg-royal-surface/50">
                  <td className="p-4">{r.email}</td>
                  <td className="p-4">{r.name || "-"}</td>
                  <td className="p-4 text-right font-mono">{r._count.orders}</td>
                  <td className="p-4 text-right font-mono">${r.totalSpentUsd.toFixed(2)}</td>
                  <td className="p-4">
                    <div className="flex gap-2 justify-center">
                      <button
                        onClick={() => handleAction(r.id, "revoke")}
                        className="text-xs text-red-400 hover:underline"
                      >
                        Revoke
                      </button>
                    </div>
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