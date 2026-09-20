"use client";

import { useState, useEffect } from "react";
import { Gift, Loader2, Check } from "lucide-react";

export default function SpinWinWidget() {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ prize: string; prizeValue: number; spinId: string } | null>(null);
  const [spun, setSpun] = useState(false);
  const [claimed, setClaimed] = useState(false);

  useEffect(() => {
    fetch("/api/spin-win")
      .then(r => r.json())
      .then(data => {
        if (data.spun) {
          setSpun(true);
          setClaimed(data.claimed);
          if (!data.claimed) {
            setResult({ prize: data.prize, prizeValue: 0, spinId: "" });
          }
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSpin() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/spin-win", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setResult(data);
        setSpun(true);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleClaim() {
    if (!result?.spinId) return;
    setSubmitting(true);
    try {
      await fetch("/api/spin-win", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spinId: result.spinId }),
      });
      setClaimed(true);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return null;

  const getPrizeLabel = (prize: string) => {
    if (prize.includes("points")) return `${prize.split("_")[0]} TK Points`;
    if (prize.includes("discount")) return "$5 Discount";
    if (prize.includes("diamond")) return "10 Free Diamonds";
    return prize;
  };

  if (spun && !result) {
    return (
      <div className="card p-4 text-center">
        <p className="text-sm text-royal-muted">Come back tomorrow!</p>
      </div>
    );
  }

  if (result) {
    return (
      <div className="card p-4 text-center">
        <Gift className="h-8 w-8 text-royal-primary mx-auto mb-2" />
        <p className="font-bold text-sm mb-1">You won!</p>
        <p className="text-lg font-black text-royal-primary mb-2">
          {getPrizeLabel(result.prize)}
        </p>
        {!claimed ? (
          <button
            onClick={handleClaim}
            disabled={submitting}
            className="btn-primary text-xs"
          >
            {submitting ? "Claiming..." : "Claim Prize"}
          </button>
        ) : (
          <p className="text-xs text-green-400 flex items-center justify-center gap-1">
            <Check size={14} /> Claimed!
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="card p-4 text-center">
      <div className="relative">
        <div className="absolute inset-0 animate-ping bg-royal-primary/20 rounded-full" />
        <button
          onClick={handleSpin}
          disabled={submitting}
          className="relative btn-primary w-full text-sm"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin mx-auto" />
          ) : (
            <>
              <Gift className="h-4 w-4 mr-1 inline" />
              Spin & Win!
            </>
          )}
        </button>
      </div>
      <p className="text-[10px] text-royal-muted mt-2">One spin per day</p>
    </div>
  );
}