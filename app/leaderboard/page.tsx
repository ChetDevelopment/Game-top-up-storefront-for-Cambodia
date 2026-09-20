import { prisma } from "@/lib/prisma";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Trophy, Crown, Medal, TrendingUp } from "lucide-react";
import { RANKS, getRank } from "@/lib/vip";

export const dynamic = "force-dynamic";

function maskName(name: string | null, email: string) {
  if (name) {
    if (name.length <= 3) return name + "***";
    return name.substring(0, 3) + "***" + name.substring(name.length - 1);
  }
  const part = email.split("@")[0];
  return part.substring(0, 2) + "***" + part.substring(part.length - 1);
}

export default async function LeaderboardPage() {
  const topWhales = await prisma.user.findMany({
    where: {
      totalSpentUsd: { gt: 0 }
    },
    orderBy: {
      totalSpentUsd: "desc"
    },
    take: 10,
    select: {
      name: true,
      email: true,
      totalSpentUsd: true,
      vipRank: true,
      image: true
    }
  });

  return (
    <div className="min-h-screen bg-royal-bg text-royal-text">
      <Header />
      
      <main className="max-w-4xl mx-auto px-4 py-16">
        <div className="text-center mb-16 relative">
          <div className="absolute inset-0 bg-royal-primary blur-[100px] opacity-10 rounded-full" />
          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-royal-primary/10 border border-royal-primary/20 text-royal-primary text-xs font-black uppercase tracking-widest mb-6 animate-bounce">
              <Trophy size={14} /> The Hall of Fame
            </div>
            <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tighter mb-4 italic">
              Elite Supporters
            </h1>
            <p className="text-royal-muted max-w-lg mx-auto text-sm md:text-base">
              The top 10 legendary gamers who support Ty Khai the most. Are you among the elite?
            </p>
          </div>
        </div>

        <div className="space-y-4 relative z-10">
          {topWhales.map((whale, index) => {
            const rank = index + 1;
            const vipRank = getRank(whale.totalSpentUsd);
            const meta = RANKS[vipRank];
            
            return (
              <div 
                key={whale.email}
                className={`group flex items-center gap-4 md:gap-8 p-6 rounded-[2rem] border transition-all duration-500 hover:-translate-y-1 ${
                  rank === 1 ? "bg-gradient-to-r from-royal-gold/20 to-royal-card border-royal-gold/40 shadow-2xl shadow-royal-gold/10 scale-105 mb-8" :
                  rank === 2 ? "bg-royal-card/60 border-slate-400/30" :
                  rank === 3 ? "bg-royal-card/60 border-orange-500/30" :
                  "bg-royal-card/40 border-royal-border/50"
                }`}
              >
                {/* RANK NUMBER / ICON */}
                <div className="w-12 h-12 flex items-center justify-center shrink-0">
                  {rank === 1 ? <Crown className="text-royal-gold h-10 w-10 drop-shadow-[0_0_10px_rgba(251,191,36,0.5)]" /> :
                   rank === 2 ? <Medal className="text-slate-300 h-8 w-8" /> :
                   rank === 3 ? <Medal className="text-orange-500 h-8 w-8" /> :
                   <span className="text-2xl font-black text-royal-muted italic">#{rank}</span>}
                </div>

                {/* AVATAR */}
                <div className={`h-12 w-12 md:h-16 md:w-16 rounded-2xl border-2 overflow-hidden shrink-0 ${rank === 1 ? "border-royal-gold" : "border-royal-border"}`}>
                   {whale.image ? (
                     <img src={whale.image} alt="" className="h-full w-full object-cover" />
                   ) : (
                     <div className="h-full w-full bg-royal-surface flex items-center justify-center">
                       <TrendingUp className="text-royal-muted opacity-20" />
                     </div>
                   )}
                </div>

                {/* INFO */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-3">
                    <h3 className="font-black text-lg md:text-xl uppercase tracking-tight truncate">
                      {maskName(whale.name, whale.email)}
                    </h3>
                    <span className={`inline-flex px-2 py-0.5 rounded-lg border text-[8px] font-black uppercase tracking-widest w-fit ${meta.badge}`}>
                      {meta.label}
                    </span>
                  </div>
                </div>

                {/* SCORE */}
                <div className="text-right shrink-0">
                   <div className={`text-xl md:text-2xl font-black ${rank === 1 ? "text-royal-gold" : "text-royal-text"}`}>
                      ${whale.totalSpentUsd.toLocaleString()}
                   </div>
                   <div className="text-[10px] font-bold text-royal-muted uppercase tracking-widest">Total Support</div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-16 p-8 rounded-[2rem] bg-royal-primary/5 border border-royal-primary/20 text-center">
           <h4 className="font-black uppercase tracking-tight mb-2">Want to see your name here?</h4>
           <p className="text-xs text-royal-muted mb-6">Every purchase moves you up the ranks. Reach legendary status today.</p>
           <Link href="/#games" className="btn-primary inline-flex">Start Mission</Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}

import Link from "next/link";
