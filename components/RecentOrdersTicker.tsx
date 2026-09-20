"use client";

import { useEffect, useState } from "react";
import { Zap, ShoppingCart, Globe, Clock } from "lucide-react";

interface RecentOrder {
  gameName: string;
  productName: string;
  playerUid: string;
  createdAt: string;
}

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "JUST NOW";
  if (mins < 60) return `${mins}M AGO`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}H AGO`;
  return `${Math.floor(hrs / 24)}D AGO`;
}

export default function RecentOrdersTicker() {
  const [orders, setOrders] = useState<RecentOrder[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    fetch("/api/orders/recent")
      .then((r) => r.json())
      .then((d) => setOrders(d.orders || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (orders.length > 0) {
      const timer = setInterval(() => {
        setCurrentIndex((prev) => (prev + 1) % orders.length);
      }, 5000);
      return () => clearInterval(timer);
    }
  }, [orders]);

  if (orders.length === 0) return null;

  const currentOrder = orders[currentIndex];

  return (
    <div className="flex justify-center md:justify-start">
      <div className="group relative flex items-center gap-4 bg-royal-card/80 backdrop-blur-3xl border border-white/10 rounded-2xl p-4 shadow-2xl transition-all duration-500 hover:border-royal-primary/50 hover:bg-royal-card animate-in slide-in-from-bottom-4">
        {/* ICON */}
        <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-royal-primary/20 text-royal-primary overflow-hidden">
           <Zap className="h-6 w-6 relative z-10" fill="currentColor" />
           <div className="absolute inset-0 bg-royal-primary opacity-20 animate-pulse" />
        </div>

        {/* CONTENT */}
        <div className="flex flex-col min-w-[200px]">
          <div className="flex items-center gap-2 mb-1">
             <span className="flex items-center gap-1 text-[10px] font-black text-royal-primary uppercase tracking-widest">
                <Globe size={10} />
                Global Feed
             </span>
             <span className="h-1 w-1 rounded-full bg-royal-muted/30" />
             <span className="flex items-center gap-1 text-[10px] font-bold text-royal-muted uppercase tracking-widest">
                <Clock size={10} />
                {timeAgo(currentOrder.createdAt)}
             </span>
          </div>

          <div className="text-sm font-medium text-royal-text leading-snug">
            <span className="font-black text-royal-accent mr-1">@{currentOrder.playerUid.substring(0, 4)}***</span>
            <span className="text-royal-muted">deployed</span>
            <span className="font-black mx-1 text-royal-text">{currentOrder.productName}</span>
            <span className="text-royal-muted">to</span>
            <span className="font-black ml-1 text-royal-primary uppercase italic">{currentOrder.gameName}</span>
          </div>
        </div>

        {/* STATUS */}
        <div className="hidden sm:flex items-center gap-3 pl-4 border-l border-white/5">
           <div className="flex flex-col items-end">
              <div className="flex items-center gap-1.5 text-[9px] font-black text-green-500 uppercase tracking-tighter">
                 <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                 Delivered
              </div>
              <div className="text-[10px] font-bold text-royal-muted/50 font-mono">ID: #{Math.random().toString(16).substring(2, 8).toUpperCase()}</div>
           </div>
        </div>

        {/* PROGRESS BAR */}
        <div className="absolute bottom-0 left-0 h-1 bg-royal-primary/30 rounded-full overflow-hidden w-full">
           <div 
             key={currentIndex}
             className="h-full bg-royal-primary" 
             style={{ 
               animation: 'ticker-progress 5s linear forwards' 
             }} 
           />
        </div>

        <style jsx>{`
          @keyframes ticker-progress {
            from { width: 0%; }
            to { width: 100%; }
          }
        `}</style>
      </div>
    </div>
  );
}
