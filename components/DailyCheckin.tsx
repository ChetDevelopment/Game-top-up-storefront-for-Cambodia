"use client";

import { useState, useEffect } from "react";
import { Gift, Calendar, Check, Loader2 } from "lucide-react";
import { useCsrfToken } from "@/lib/useCsrfToken";

export default function DailyCheckin({ onCheckinSuccess }: { onCheckinSuccess?: () => void }) {
  const [checkedIn, setCheckedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const { token: csrfToken } = useCsrfToken();

  useEffect(() => {
    fetch("/api/user/daily-checkin")
      .then((r) => r.json())
      .then((data) => setCheckedIn(data.checkedIn))
      .finally(() => setLoading(false));
  }, []);

  const handleCheckin = async () => {
    if (checkedIn || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/user/daily-checkin", {
        method: "POST",
        headers: { "x-csrf-token": csrfToken || "" },
      });
      if (res.ok) {
        setCheckedIn(true);
        if (onCheckinSuccess) onCheckinSuccess();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return null;

  return (
    <div className="card p-5 relative overflow-hidden group">
      <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
        <Calendar size={80} />
      </div>
      
      <div className="flex items-center gap-4 relative z-10">
        <div className={`h-12 w-12 rounded-2xl flex items-center justify-center transition-all ${
          checkedIn ? "bg-green-500/20 text-green-400" : "bg-royal-primary/20 text-royal-primary animate-pulse"
        }`}>
          {checkedIn ? <Check size={24} strokeWidth={3} /> : <Gift size={24} />}
        </div>
        
        <div className="flex-1">
          <h4 className="font-bold text-sm uppercase tracking-tight">Daily Mission</h4>
          <p className="text-[10px] text-royal-muted uppercase font-black tracking-widest">
            {checkedIn ? "Reward claimed!" : "Claim 5 TK Points"}
          </p>
        </div>
        
        <button
          onClick={handleCheckin}
          disabled={checkedIn || submitting}
          className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
            checkedIn 
              ? "bg-royal-surface text-royal-muted cursor-default" 
              : "bg-royal-primary text-black shadow-lg shadow-royal-primary/20 hover:scale-105 active:scale-95"
          }`}
        >
          {submitting ? "..." : checkedIn ? "Done" : "Claim"}
        </button>
      </div>
    </div>
  );
}
