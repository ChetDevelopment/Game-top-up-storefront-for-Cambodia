"use client";

import { useEffect, useState } from "react";
import { Search, Users } from "lucide-react";

interface Customer {
  key: string;
  email: string | null;
  phone: string | null;
  totalOrders: number;
  paidOrders: number;
  lifetimeUsd: number;
  lastOrderAt: string;
  uidCount: number;
}

export default function CustomersPage() {
  const [data, setData] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const res = await fetch("/api/admin/customers");
      if (res.ok) {
        const d = await res.json();
        setData(d.customers);
      }
      setLoading(false);
    })();
  }, []);

  const filtered = q
    ? data.filter((c) => [c.email, c.phone, c.key].some((v) => (v || "").toLowerCase().includes(q.toLowerCase())))
    : data;

  return (
    <div className="p-4 sm:p-8">
      <h1 className="font-display text-2xl sm:text-3xl font-bold mb-2">Customers</h1>
      <p className="text-royal-muted text-sm mb-6">Aggregated by email or phone. Sorted by lifetime value.</p>

      <div className="relative max-w-md mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-royal-muted" />
        <input
          className="input pl-10"
          placeholder="Search email / phone"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="text-royal-muted text-sm">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="card p-16 text-center">
          <div className="h-12 w-12 rounded-full bg-royal-surface flex items-center justify-center mx-auto mb-3 text-royal-muted">
            <Users className="h-6 w-6" />
          </div>
          <p className="text-royal-muted mb-1">No customers yet</p>
          <p className="text-xs text-royal-muted/60">Customers appear here once they place an order.</p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-royal-muted border-b border-royal-border">
              <tr>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4 text-right">Lifetime $</th>
                <th className="py-3 px-4 text-right">Paid orders</th>
                <th className="py-3 px-4 text-right">Total orders</th>
                <th className="py-3 px-4 text-right">UIDs</th>
                <th className="py-3 px-4">Last order</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-royal-border/60">
              {filtered.map((c) => (
                <tr key={c.key} className="hover:bg-royal-surface/40">
                  <td className="py-2 px-4">
                    <div className="font-medium">{c.email || c.phone || c.key}</div>
                    {c.email && c.phone && <div className="text-xs text-royal-muted">{c.phone}</div>}
                  </td>
                  <td className="py-2 px-4 text-right font-bold text-royal-primary">${c.lifetimeUsd.toFixed(2)}</td>
                  <td className="py-2 px-4 text-right">{c.paidOrders}</td>
                  <td className="py-2 px-4 text-right text-royal-muted">{c.totalOrders}</td>
                  <td className="py-2 px-4 text-right">{c.uidCount}</td>
                  <td className="py-2 px-4 text-xs text-royal-muted whitespace-nowrap">{new Date(c.lastOrderAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

