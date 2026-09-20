"use client";

import { useState } from "react";
import { Dices, Sparkles, Trophy, Loader2 } from "lucide-react";

interface Reward {
  name: string;
  amount: number;
  isJackpot: boolean;
}

export default function MysteryBoxUI({ orderNumber, initialStatus }: { orderNumber: string, initialStatus: string }) {
  const [opening, setOpening] = useState(false);
  const [reward, setReward] = useState<Reward | null>(null);
  const [error, setError] = useState<string | null>(null);

  const openBox = async () => {
    setOpening(true);
    setError(null);
    try {
      const res = await fetch("/api/mystery/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNumber })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setReward(data.reward);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setOpening(false);
    }
  };

  if (initialStatus !== "DELIVERED") {
    return (
      <div className="card p-8 text-center border-dashed border-royal-border">
        <Dices className="h-12 w-12 text-royal-muted mx-auto mb-4" />
        <h3 className="font-bold text-royal-text mb-2 uppercase tracking-tight">Mystery Box Locked</h3>
        <p className="text-xs text-royal-muted max-w-xs mx-auto">
          Your box will be ready to open as soon as your payment is confirmed and delivered.
        </p>
      </div>
    );
  }

  if (reward) {
    return (
      <div className="card p-8 text-center border-royal-primary shadow-2xl shadow-royal-primary/20 animate-in zoom-in duration-500">
        <div className="relative inline-block mb-4">
          <div className="absolute inset-0 bg-royal-primary blur-2xl opacity-20 animate-pulse" />
          {reward.isJackpot ? (
            <Trophy className="h-16 w-16 text-royal-gold relative z-10" />
          ) : (
            <Sparkles className="h-16 w-16 text-royal-primary relative z-10" />
          )}
        </div>
        <h2 className="text-2xl font-black text-royal-text uppercase tracking-tighter mb-1">
          {reward.isJackpot ? "JACKPOT!" : "CONGRATULATIONS!"}
        </h2>
        <p className="text-sm text-royal-muted mb-6 uppercase font-bold tracking-widest">You won</p>
        <div className="text-4xl font-black text-royal-primary mb-2">
          {reward.amount.toLocaleString()}
        </div>
        <div className="text-xs font-bold text-royal-muted uppercase tracking-[0.2em]">{reward.name}</div>
        
        <p className="mt-8 text-[10px] text-royal-muted italic">
          Reward has been added to your game account.
        </p>
      </div>
    );
  }

  return (
    <div className="card p-8 text-center bg-gradient-to-br from-royal-card to-royal-primary/5 border-royal-primary/30 group">
      <div className="relative h-32 w-32 mx-auto mb-6">
        <div className="absolute inset-0 bg-royal-primary rounded-3xl blur-xl opacity-10 group-hover:opacity-20 transition-opacity" />
        <div className="relative h-full w-full rounded-3xl border-2 border-royal-primary/40 bg-royal-card flex items-center justify-center transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3 shadow-2xl">
          <Dices className="h-16 w-16 text-royal-primary" strokeWidth={1.5} />
        </div>
      </div>
      
      <h3 className="text-xl font-black text-royal-text uppercase tracking-tight mb-2">Your Mystery Box is Ready!</h3>
      <p className="text-xs text-royal-muted mb-8 max-w-xs mx-auto">
        Tap below to reveal your secret reward. Good luck, Gamer!
      </p>

      <button
        onClick={openBox}
        disabled={opening}
        className="btn-primary w-full py-4 text-sm font-black uppercase tracking-widest shadow-xl shadow-royal-primary/30"
      >
        {opening ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Opening Box...
          </>
        ) : (
          "Open Box Now"
        )}
      </button>
      
      {error && <p className="mt-4 text-xs text-red-400 font-bold uppercase italic">{error}</p>}
    </div>
  );
}
