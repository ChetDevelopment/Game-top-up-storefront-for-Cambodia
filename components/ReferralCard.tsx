"use client";

import { useState, useEffect } from "react";
import { Share2, Copy, Users, Gift, Check } from "lucide-react";

export default function ReferralCard() {
  const [data, setData] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/user/referral").then(r => r.json()).then(setData);
  }, []);

  const copyLink = () => {
    if (!data?.referralLink) return;
    navigator.clipboard.writeText(data.referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!data) return null;

  return (
    <div className="card p-6 bg-gradient-to-br from-indigo-600/20 to-royal-card border-indigo-500/30">
      <div className="flex items-center gap-4 mb-6">
        <div className="h-12 w-12 rounded-2xl bg-indigo-500/20 flex items-center justify-center text-indigo-400">
           <Share2 size={24} />
        </div>
        <div>
          <h3 className="font-black uppercase tracking-tight">Refer & Earn</h3>
          <p className="text-[10px] text-indigo-300 font-bold uppercase tracking-widest">Get 50 TK Points per friend</p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-[10px] font-black uppercase text-royal-muted mb-1.5 block tracking-widest">Your Referral Link</label>
          <div className="flex gap-2">
            <div className="flex-1 bg-black/40 border border-royal-border rounded-xl px-4 py-3 font-mono text-xs text-royal-muted truncate select-all">
              {data.referralLink}
            </div>
            <button 
              onClick={copyLink}
              className="px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
            >
              {copied ? <Check size={18} /> : <Copy size={18} />}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 rounded-2xl bg-black/20 border border-royal-border/50">
             <div className="text-royal-muted mb-1"><Users size={16} /></div>
             <div className="text-xl font-black">{data.totalReferrals}</div>
             <div className="text-[9px] font-black uppercase text-royal-muted tracking-widest">Total Friends</div>
          </div>
          <div className="p-4 rounded-2xl bg-black/20 border border-royal-border/50">
             <div className="text-indigo-400 mb-1"><Gift size={16} /></div>
             <div className="text-xl font-black">{data.totalReferrals * 50}</div>
             <div className="text-[9px] font-black uppercase text-royal-muted tracking-widest">Points Earned</div>
          </div>
        </div>
      </div>
    </div>
  );
}
