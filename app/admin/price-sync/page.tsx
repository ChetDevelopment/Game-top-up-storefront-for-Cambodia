"use client";

import { useEffect, useState } from "react";
import { RefreshCw, Download, AlertTriangle, Check } from "lucide-react";
import { useCsrfToken } from "@/lib/useCsrfToken";

interface G2BulkCatalogue {
  id: number;
  name: string;
  amount: number;
}

interface ProductMatch {
  g2bulkItem: G2BulkCatalogue;
  existingProduct: any | null;
  matched: boolean;
  suggestedPrice: number;
}

export default function AdminPriceSyncPage() {
  const { token: csrfToken } = useCsrfToken();
  const [catalogue, setCatalogue] = useState<G2BulkCatalogue[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [matches, setMatches] = useState<ProductMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function fetchCatalogue() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/price-sync/fetch", {
        method: "POST",
        headers: { "x-csrf-token": csrfToken || "" },
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch catalogue");
      }

      setCatalogue(data.catalogue || []);
      setProducts(data.products || []);
      
      // Match G2Bulk items with existing products
      const matched: ProductMatch[] = (data.catalogue || []).map((item: G2BulkCatalogue) => {
        // Try to match by g2bulkCatalogueName first, then by amount
        let existing = data.products?.find(
          (p: any) => p.g2bulkCatalogueName === item.name
        );
        
        // If not found by name, try matching by amount (for diamond products)
        if (!existing && item.name.match(/^\d+$/)) {
          const diamondAmount = parseInt(item.name);
          existing = data.products?.find(
            (p: any) => p.amount === diamondAmount && p.game?.slug === "free-fire"
          );
        }

        // Calculate suggested price (G2Bulk price + 20% markup)
        const suggestedPrice = Math.ceil(item.amount * 1.2 * 100) / 100;

        return {
          g2bulkItem: item,
          existingProduct: existing || null,
          matched: !!existing,
          suggestedPrice,
        };
      });

      setMatches(matched);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function syncPrices() {
    if (!confirm("Sync prices for matched products? This will update prices in database.")) return;
    
    setSyncing(true);
    setError(null);
    setSuccess(null);

    try {
      const payload = matches
        .filter(m => m.matched && m.existingProduct)
        .map(m => ({
          productId: m.existingProduct.id,
          newPrice: m.suggestedPrice,
          catalogueName: m.g2bulkItem.name,
        }));

      const res = await fetch("/api/admin/price-sync/sync", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken || "" 
        },
        body: JSON.stringify({ updates: payload }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to sync prices");
      }

      setSuccess(`Successfully updated ${data.updated} products`);
      await fetchCatalogue(); // Refresh
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    fetchCatalogue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="font-display text-3xl font-bold">Price Sync</h1>
          <p className="text-royal-muted">Sync prices from G2Bulk Free Fire SGMY catalogue</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchCatalogue}
            disabled={loading}
            className="btn-secondary text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Fetching..." : "Refresh"}
          </button>
          <button
            onClick={syncPrices}
            disabled={syncing || matches.filter(m => m.matched).length === 0}
            className="btn-primary text-xs"
          >
            <Download className="h-3.5 w-3.5 mr-1.5" />
            {syncing ? "Syncing..." : `Sync ${matches.filter(m => m.matched).length} Products`}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300 mb-6">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </div>
        </div>
      )}

      {success && (
        <div className="rounded-lg border border-green-500/40 bg-green-500/10 p-4 text-sm text-green-300 mb-6">
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4" />
            {success}
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="p-4 border-b border-royal-border bg-royal-surface/50">
          <h3 className="font-semibold">G2Bulk Free Fire SGMY Catalogue</h3>
          <p className="text-xs text-royal-muted mt-1">
            Showing {matches.length} items from G2Bulk. Matched products will be synced.
          </p>
        </div>

        {loading ? (
          <div className="p-12 text-center text-royal-muted">Loading catalogue...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-royal-surface text-royal-muted text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left px-5 py-3">G2Bulk Name</th>
                  <th className="text-right px-5 py-3">G2Bulk Price</th>
                  <th className="text-left px-5 py-3">Matched Product</th>
                  <th className="text-right px-5 py-3">Current Price</th>
                  <th className="text-right px-5 py-3">Suggested Price</th>
                  <th className="text-center px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-royal-border">
                {matches.map((match, idx) => (
                  <tr key={idx} className="hover:bg-royal-surface/50">
                    <td className="px-5 py-3 font-mono text-sm">{match.g2bulkItem.name}</td>
                    <td className="px-5 py-3 text-right font-mono text-royal-primary">
                      ${match.g2bulkItem.amount.toFixed(3)}
                    </td>
                    <td className="px-5 py-3">
                      {match.matched ? (
                        <span className="text-sm">{match.existingProduct.name}</span>
                      ) : (
                        <span className="text-xs text-royal-muted">Not matched</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right font-mono">
                      {match.matched ? (
                        <span className={match.existingProduct.priceUsd !== match.suggestedPrice ? "text-yellow-400" : "text-green-400"}>
                          ${match.existingProduct.priceUsd.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-royal-muted">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-royal-accent">
                      ${match.suggestedPrice.toFixed(2)}
                    </td>
                    <td className="px-5 py-3 text-center">
                      {match.matched ? (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-green-500/20 text-green-400">
                          <Check className="h-3 w-3" />
                          Matched
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-yellow-500/20 text-yellow-400">
                          <AlertTriangle className="h-3 w-3" />
                          Unmatched
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-6 p-4 rounded-lg border border-royal-border bg-royal-surface/30">
        <h4 className="font-semibold text-sm mb-2">How it works:</h4>
        <ul className="text-xs text-royal-muted space-y-1 list-disc list-inside">
          <li>Fetches the latest catalogue from G2Bulk Free Fire SGMY</li>
          <li>Matches items by catalogue name or diamond amount</li>
          <li>Suggests new prices with 20% markup over G2Bulk cost</li>
          <li>Click "Sync" to update matched products in your database</li>
          <li>For Mobile Legends, use the existing Pricing Tool (G2Bulk is expensive for MLBB)</li>
        </ul>
      </div>
    </div>
  );
}
