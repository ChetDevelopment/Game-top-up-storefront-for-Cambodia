"use client";

import Link from "next/link";
import { Gamepad2, TrendingUp, Star } from "lucide-react";

interface GameCardNewProps {
  slug: string;
  name: string;
  publisher: string;
  currencyName: string;
  imageUrl: string;
  featured: boolean;
}

export default function GameCardNew({
  slug,
  name,
  publisher,
  currencyName,
  imageUrl,
  featured,
}: GameCardNewProps) {
  return (
    <Link 
      href={`/games/${slug}`}
      className="group block relative"
    >
      <div className="nexus-card-hover overflow-hidden h-full">
        {/* Image Container */}
        <div className="relative aspect-[3/4] overflow-hidden">
          <img
            src={imageUrl}
            alt={name}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
          />
          
          {/* Gradient Overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--nexus-bg)] via-[var(--nexus-bg)]/20 to-transparent opacity-80 group-hover:opacity-90 transition-opacity" />
          
          {/* Featured Badge */}
          {featured && (
            <div className="absolute top-3 left-3">
              <div className="nexus-badge-hot">
                <Star className="h-3 w-3 fill-current" />
                Featured
              </div>
            </div>
          )}

          {/* Quick Stats Overlay - Shows on Hover */}
          <div className="absolute inset-0 bg-[var(--nexus-bg)]/80 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center">
            <div className="text-center px-4">
              <Gamepad2 className="h-8 w-8 text-[var(--nexus-primary)] mx-auto mb-2" />
              <div className="text-sm font-bold text-white">View Products</div>
              <div className="text-xs text-[var(--nexus-text-muted)] mt-1">{currencyName} Available</div>
            </div>
          </div>

          {/* Play Button - Always Visible on Hover */}
          <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <div className="h-10 w-10 rounded-full bg-[var(--nexus-primary)] flex items-center justify-center shadow-lg shadow-[var(--nexus-primary)]/30 group-hover:scale-110 transition-transform">
              <TrendingUp className="h-5 w-5 text-white" />
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-4">
          {/* Publisher */}
          <div className="text-[10px] font-black uppercase tracking-widest text-[var(--nexus-text-muted)] mb-2">
            {publisher}
          </div>
          
          {/* Game Name */}
          <h3 className="font-display font-bold text-base mb-2 line-clamp-2 group-hover:text-[var(--nexus-primary)] transition-colors">
            {name}
          </h3>

          {/* Currency Tag */}
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--nexus-surface)] border border-[var(--nexus-border)]">
            <div className="h-1.5 w-1.5 rounded-full bg-[var(--nexus-success)]" />
            <span className="text-[10px] font-semibold text-[var(--nexus-text-secondary)]">{currencyName}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
