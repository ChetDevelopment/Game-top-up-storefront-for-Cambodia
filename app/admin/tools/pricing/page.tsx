"use client";

import { useEffect, useState, useMemo } from "react";
import { DollarSign, TrendingUp, TrendingDown, Save, AlertTriangle, Percent, Hash, CheckCircle2 } from "lucide-react";

export default function BulkPricingPage() {
  const [games, setGames] = useState<any[]>([]);
  const [selectedGame, setSelectedGame] = useState("");
  const [value, setValue] = useState("0");
  const [type, setType] = useState<"percentage" | "fixed">("percentage");
  const [direction, setDirection] = useState<"up" | "down">("up");
  const [targetFields, setTargetFields] = useState<string[]>(["priceUsd"]);
  const [rounding, setRounding] = useState("none");
  const [updating, setUpdating] = useState(false);
  const [preview, setPreview] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/admin/games").then((r) => r.json()).then(setGames);
  }, []);

  useEffect(() => {
    if (selectedGame) {
      fetch(`/api/admin/products?gameId=${selectedGame}`)
        .then((r) => r.json())
        .then(setPreview);
    } else {
      setPreview([]);
    }
  }, [selectedGame]);

  const applyRounding = (price: number, r: string) => {
    if (r === "none") return Math.round(price * 100) / 100;
    const integerPart = Math.floor(price);
    if (r === "99") return integerPart + 0.99;
    if (r === "95") return integerPart + 0.95;
    if (r === "00") return Math.round(price);
    return price;
  };

  const calculateNewPrice = (current: number) => {
    let newVal: number;
    const numValue = Number(value);
    if (type === "percentage") {
      const factor = direction === "up" ? (1 + numValue / 100) : (1 - numValue / 100);
      newVal = current * factor;
    } else {
      newVal = direction === "up" ? (current + numValue) : (current - numValue);
    }
    return applyRounding(Math.max(0.01, newVal), rounding);
  };

  async function handleUpdate() {
    if (!selectedGame) return;
    const fieldsText = targetFields.map(f => f === "priceUsd" ? "Retail" : "Reseller").join(" and ");
    const confirmMsg = `Update ${fieldsText} prices for this game? This action cannot be undone.`;
    if (!confirm(confirmMsg)) return;

    setUpdating(true);
    const res = await fetch("/api/admin/tools/pricing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gameId: selectedGame,
        value: Number(value),
        type,
        direction,
        targetFields,
        rounding
      }),
    });

    if (res.ok) {
      alert("Prices updated successfully!");
      fetch(`/api/admin/products?gameId=${selectedGame}`)
        .then((r) => r.json())
        .then(setPreview);
    } else {
      alert("Update failed.");
    }
    setUpdating(false);
  }

  const toggleField = (f: string) => {
    setTargetFields(prev => 
      prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]
    );
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="font-display text-3xl font-bold mb-2">Advanced Pricing Tool</h1>
          <p className="text-royal-muted">Bulk adjust product prices with rounding rules and targeted fields.</p>
        </div>
        <div className="hidden md:flex items-center gap-2 text-xs bg-royal-primary/10 text-royal-primary px-3 py-1.5 rounded-full border border-royal-primary/20">
          <CheckCircle2 className="h-3 w-3" />
          v2.0 Enhanced
        </div>
      </div>

      <div className="grid lg:grid-cols-12 gap-8">
        <div className="lg:col-span-5 space-y-6">
          <div className="card p-6 border-royal-primary/20">
            <h3 className="font-bold mb-6 flex items-center gap-2 text-royal-primary">
              <TrendingUp className="h-5 w-5" />
              Adjustment Configuration
            </h3>
            
            <div className="space-y-5">
              <div>
                <label className="label text-xs uppercase tracking-wider font-semibold">1. Select Game</label>
                <select 
                  className="input bg-royal-surface/50" 
                  value={selectedGame} 
                  onChange={(e) => setSelectedGame(e.target.value)}
                >
                  <option value="">— choose game to target —</option>
                  {games.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>

              <div>
                <label className="label text-xs uppercase tracking-wider font-semibold">2. Target Fields</label>
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    onClick={() => toggleField("priceUsd")}
                    className={`py-2 px-3 rounded-lg border text-sm transition-all flex items-center justify-center gap-2 ${targetFields.includes("priceUsd") ? "bg-royal-primary/20 border-royal-primary text-royal-text" : "border-royal-border text-royal-muted"}`}
                  >
                    Retail Price
                  </button>
                  <button 
                    onClick={() => toggleField("resellerPriceUsd")}
                    className={`py-2 px-3 rounded-lg border text-sm transition-all flex items-center justify-center gap-2 ${targetFields.includes("resellerPriceUsd") ? "bg-royal-primary/20 border-royal-primary text-royal-text" : "border-royal-border text-royal-muted"}`}
                  >
                    Reseller Price
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label text-xs uppercase tracking-wider font-semibold">3. Type</label>
                  <div className="flex bg-royal-surface rounded-lg p-1 border border-royal-border">
                    <button 
                      onClick={() => setType("percentage")}
                      className={`flex-1 flex items-center justify-center py-1.5 rounded-md text-xs transition-all ${type === "percentage" ? "bg-royal-primary text-white shadow-lg" : "text-royal-muted hover:text-royal-text"}`}
                    >
                      <Percent className="h-3 w-3 mr-1" /> Percent
                    </button>
                    <button 
                      onClick={() => setType("fixed")}
                      className={`flex-1 flex items-center justify-center py-1.5 rounded-md text-xs transition-all ${type === "fixed" ? "bg-royal-primary text-white shadow-lg" : "text-royal-muted hover:text-royal-text"}`}
                    >
                      <Hash className="h-3 w-3 mr-1" /> Fixed
                    </button>
                  </div>
                </div>
                <div>
                  <label className="label text-xs uppercase tracking-wider font-semibold">4. Direction</label>
                  <div className="flex bg-royal-surface rounded-lg p-1 border border-royal-border">
                    <button 
                      onClick={() => setDirection("up")}
                      className={`flex-1 flex items-center justify-center py-1.5 rounded-md text-xs transition-all ${direction === "up" ? "bg-emerald-600 text-white shadow-lg" : "text-royal-muted hover:text-royal-text"}`}
                    >
                      <TrendingUp className="h-3 w-3 mr-1" /> Up
                    </button>
                    <button 
                      onClick={() => setDirection("down")}
                      className={`flex-1 flex items-center justify-center py-1.5 rounded-md text-xs transition-all ${direction === "down" ? "bg-red-600 text-white shadow-lg" : "text-royal-muted hover:text-royal-text"}`}
                    >
                      <TrendingDown className="h-3 w-3 mr-1" /> Down
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <label className="label text-xs uppercase tracking-wider font-semibold">5. Value</label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-royal-muted">
                    {type === "fixed" ? "$" : ""}
                  </div>
                  <input 
                    type="number" 
                    className={`input pl-8 pr-12`} 
                    value={value} 
                    onChange={(e) => setValue(e.target.value)}
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-royal-muted">
                    {type === "percentage" ? "%" : "USD"}
                  </div>
                </div>
              </div>

              <div>
                <label className="label text-xs uppercase tracking-wider font-semibold">6. Rounding Rule</label>
                <select 
                  className="input bg-royal-surface/50" 
                  value={rounding} 
                  onChange={(e) => setRounding(e.target.value)}
                >
                  <option value="none">None (Keep exact)</option>
                  <option value="99">End in .99 (e.g. $4.99)</option>
                  <option value="95">End in .95 (e.g. $4.95)</option>
                  <option value="00">Round to Nearest $1.00</option>
                </select>
              </div>

              <div className="p-4 rounded-xl bg-red-500/5 border border-red-500/20 text-red-400 text-[11px] flex gap-3">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <p>Warning: This will permanently update all products for the selected game. Check the preview carefully before applying.</p>
              </div>

              <button 
                onClick={handleUpdate}
                disabled={updating || !selectedGame || Number(value) <= 0 || targetFields.length === 0}
                className="w-full btn-primary py-4 flex items-center justify-center gap-2 group shadow-xl shadow-royal-primary/20"
              >
                <Save className="h-5 w-5 transition-transform group-hover:scale-110" />
                {updating ? "Processing Transaction..." : "Apply Bulk Changes"}
              </button>
            </div>
          </div>
        </div>

        <div className="lg:col-span-7 flex flex-col gap-6">
          <div className="card p-0 overflow-hidden flex flex-col border-royal-border/40">
            <div className="p-6 border-b border-royal-border flex justify-between items-center bg-royal-surface/30">
              <h3 className="font-bold flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-royal-primary" />
                Live Price Preview
              </h3>
              {selectedGame && (
                <span className="text-[10px] bg-royal-surface border border-royal-border px-2 py-0.5 rounded text-royal-muted">
                  {preview.length} Products Found
                </span>
              )}
            </div>

            <div className="flex-1 min-h-[500px] overflow-y-auto">
              {!selectedGame ? (
                <div className="h-full flex flex-col items-center justify-center text-royal-muted text-sm py-40 text-center space-y-4">
                  <div className="w-16 h-16 rounded-full bg-royal-surface flex items-center justify-center border border-dashed border-royal-border">
                    <DollarSign className="h-8 w-8 opacity-20" />
                  </div>
                  <p>Select a game to generate price preview</p>
                </div>
              ) : (
                <div className="p-0">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-royal-dark text-royal-muted uppercase text-[10px] tracking-widest z-10">
                      <tr>
                        <th className="text-left px-6 py-4">Product Name</th>
                        <th className="text-right px-6 py-4">Current</th>
                        <th className="text-right px-6 py-4">Adjustment</th>
                        <th className="text-right px-6 py-4 bg-royal-primary/5 text-royal-primary">New Price</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-royal-border/50">
                      {preview.map(p => {
                        const current = p.priceUsd;
                        const newVal = calculateNewPrice(current);
                        const diff = newVal - current;
                        
                        return (
                          <tr key={p.id} className="hover:bg-royal-surface/50 transition-colors group">
                            <td className="px-6 py-4 font-medium text-royal-text group-hover:text-royal-primary transition-colors">
                              {p.name}
                            </td>
                            <td className="px-6 py-4 text-right text-royal-muted font-mono">
                              ${current.toFixed(2)}
                            </td>
                            <td className={`px-6 py-4 text-right font-mono ${diff >= 0 ? "text-emerald-500" : "text-red-400"}`}>
                              {diff >= 0 ? "+" : ""}{diff.toFixed(2)}
                            </td>
                            <td className="px-6 py-4 text-right text-royal-text font-mono font-bold bg-royal-primary/5">
                              ${newVal.toFixed(2)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
          
          <div className="card p-4 bg-royal-surface/30 border-dashed">
            <h4 className="text-[10px] uppercase font-bold text-royal-muted mb-2 tracking-widest">Pricing Strategy Tip</h4>
            <p className="text-xs text-royal-muted leading-relaxed">
              Using the <span className="text-royal-text">.99 rounding rule</span> is a proven psychological pricing tactic that makes products seem significantly cheaper than they are. For example, $5.00 vs $4.99 can increase conversion rates by up to 15%.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
