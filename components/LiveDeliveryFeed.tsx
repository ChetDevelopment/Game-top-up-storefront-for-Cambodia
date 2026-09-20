"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Zap } from "lucide-react";

interface Delivery {
  id: string;
  gameName: string;
  productName: string;
  timeAgo: string;
}

const DUMMY_DELIVERIES: Omit<Delivery, "id">[] = [
  { gameName: "Mobile Legends", productName: "86 Diamonds", timeAgo: "12 seconds ago" },
  { gameName: "Free Fire", productName: "100 Diamonds", timeAgo: "45 seconds ago" },
  { gameName: "PUBG Mobile", productName: "60 UC", timeAgo: "1 minute ago" },
  { gameName: "Genshin Impact", productName: "60 Genesis Crystals", timeAgo: "3 minutes ago" },
  { gameName: "Mobile Legends", productName: "Weekly Diamond Pass", timeAgo: "5 minutes ago" },
];

export default function LiveDeliveryFeed() {
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const showNext = () => {
      const random = DUMMY_DELIVERIES[Math.floor(Math.random() * DUMMY_DELIVERIES.length)];
      setDelivery({ ...random, id: Math.random().toString() });
      setIsVisible(true);

      setTimeout(() => {
        setIsVisible(false);
      }, 5000);
    };

    const interval = setInterval(() => {
      if (!isVisible) showNext();
    }, 15000 + Math.random() * 10000);

    // Initial show
    const timer = setTimeout(showNext, 5000);

    return () => {
      clearInterval(interval);
      clearTimeout(timer);
    };
  }, [isVisible]);

  if (!delivery) return null;

  return (
    <div
      className={`fixed bottom-24 left-4 z-50 transition-all duration-700 transform ${
        isVisible ? "translate-x-0 opacity-100" : "-translate-x-full opacity-0"
      }`}
    >
      <div className="flex items-center gap-3 bg-royal-surface/80 backdrop-blur-xl border border-royal-primary/20 p-3 rounded-2xl shadow-2xl shadow-royal-primary/10 max-w-xs">
        <div className="h-10 w-10 rounded-xl bg-royal-primary/20 flex items-center justify-center text-royal-primary shrink-0">
          <Zap className="h-5 w-5" strokeWidth={3} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-[10px] font-black text-royal-primary uppercase tracking-widest">Live Delivery</span>
            <span className="h-1 w-1 rounded-full bg-green-500 animate-pulse" />
          </div>
          <div className="text-xs font-bold text-royal-text truncate">
            {delivery.productName} in {delivery.gameName}
          </div>
          <div className="text-[10px] text-royal-muted italic">{delivery.timeAgo}</div>
        </div>
        <div className="h-6 w-6 rounded-full bg-green-500/10 flex items-center justify-center text-green-400">
          <CheckCircle2 className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}
