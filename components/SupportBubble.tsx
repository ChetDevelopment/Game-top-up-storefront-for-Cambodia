"use client";

import { MessageCircle, Send } from "lucide-react";
import { useState } from "react";

export default function SupportBubble() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="fixed bottom-24 right-6 z-40 flex flex-col items-end gap-3 pointer-events-none">
      {isOpen && (
        <div className="flex flex-col gap-2 pointer-events-auto animate-in slide-in-from-bottom-4 fade-in">
          <a 
            href="https://t.me/Vichet_SAT" 
            target="_blank" 
            className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-[#0088cc] text-white shadow-xl hover:scale-105 transition-transform"
          >
            <Send className="h-5 w-5" />
            <span className="text-sm font-bold uppercase tracking-wider">Telegram</span>
          </a>
          <a 
            href="https://wa.me/85512345678" // Example number
            target="_blank" 
            className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-[#25D366] text-white shadow-xl hover:scale-105 transition-transform"
          >
            <MessageCircle className="h-5 w-5" />
            <span className="text-sm font-bold uppercase tracking-wider">WhatsApp</span>
          </a>
        </div>
      )}
      
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full bg-royal-primary text-black shadow-2xl shadow-royal-primary/40 hover:scale-110 active:scale-95 transition-all"
      >
        {isOpen ? <span className="text-2xl font-bold">✕</span> : <MessageCircle className="h-7 w-7" />}
      </button>
    </div>
  );
}
