"use client";

import { useEffect, useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import {
  User,
  History,
  ShieldCheck,
  LogOut,
  Plus,
  Trash2,
  Zap,
  Crown,
  ExternalLink,
  Loader2,
  TrendingUp,
  RefreshCw
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { RANKS, getRank, calculateProgress } from "@/lib/vip";
import DailyCheckin from "@/components/DailyCheckin";
import ReferralCard from "@/components/ReferralCard";
import { useCsrfToken } from "@/lib/useCsrfToken";

export default function UserDashboard() {
  const router = useRouter();
  const { token: csrfToken } = useCsrfToken();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [reordering, setReordering] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/user/dashboard");
      if (!res.ok) throw new Error();
      setData(await res.json());
    } catch {
      router.push("/login");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleLogout() {
    // Clear manual JWT cookie
    document.cookie = "tykhai_user=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    // Sign out from NextAuth (Google login)
    await signOut({ redirect: false });
    router.push("/");
    router.refresh();
  }

  async function deleteUid(id: string) {
    if (!confirm("Remove this saved ID?")) return;
    await fetch(`/api/user/saved-uids/${id}`, {
      method: "DELETE",
      headers: { "x-csrf-token": csrfToken || "" },
    });
    load();
  }

  async function reorder(order: any) {
    if (!confirm(`Reorder ${order.product.name} for ${order.playerUid}?`)) return;
    setReordering(order.id);
    try {
      const res = await fetch("/api/user/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken || "" },
        body: JSON.stringify({
          orderId: order.id,
          playerUid: order.playerUid,
          serverId: order.serverId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      window.location.href = `/checkout/${data.orderNumber}`;
    } catch (err: any) {
      alert(err.message);
    } finally {
      setReordering(null);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-royal-bg flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-royal-primary animate-spin" />
      </div>
    );
  }

  if (!data) return null;

  const { user, orders, savedUids } = data;
  
  const totalSpent = user.totalSpentUsd || 0;
  const currentRankType = getRank(totalSpent);
  const currentRank = RANKS[currentRankType];
  const { percent, remaining, nextRank } = calculateProgress(totalSpent);

  return (
    <div className="min-h-screen bg-royal-bg text-royal-text">
      <Header />
      
      <main className="max-w-7xl mx-auto px-4 py-12">
        {/* TOP BAR: IDENTITY CARD */}
        <div className="relative mb-12 p-8 rounded-[2.5rem] bg-royal-card/30 border border-royal-border/50 overflow-hidden">
          <div className="absolute top-0 right-0 p-12 opacity-10 rotate-12">
             {currentRankType === "BRONZE" ? <ShieldCheck size={200} className={currentRank.color} /> : <Crown size={200} className={currentRank.color} />}
          </div>
          
          <div className="relative z-10 flex flex-col md:flex-row items-center gap-8">
            <div className="relative">
              <div className={`h-24 w-24 rounded-3xl p-1 bg-gradient-to-br ${user.vipRank === 'DIAMOND_LEGEND' ? 'from-royal-primary to-royal-accent' : 'from-royal-border to-royal-surface'}`}>
                <div className="h-full w-full rounded-[22px] bg-royal-card flex items-center justify-center overflow-hidden">
                  {user.image ? <img src={user.image} alt="" className="h-full w-full object-cover" /> : <User size={48} className="text-royal-muted" />}
                </div>
              </div>
              <div className={`absolute -bottom-2 -right-2 h-8 w-8 rounded-xl flex items-center justify-center text-black border-2 border-royal-bg shadow-lg ${user.vipRank === 'BRONZE' ? 'bg-orange-500' : 'bg-royal-primary'}`}>
                {currentRankType === "BRONZE" ? <ShieldCheck size={16} /> : <Crown size={16} />}
              </div>
            </div>
            
            <div className="flex-1 text-center md:text-left">
              <div className="flex flex-col md:flex-row items-center gap-3 mb-1">
                <h1 className="text-3xl font-black uppercase tracking-tight">{user.name || "Elite Gamer"}</h1>
                <span className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg ${currentRank.badge}`}>
                  {currentRank.label}
                </span>
              </div>
              
              <div className="flex flex-wrap justify-center md:justify-start gap-4 mb-6">
                <p className="text-royal-muted text-sm font-medium">{user.email}</p>
                <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-royal-primary/10 border border-royal-primary/20">
                  <Zap size={12} className="text-royal-primary" />
                  <span className="text-[10px] font-black text-royal-primary uppercase tracking-widest">{user.pointsBalance.toLocaleString()} TK POINTS</span>
                </div>
              </div>
              
              <div className="max-w-md mx-auto md:mx-0">
                <div className="flex justify-between items-end mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-lg ${currentRank.badge} text-[9px] font-black uppercase tracking-widest border`}>
                      {currentRank.label}
                    </span>
                    <span className="text-[10px] font-bold text-royal-muted uppercase tracking-widest">
                      Total Spent: ${totalSpent.toFixed(2)}
                    </span>
                  </div>
                  {nextRank && (
                    <span className="text-[10px] font-bold text-royal-muted uppercase tracking-widest">
                      Next: {nextRank.label}
                    </span>
                  )}
                </div>
                <div className="h-3 w-full rounded-full bg-royal-surface border border-royal-border overflow-hidden p-0.5 relative group cursor-help">
                  <div 
                    className={`h-full rounded-full bg-gradient-to-r from-royal-primary via-indigo-400 to-royal-accent transition-all duration-1000 ease-out shadow-[0_0_12px_rgba(99,102,241,0.5)]`}
                    style={{ width: `${Math.max(5, percent)}%` }}
                  />
                  {nextRank && (
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                       <span className="text-[8px] font-black uppercase tracking-[0.2em] text-white drop-shadow-md">
                         ${remaining.toFixed(2)} to {nextRank.label}
                       </span>
                    </div>
                  )}
                </div>
                {currentRank.discount > 0 && (
                  <div className="mt-2 flex items-center gap-1.5 text-royal-primary">
                    <TrendingUp size={12} />
                    <span className="text-[9px] font-black uppercase tracking-widest">Permanent {Math.round(currentRank.discount * 100)}% Discount Active</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3">
              <button 
                onClick={handleLogout}
                className="p-4 rounded-2xl bg-white/5 border border-white/10 text-royal-muted hover:text-red-400 hover:bg-red-400/10 hover:border-red-400/20 transition-all"
              >
                <LogOut size={20} />
              </button>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-12">
          {/* LEFT: THE VAULT & REFERRAL */}
          <div className="space-y-10">
            <DailyCheckin onCheckinSuccess={load} />
            
            <ReferralCard />

            <div className="space-y-6">
              <div className="flex items-center justify-between px-2">
                <h2 className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
                  <ShieldCheck className="text-royal-primary" />
                  The Vault
                </h2>
                <Link href="/#games" className="text-xs font-bold text-royal-primary hover:underline uppercase tracking-widest flex items-center gap-1">
                  <Plus size={14} /> Add ID
                </Link>
              </div>

              <div className="space-y-4">
                {savedUids.length === 0 ? (
                  <div className="p-8 text-center rounded-3xl border border-dashed border-royal-border/50 text-royal-muted text-sm">
                    No IDs synced yet.
                  </div>
                ) : (
                  savedUids.map((su: any) => (
                    <div key={su.id} className="group relative p-5 rounded-3xl bg-royal-card/40 border border-royal-border hover:border-royal-primary/40 transition-all hover:-translate-y-1">
                      <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-xl bg-royal-surface border border-royal-border overflow-hidden">
                          <img src={su.game.imageUrl} alt={su.game.name} className="h-full w-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-bold text-sm uppercase tracking-tight">{su.game.name}</h4>
                          <p className="font-mono text-xs text-royal-primary font-bold">{su.playerUid}</p>
                        </div>
                        <button 
                          onClick={() => deleteUid(su.id)}
                          className="opacity-0 group-hover:opacity-100 p-2 text-royal-muted hover:text-red-400 transition-all"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* RIGHT: MISSION LOG (ORDERS) */}
          <div className="space-y-6">
            <div className="flex items-center justify-between px-2">
              <h2 className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
                <History className="text-royal-primary" />
                Mission Log
              </h2>
            </div>

            <div className="space-y-4">
              {orders.length === 0 ? (
                <div className="p-12 text-center rounded-3xl bg-royal-card/20 border border-royal-border text-royal-muted">
                  No missions completed yet.
                </div>
              ) : (
                orders.map((o: any) => (
                  <div key={o.id} className="group relative flex flex-col sm:flex-row items-center gap-6 p-6 rounded-3xl bg-royal-card/50 border border-royal-border hover:bg-royal-card/70 transition-all">
                    <div className="h-16 w-16 rounded-2xl bg-royal-surface border border-royal-border overflow-hidden shrink-0">
                      <img src={o.game.imageUrl} alt={o.game.name} className="h-full w-full object-cover" />
                    </div>
                    
                    <div className="flex-1 text-center sm:text-left">
                      <div className="flex flex-wrap justify-center sm:justify-start items-center gap-2 mb-1">
                        <h3 className="font-black text-lg uppercase tracking-tight">{o.product.name}</h3>
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                          o.status === 'DELIVERED' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                          o.status === 'PAID' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                          'bg-royal-surface text-royal-muted border-royal-border'
                        }`}>
                          {o.status}
                        </span>
                      </div>
                      <p className="text-xs text-royal-muted font-medium">
                        Synced to <span className="font-mono text-royal-accent">{o.playerUid}</span> · {new Date(o.createdAt).toLocaleDateString()}
                      </p>
                    </div>

                    <div className="text-center sm:text-right space-y-2">
                      <div className="text-lg font-black text-royal-text">${o.amountUsd.toFixed(2)}</div>
                      <Link href={`/checkout/${o.orderNumber}`} className="block text-[10px] font-black uppercase tracking-widest text-royal-primary hover:underline">
                        View Intel
                      </Link>
                      {o.status === "DELIVERED" && (
                        <button 
                          onClick={() => reorder(o)}
                          disabled={reordering === o.id}
                          className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-royal-accent hover:underline disabled:opacity-50"
                        >
                          {reordering === o.id ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                          Reorder
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
