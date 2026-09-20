"use client";

import { useEffect, useState } from "react";
import { 
  Users, 
  Trophy, 
  Crown, 
  Zap, 
  Search, 
  Mail, 
  Calendar, 
  CreditCard,
  ChevronRight,
  Loader2,
  TrendingUp,
  ShieldCheck
} from "lucide-react";
import Link from "next/link";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users");
      if (res.ok) {
        setUsers(await res.json());
      } else {
        const err = await res.json().catch(() => ({}));
        console.error("Failed to load users:", err.error || res.statusText);
      }
    } catch (e) {
      console.error("Error loading users:", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filteredUsers = users.filter(u => 
    u.email.toLowerCase().includes(search.toLowerCase()) || 
    (u.name && u.name.toLowerCase().includes(search.toLowerCase()))
  );

  const topSpenders = [...users].sort((a, b) => b.totalSpent - a.totalSpent).slice(0, 5);

  return (
    <div className="p-8">
      <div className="flex justify-between items-end mb-8">
        <div>
          <div className="flex items-center gap-2 text-royal-primary font-black uppercase tracking-[0.2em] mb-2 text-xs">
            <ShieldCheck size={14} />
            Command Center
          </div>
          <h1 className="font-display text-4xl font-black tracking-tight">MEMBER ELITE</h1>
        </div>
        
        <div className="flex gap-4">
           <div className="card p-4 flex items-center gap-4 bg-royal-primary/10 border-royal-primary/20">
              <Users className="text-royal-primary" />
              <div>
                <div className="text-[10px] font-bold text-royal-muted uppercase">Total Members</div>
                <div className="text-xl font-black">{users.length}</div>
              </div>
           </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* LEADERBOARD: TOP SPENDERS */}
        <div className="space-y-6">
           <h2 className="text-sm font-black uppercase tracking-[0.2em] text-royal-accent flex items-center gap-2">
              <Trophy size={16} />
              Whale Leaderboard
           </h2>
           
           <div className="space-y-3">
              {topSpenders.map((u, i) => (
                <div key={u.id} className="card p-4 flex items-center gap-4 border-white/5 relative overflow-hidden group">
                  {i === 0 && <div className="absolute top-0 right-0 p-2 text-royal-accent opacity-20"><Crown size={40} /></div>}
                  <div className="h-10 w-10 rounded-xl bg-royal-surface flex items-center justify-center font-black text-royal-muted border border-white/10">
                    #{i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm truncate uppercase tracking-tight">{u.name || "Elite Gamer"}</div>
                    <div className="text-[10px] text-royal-muted truncate">{u.email}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-black text-royal-primary">${u.totalSpent.toFixed(2)}</div>
                    <div className="text-[10px] font-bold text-royal-accent">{u.xp} XP</div>
                  </div>
                </div>
              ))}
           </div>

           <div className="p-6 rounded-[2rem] bg-gradient-to-br from-royal-primary/20 to-royal-accent/10 border border-royal-primary/30">
              <div className="flex items-center gap-3 mb-3">
                <TrendingUp className="text-royal-primary" />
                <h3 className="font-black text-xs uppercase tracking-widest">Growth Forecast</h3>
              </div>
              <p className="text-xs text-royal-muted leading-relaxed">
                Elite members account for <span className="text-royal-text font-bold">{(users.filter(u => u.totalSpent > 0).length / (users.length || 1) * 100).toFixed(0)}%</span> of your total database. Members spend on average <span className="text-royal-text font-bold">2.4x</span> more than guest users.
              </p>
           </div>
        </div>

        {/* USER LIST */}
        <div className="lg:col-span-2 space-y-6">
           <div className="flex flex-col sm:flex-row items-center gap-4 justify-between">
              <h2 className="text-sm font-black uppercase tracking-[0.2em] text-royal-muted flex items-center gap-2">
                <Users size={16} />
                User Directory
              </h2>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-royal-muted" />
                <input 
                  type="text" 
                  placeholder="Search email/name..." 
                  className="input pl-10 text-xs py-2"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
           </div>

           <div className="card overflow-hidden border-white/5">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-white/5 text-royal-muted text-[10px] uppercase font-black tracking-widest">
                    <tr>
                      <th className="text-left px-6 py-4">User Identity</th>
                      <th className="text-right px-6 py-4">Missions</th>
                      <th className="text-right px-6 py-4">XP Level</th>
                      <th className="text-right px-6 py-4">Investment</th>
                      <th className="text-right px-6 py-4">Joined</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {loading ? (
                      <tr><td colSpan={5} className="px-6 py-12 text-center text-royal-muted">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                        Scanning database...
                      </td></tr>
                    ) : filteredUsers.length === 0 ? (
                      <tr><td colSpan={5} className="px-6 py-12 text-center text-royal-muted">No users found.</td></tr>
                    ) : (
                      filteredUsers.map(u => (
                        <tr key={u.id} className="hover:bg-white/5 transition-colors group">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="h-9 w-9 rounded-xl bg-royal-card border border-white/10 flex items-center justify-center text-royal-primary overflow-hidden">
                                {u.image ? <img src={u.image} alt="" /> : <Mail size={16} />}
                              </div>
                              <div>
                                <div className="font-bold text-xs uppercase tracking-tight group-hover:text-royal-primary transition-colors">{u.name || "Elite Gamer"}</div>
                                <div className="text-[10px] text-royal-muted font-mono">{u.email}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                             <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-royal-primary/10 border border-royal-primary/20 text-xs font-bold text-royal-primary">
                                <Zap size={10} />
                                {u.orderCount}
                             </div>
                          </td>
                          <td className="px-6 py-4 text-right font-mono text-xs font-bold text-royal-accent">
                             {u.xp}
                          </td>
                          <td className="px-6 py-4 text-right">
                             <div className="font-black text-royal-text">${u.totalSpent.toFixed(2)}</div>
                          </td>
                          <td className="px-6 py-4 text-right">
                             <div className="text-[10px] text-royal-muted flex items-center justify-end gap-1.5 font-bold uppercase">
                                <Calendar size={12} />
                                {new Date(u.createdAt).toLocaleDateString()}
                             </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
}
