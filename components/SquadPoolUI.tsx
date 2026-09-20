"use client";

import { useState, useEffect, useCallback } from "react";
import { 
  Users, 
  Plus, 
  Timer, 
  Users2, 
  ChevronRight, 
  Loader2, 
  Trophy, 
  Info, 
  CheckCircle2, 
  AlertCircle,
  X,
  Copy,
  Share2,
  Trash2
} from "lucide-react";

interface Pool {
  id: string;
  leaderId: string;
  targetSize: number;
  currentSize: number;
  expiresAt: string;
  leader: { name: string; image: string | null };
}

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: "success" | "error" | "info" | "warning";
  title: string;
  message: string;
  action?: {
    label: string;
    onClick: () => void;
    danger?: boolean;
  };
}

const Modal = ({ isOpen, onClose, type, title, message, action }: ModalProps) => {
  if (!isOpen) return null;

  const icons = {
    success: <CheckCircle2 className="h-12 w-12 text-green-400" />,
    error: <AlertCircle className="h-12 w-12 text-red-400" />,
    info: <Info className="h-12 w-12 text-royal-primary" />,
    warning: <AlertCircle className="h-12 w-12 text-amber-400" />,
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="w-full max-w-sm rounded-3xl bg-royal-surface border border-royal-border p-6 shadow-2xl animate-in zoom-in-95 duration-300">
        <div className="flex flex-col items-center text-center space-y-4">
          <div className="p-3 rounded-full bg-white/5 border border-white/10">
            {icons[type]}
          </div>
          <div>
            <h3 className="text-xl font-display font-bold text-royal-text">{title}</h3>
            <p className="mt-2 text-sm text-royal-muted leading-relaxed font-medium">{message}</p>
          </div>
          <div className="flex gap-3 w-full pt-2">
             {action && (
               <button 
                 onClick={() => { action.onClick(); onClose(); }}
                 className={`flex-1 py-3 rounded-xl font-black uppercase tracking-widest text-[10px] transition-all shadow-lg ${
                   action.danger 
                    ? "bg-red-500 text-white shadow-red-500/20 hover:bg-red-600" 
                    : "bg-royal-primary text-black shadow-royal-primary/20 hover:brightness-110"
                 }`}
               >
                 {action.label}
               </button>
             )}
             <button 
               onClick={onClose}
               className={`flex-1 py-3 rounded-xl font-black uppercase tracking-widest text-[10px] transition-all ${
                 action ? "bg-royal-card border border-royal-border text-royal-muted hover:text-royal-text" : "bg-royal-primary text-black shadow-royal-primary/20 hover:brightness-110"
               }`}
             >
               {action ? "Cancel" : "Got it"}
             </button>
          </div>
        </div>
      </div>
    </div>
  );
};

