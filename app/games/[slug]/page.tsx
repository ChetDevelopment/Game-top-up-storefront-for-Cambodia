  import { prisma } from "@/lib/prisma";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import TopUpForm from "@/components/TopUpForm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Zap } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function GamePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const game = await prisma.game.findUnique({
    where: { slug },
    include: {
      products: {
        where: { active: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  }).catch(() => null);

  if (!game || !game.active) notFound();

  const THEME_COLORS: Record<string, string> = {
    "mobile-legends": "#a855f7", // Purple
    "free-fire": "#f97316",      // Orange
    "genshin-impact": "#0ea5e9", // Cyan/Light Blue
    "pubg-mobile": "#fbbf24",    // Yellow/Gold
    "honkai-star-rail": "#6366f1" // Indigo
  };

  const themeColor = THEME_COLORS[game.slug] || "#6366f1";

  return (
    <div style={{ "--royal-primary": themeColor } as any}>
      <Header />

      {/* Game banner */}
      <section className="relative overflow-hidden border-b border-royal-border">
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: game.bannerUrl ? `url(${game.bannerUrl})` : undefined,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-royal-bg via-royal-bg/90 to-royal-bg/70" />

        <div className="relative mx-auto max-w-6xl px-4 py-8 sm:py-12 sm:px-6 lg:px-8">
          <Link
            href="/#games"
            className="inline-flex items-center gap-2 text-sm text-royal-muted hover:text-royal-primary transition-colors mb-4 sm:mb-6"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={2} />
            All games
          </Link>

          <div className="flex items-center gap-4 sm:gap-6">
            <div
              className="h-20 w-20 sm:h-28 sm:w-28 rounded-2xl border-2 border-royal-border bg-royal-card shadow-xl shrink-0 overflow-hidden"
              style={{
                backgroundImage: `url(${game.imageUrl})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            />
            <div>
              <p className="text-[10px] sm:text-xs uppercase tracking-widest text-royal-muted mb-1">
                {game.publisher}
              </p>
              <h1 className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold leading-tight mb-1 sm:mb-2">
                {game.name}
              </h1>
              <div className="flex items-center gap-3">
                <p className="text-royal-accent text-xs sm:text-sm">
                  Top up {game.currencyName}
                </p>
                <span className="inline-flex items-center gap-1 rounded-full border border-green-400/30 bg-green-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-green-300">
                  <Zap className="h-2.5 w-2.5" strokeWidth={3} />
                  Instant delivery
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:py-12 sm:px-6 lg:px-8">
        <TopUpForm
          game={{
            id: game.id,
            slug: game.slug,
            name: game.name,
            currencyName: game.currencyName,
            uidLabel: game.uidLabel,
            uidExample: game.uidExample,
            requiresServer: game.requiresServer,
            servers: (() => { try { return JSON.parse(game.servers || "[]"); } catch { return []; } })(),
          }}
          products={game.products.map((p) => ({
            id: p.id,
            name: p.name,
            amount: p.amount,
            bonus: p.bonus,
            priceUsd: p.priceUsd,
            resellerPriceUsd: p.resellerPriceUsd,
            officialPriceUsd: p.officialPriceUsd,
            salePriceUsd: p.salePriceUsd,
            saleEndsAt: p.saleEndsAt ? p.saleEndsAt.toISOString() : null,
            isMysteryBox: p.isMysteryBox,
            badge: p.badge,
            imageUrl: p.imageUrl,
          }))}
        />
      </main>

      <Footer />
    </div>
  );
}
