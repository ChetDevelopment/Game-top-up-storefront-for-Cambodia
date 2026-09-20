"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface Banner {
  id: string;
  title: string;
  subtitle: string | null;
  imageUrl: string;
  linkUrl: string | null;
  ctaLabel: string | null;
}

export default function HeroCarousel({ banners }: { banners: Banner[] }) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (banners.length <= 1) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % banners.length), 5000);
    return () => clearInterval(t);
  }, [banners.length]);

  if (banners.length === 0) return null;

  const prev = () => setIdx((i) => (i - 1 + banners.length) % banners.length);
  const next = () => setIdx((i) => (i + 1) % banners.length);

  const current = banners[idx];
  const inner = (
    <div className="relative h-full w-full overflow-hidden rounded-2xl border border-royal-border bg-royal-card">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={current.imageUrl} alt={current.title} className="h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-8">
        <h3 className="font-display text-xl sm:text-3xl font-bold text-white drop-shadow">{current.title}</h3>
        {current.subtitle && <p className="text-sm sm:text-base text-white/80 mt-1 max-w-xl">{current.subtitle}</p>}
        {current.ctaLabel && current.linkUrl && (
          <span className="mt-4 inline-flex items-center gap-2 rounded-xl bg-royal-primary px-5 py-2 text-sm font-semibold text-black shadow-lg">
            {current.ctaLabel}
          </span>
        )}
      </div>
    </div>
  );

  return (
    <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div className="relative h-48 sm:h-72 lg:h-80">
        {current.linkUrl ? <Link href={current.linkUrl} className="block h-full">{inner}</Link> : inner}

        {banners.length > 1 && (
          <>
            <button onClick={prev} aria-label="Previous" className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white backdrop-blur hover:bg-black/70">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button onClick={next} aria-label="Next" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white backdrop-blur hover:bg-black/70">
              <ChevronRight className="h-5 w-5" />
            </button>
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
              {banners.map((_, i) => (
                <button key={i} onClick={() => setIdx(i)} aria-label={`Slide ${i + 1}`} className={`h-1.5 rounded-full transition-all ${i === idx ? "w-6 bg-royal-primary" : "w-1.5 bg-white/40"}`} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