async function readJson<T>(res: Response): Promise<T | null> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export default function SquadPoolUI({ productId, onJoin }: { productId: string; onJoin?: (poolId: string) => void }) {
  const [pools, setPools] = useState<Pool[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  
  // Modal State
  const [modal, setModal] = useState<{
    isOpen: boolean;
    type: "success" | "error" | "info" | "warning";
    title: string;
    message: string;
    action?: { label: string; onClick: () => void; danger?: boolean };
  }>({
    isOpen: false,
    type: "info",
    title: "",
    message: ""
  });

  const fetchUser = useCallback(async () => {
    try {
      const res = await fetch("/api/user/me");
      const data = await res.json();
      if (res.ok) setCurrentUser(data.user);
    } catch {}
  }, []);

  const fetchPools = useCallback(async () => {
    try {
      const res = await fetch(`/api/squads?productId=${encodeURIComponent(productId)}`, {
        cache: "no-store",
      });
      const data = await readJson<Pool[] | { error?: string }>(res);

      if (!res.ok) {
        const message = data && !Array.isArray(data) && data.error ? data.error : "Failed to load squad pools";
        throw new Error(message);
      }
      setPools(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load squad pools:", err);
      setPools([]);
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    setLoading(true);
    void fetchUser();
    void fetchPools();
    const interval = setInterval(() => {
      void fetchPools();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchPools, fetchUser]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const res = await fetch("/api/squads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "CREATE", productId })
      });
      
      const data = await readJson<{ id?: string, error?: string }>(res);
      
      if (res.ok) {
        await fetchPools();
        setModal({
          isOpen: true,
          type: "success",
          title: "Squad Deployed!",
          message: "Your squad is live. Once 5 members join and pay, everyone gets 5% cashback!",
          action: {
            label: "Copy Invite Link",
            onClick: () => {
              const url = `${window.location.origin}${window.location.pathname}?squad=${data?.id}`;
              navigator.clipboard.writeText(url);
            }
          }
        });
      } else {
        if (res.status === 401) {
           window.location.href = "/login?callbackUrl=" + encodeURIComponent(window.location.href);
           return;
        }
        setModal({
          isOpen: true,
          type: "error",
          title: "Deployment Failed",
          message: data?.error || "We couldn't initialize your squad pool. Please try again."
        });
      }
    } finally {
      setCreating(false);
    }
  };

  const handleJoin = async (poolId: string) => {
    try {
      const res = await fetch("/api/squads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "JOIN", poolId })
      });
      
      const data = await readJson<{ error?: string }>(res);
      
      if (res.ok) {
        await fetchPools();
        setModal({
          isOpen: true,
          type: "success",
          title: "Welcome to the Squad",
          message: "You've successfully joined! Complete your payment now to secure your spot and unlock the squad discount."
        });
        if (onJoin) onJoin(poolId);
      } else {
        if (res.status === 401) {
          window.location.href = "/login?callbackUrl=" + encodeURIComponent(window.location.href);
          return;
        }
        setModal({
          isOpen: true,
          type: "error",
          title: "Join Failed",
          message: data?.error || "The squad might be full or expired."
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCancel = async (poolId: string) => {
    setModal({
      isOpen: true,
      type: "warning",
      title: "Stop Squad Pool?",
      message: "Are you sure you want to cancel this squad? Other members won't be able to join and the cashback will be disabled.",
      action: {
        label: "Stop Squad",
        danger: true,
        onClick: async () => {
          try {
            const res = await fetch("/api/squads", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "CANCEL", poolId })
            });
            if (res.ok) {
              await fetchPools();
            } else {
              const data = await res.json();
              setModal({
                isOpen: true,
                type: "error",
                title: "Cancel Failed",
                message: data.error || "Failed to stop squad"
              });
            }
          } catch (err) {
            console.error(err);
          }
        }
      }
    });
  };

  if (loading) return (
    <div className="flex items-center justify-center p-8">
      <Loader2 className="h-6 w-6 text-royal-primary animate-spin" />
    </div>
  );

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      <Modal 
        isOpen={modal.isOpen} 
        onClose={() => setModal(prev => ({ ...prev, isOpen: false }))}
        type={modal.type}
        title={modal.title}
        message={modal.message}
        action={modal.action}
      />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-royal-primary animate-pulse" />
          <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-royal-muted">Live Squad Pools</h3>
        </div>
        <button 
          onClick={handleCreate}
          disabled={creating}
          className="group flex items-center gap-2 px-3 py-1.5 rounded-lg bg-royal-primary/10 border border-royal-primary/20 text-[10px] font-black uppercase tracking-widest text-royal-primary hover:bg-royal-primary hover:text-black transition-all"
        >
          {creating ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} className="group-hover:rotate-90 transition-transform" />}
          Start Squad
        </button>
      </div>

      {pools.length === 0 ? (
        <div className="relative overflow-hidden p-8 rounded-2xl border border-dashed border-royal-border bg-royal-bg/40 text-center group">
           <div className="absolute inset-0 bg-gradient-to-br from-royal-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
           <Users2 className="h-10 w-10 text-royal-muted mx-auto mb-3 opacity-20 group-hover:scale-110 transition-transform" />
           <p className="text-[10px] text-royal-muted uppercase font-bold tracking-[0.15em] relative z-10">No active squads for this package</p>
           <button onClick={handleCreate} className="mt-4 text-[9px] font-black uppercase tracking-widest text-royal-primary hover:underline relative z-10">Be the first to start one</button>
        </div>
      ) : (
        <div className="grid gap-3">
          {pools.map((pool) => {
            const timeLeft = Math.max(0, Math.floor((new Date(pool.expiresAt).getTime() - Date.now()) / 60000));
            const progress = (pool.currentSize / pool.targetSize) * 100;
            const isLeader = currentUser && currentUser.userId === pool.leaderId;
            
            return (
              <div key={pool.id} className="relative overflow-hidden p-4 rounded-2xl bg-royal-surface border border-royal-border flex flex-col gap-4 group hover:border-royal-primary/40 transition-all hover:shadow-lg hover:shadow-royal-primary/10">
                {/* Progress Bar Background */}
                <div className="absolute bottom-0 left-0 h-1 bg-royal-primary/20 w-full">
                   <div 
                     className="h-full bg-royal-primary transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(99,102,241,0.5)]" 
                     style={{ width: `${progress}%` }} 
                   />
                </div>

                <div className="flex items-center justify-between relative z-10">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-royal-primary/20 to-royal-accent/10 flex items-center justify-center text-royal-primary font-black text-sm border border-white/5 overflow-hidden shadow-inner">
                         {pool.leader.image ? (
                           <img src={pool.leader.image} className="h-full w-full object-cover" alt={pool.leader.name} />
                         ) : (
                           <span className="bg-gradient-to-br from-royal-primary to-indigo-400 bg-clip-text text-transparent">
                             {pool.leader.name?.[0]?.toUpperCase() || "S"}
                           </span>
                         )}
                      </div>
                      <div className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-royal-primary border-2 border-royal-surface flex items-center justify-center">
                         <Trophy size={8} className="text-black" />
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-black uppercase tracking-tight text-royal-text flex items-center gap-2">
                        {pool.leader.name}
                        <span className="px-1.5 py-0.5 rounded bg-royal-primary/10 text-[8px] text-royal-primary border border-royal-primary/20">Leader</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] text-royal-muted font-bold uppercase tracking-tighter mt-0.5">
                        <Timer size={10} className={timeLeft < 15 ? "text-royal-accent animate-pulse" : ""} /> 
                        <span className={timeLeft < 15 ? "text-royal-accent" : ""}>{timeLeft}m remaining</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right flex flex-col items-end gap-1">
                     <div className="text-[12px] font-black text-royal-primary uppercase tracking-tighter italic">
                       {pool.currentSize} <span className="text-royal-muted">/ {pool.targetSize}</span>
                     </div>
                     {isLeader ? (
                       <button 
                         onClick={() => handleCancel(pool.id)}
                         className="flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-red-400 hover:text-red-500 transition-colors"
                       >
                         <Trash2 size={10} /> Stop Pool
                       </button>
                     ) : (
                       <div className="text-[8px] text-royal-muted uppercase font-bold tracking-widest">Slots Filled</div>
                     )}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 relative z-10">
                   <div className="flex -space-x-2">
                      {[...Array(pool.targetSize)].map((_, i) => (
                        <div key={i} className={`h-6 w-6 rounded-full border-2 border-royal-surface flex items-center justify-center ${i < pool.currentSize ? 'bg-royal-primary text-black' : 'bg-royal-card text-royal-muted opacity-40'}`}>
                           <Users size={10} />
                        </div>
                      ))}
                   </div>
                   <button 
                    onClick={() => handleJoin(pool.id)}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-royal-primary hover:brightness-110 text-black text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg shadow-royal-primary/20"
                  >
                    Join Squad <ChevronRight size={12} strokeWidth={3} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="p-4 rounded-2xl bg-gradient-to-br from-royal-primary/10 via-royal-primary/5 to-transparent border border-royal-primary/20 shadow-inner overflow-hidden relative group">
         <div className="absolute -right-4 -top-4 opacity-10 group-hover:scale-110 transition-transform duration-700">
            <Trophy size={80} className="text-royal-primary" />
         </div>
         <div className="flex items-center gap-3 mb-2">
            <div className="h-6 w-6 rounded-lg bg-royal-primary flex items-center justify-center shadow-lg shadow-royal-primary/40">
               <Trophy size={14} className="text-black" />
            </div>
            <span className="text-[10px] font-black uppercase tracking-[0.1em] text-royal-primary">Member Perk Unlocked</span>
         </div>
         <p className="text-[10px] text-royal-text font-bold leading-relaxed uppercase tracking-tighter opacity-80">
           Form a squad of 5 within 2 hours to activate <span className="text-royal-primary font-black">5% INSTANT CASHBACK</span> for every member upon squad completion!
         </p>
      </div>
    </div>
  );
}
