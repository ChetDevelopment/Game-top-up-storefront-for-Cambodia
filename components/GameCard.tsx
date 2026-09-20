import Link from "next/link";
import { Zap, Shield, Sparkles, ChevronRight } from "lucide-react";

interface GameCardProps {
  slug: string;
  name: string;
  publisher: string;
  currencyName: string;
  imageUrl: string;
  featured?: boolean;
}

export default function GameCard({ slug, name, publisher, currencyName, imageUrl, featured }: GameCardProps) {
  return (
    <Link
      href={`/games/${slug}`}
      className="group relative block w-full rounded-2xl p-px transition-all duration-500 hover:z-10"
    >
      {/* GLOWING BORDER EFFECT */}
      <div className="absolute -inset-0.5 rounded-2xl bg-gradient-to-br from-royal-primary via-royal-accent to-royal-primary opacity-0 group-hover:opacity-100 transition duration-500 blur-[2px]"></div>
      
      {/* CARD BODY */}
      <div className="relative flex flex-col h-full rounded-2xl bg-royal-card/80 backdrop-blur-3xl border border-white/5 overflow-hidden">
        
        {/* IMAGE CONTAINER */}
        <div className="relative aspect-[3/4] overflow-hidden">
          <div
            className="absolute inset-0 bg-cover bg-center transition-transform duration-700 ease-out group-hover:scale-110"
            style={imageUrl ? { backgroundImage: `url(${imageUrl})` } : { backgroundColor: '#1e1e3a' }}
          />
          
          {/* OVERLAYS */}
          <div className="absolute inset-0 bg-gradient-to-t from-royal-card/90 via-transparent to-transparent opacity-80" />
          
          {/* TOP BADGES */}
          {featured && (
            <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-lg bg-royal-accent text-black text-[8px] font-black uppercase tracking-wider shadow-lg">
              <Sparkles className="h-2.5 w-2.5" fill="currentColor" />
              HOT
            </div>
          )}

          {/* HOVER ICON */}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-500">
             <div className="h-10 w-10 rounded-full bg-royal-primary flex items-center justify-center shadow-2xl shadow-royal-primary/50 translate-y-2 group-hover:translate-y-0 transition-transform duration-500">
                <Zap className="h-5 w-5 text-white" fill="currentColor" />
             </div>
          </div>
        </div>

        {/* CONTENT */}
        <div className="p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[8px] font-bold text-royal-primary uppercase tracking-widest truncate max-w-[80%]">{publisher || "Global"}</span>
            <div className="h-1 w-1 rounded-full bg-green-500 animate-pulse" />
          </div>
          
          <h3 className="font-display font-bold text-sm sm:text-base text-royal-text leading-tight mb-2 group-hover:text-royal-primary transition-colors line-clamp-1">
            {name}
          </h3>

          <div className="flex items-center justify-between gap-2">
             <div className="flex flex-col min-w-0">
                <span className="text-royal-accent font-black text-xs tracking-tight truncate">{currencyName || "Credits"}</span>
             </div>
             <div className="h-7 w-7 rounded-lg bg-white/5 flex items-center justify-center border border-white/10 group-hover:bg-royal-primary group-hover:text-white transition-all duration-300 flex-shrink-0">
                <ChevronRight size={14} />
             </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
