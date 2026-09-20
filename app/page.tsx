import { prisma } from "@/lib/prisma";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import GameCard from "@/components/GameCard";
import RecentOrdersTicker from "@/components/RecentOrdersTicker";
import HeroCarousel from "@/components/HeroCarousel";
import HomePopup from "@/components/HomePopup";
import Link from "next/link";
import { Search, Sparkles, Trophy, UserPlus, MousePointer2, Gamepad2, Rocket, Swords } from "lucide-react";

export const revalidate = 60;

export default async function HomePage() {
  const [settings, games, banners] = await Promise.all([
    prisma.settings.findUnique({ where: { id: 1 } }).catch(() => null),
    prisma.game.findMany({
      where: { active: true },
      orderBy: [{ featured: "desc" }, { sortOrder: "asc" }],
      select: {
        id: true, slug: true, name: true, publisher: true,
        currencyName: true, imageUrl: true, featured: true,
      },
    }).catch(() => []),
    prisma.heroBanner.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, title: true, subtitle: true, imageUrl: true, linkUrl: true, ctaLabel: true },
    }).catch(() => []),
  ]);

  return (
    <div className="min-h-screen bg-royal-bg text-royal-text selection:bg-royal-primary/30">
      <Header />
      <HomePopup settings={settings} />

      {/* BANNER CAROUSEL */}
      {banners.length > 0 && (
        <div className="pt-8">
          <HeroCarousel banners={banners} />
        </div>
      )}
      
      {/* IMMERSIVE HERO: COMMAND CENTER */}
      <section className="relative min-h-[60vh] flex flex-col items-center justify-center overflow-hidden py-12 md:py-20">
        {/* Background Layers */}
        <div className="absolute inset-0 z-0 bg-aurora opacity-40" />
        <div className="absolute inset-0 z-0 gamer-grid opacity-20 [mask-image:radial-gradient(ellipse_at_center,black,transparent_80%)]" />
        
        {/* Animated Orbs */}
        <div className="absolute top-1/4 left-1/4 h-[300px] w-[300px] rounded-full bg-royal-primary/20 blur-[100px] animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 h-[200px] w-[200px] rounded-full bg-royal-accent/10 blur-[80px] animate-float" />

        <div className="relative z-10 w-full max-w-7xl px-4 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-royal-primary/30 bg-royal-primary/5 backdrop-blur-md mb-6 animate-bounce">
            <Trophy className="h-3 w-3 text-royal-accent" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-royal-primary">New Season Live</span>
          </div>

          <h1 className="font-display text-5xl md:text-7xl font-black tracking-tighter mb-4 leading-tight">
            TY KHAI <span className="text-gradient">TOPUP</span><br/>
            <span className="text-3xl md:text-5xl text-royal-muted">GAMER HUB</span>
          </h1>

          <p className="max-w-xl mx-auto text-base md:text-lg text-royal-muted/80 mb-8 font-medium">
            The ultimate command center for your gaming needs. Instant credits, zero lag, maximum power.
          </p>

          {/* COMMAND CENTER SEARCH */}
          <div className="relative max-w-2xl mx-auto group">
            <div className="absolute -inset-1 bg-gradient-to-r from-royal-primary to-royal-accent rounded-xl blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
            <div className="relative flex items-center bg-royal-surface/80 backdrop-blur-3xl border border-white/10 rounded-xl p-1.5 command-input-glow">
              <Search className="ml-4 h-6 w-6 text-royal-primary" />
              <input 
                type="text" 
                placeholder="SEARCH FOR YOUR GAME..." 
                className="w-full bg-transparent border-none focus:ring-0 text-lg md:text-xl font-black px-4 py-3 placeholder:text-royal-muted/30 uppercase tracking-widest"
              />
              <button className="hidden md:flex items-center gap-2 bg-royal-primary hover:bg-indigo-500 text-white px-6 py-3 rounded-lg font-black transition-all active:scale-95 shadow-lg shadow-royal-primary/20">
                <Rocket className="h-4 w-4" />
                INITIATE
              </button>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap justify-center gap-4">
             <Link href="#games" className="group flex items-center gap-2 px-6 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all hover:-translate-y-1">
                <MousePointer2 className="h-4 w-4 text-royal-accent" />
                <span className="text-sm font-bold uppercase tracking-widest">Continue as Guest</span>
             </Link>
          </div>
        </div>
      </section>

      {/* RECENT ACTIVITY TICKER - FLOATING STYLE */}
      <div className="sticky bottom-8 z-50 pointer-events-none w-full px-4 overflow-hidden">
        <div className="max-w-4xl mx-auto pointer-events-auto">
          <RecentOrdersTicker />
        </div>
      </div>

      {/* QUEST SECTION */}
      <section className="relative py-24 px-4 overflow-hidden">
        <div className="max-w-5xl mx-auto">
          <div className="relative glass-morphism rounded-[2.5rem] p-8 md:p-12 overflow-hidden border-royal-primary/20">
            <div className="absolute top-0 right-0 p-12 opacity-10 rotate-12">
               <Swords size={200} className="text-royal-primary" />
            </div>
            
            <div className="relative z-10 flex flex-col md:flex-row items-center gap-8 text-center md:text-left">
              <div className="h-24 w-24 rounded-3xl bg-royal-primary/20 flex items-center justify-center shadow-2xl shadow-royal-primary/20">
                <UserPlus className="h-12 w-12 text-royal-primary" />
              </div>
              <div className="flex-1">
                <h2 className="text-3xl md:text-4xl font-black mb-2 tracking-tight">ACTIVE QUEST: JOIN THE HUB</h2>
                <p className="text-royal-muted text-lg">Complete your profile to unlock exclusive legendary rewards and speed up your top-ups.</p>
              </div>
              <Link href="/login" className="btn-primary px-10 py-5 text-lg">
                ACCEPT QUEST
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* GAMES GRID */}
      <section id="games" className="relative py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-end justify-between mb-8 gap-4">
            <div>
              <div className="flex items-center gap-2 text-royal-primary font-black uppercase tracking-[0.2em] mb-2">
                <span className="h-[1px] w-6 bg-royal-primary"></span>
                Top Up Games
              </div>
              <h2 className="text-3xl md:text-5xl font-black tracking-tighter uppercase">Select Your <span className="text-gradient">Game</span></h2>
            </div>
            <p className="text-royal-muted font-medium max-w-xs md:text-right text-sm">
              Instant delivery protocol. Top up in under 60 seconds.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-5">
            {games.map((game, i) => (
              <div key={game.id} className="tilt-card" style={{ animationDelay: `${i * 100}ms` }}>
                <GameCard
                  slug={game.slug}
                  name={game.name}
                  publisher={game.publisher}
                  currencyName={game.currencyName}
                  imageUrl={game.imageUrl}
                  featured={game.featured}
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS - TECH VIBE */}
      <section className="relative py-16 px-4 bg-royal-surface/30">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { icon: Gamepad2, title: "SELECT MISSION", desc: "Choose your game from our catalog." },
              { icon: Sparkles, title: "SYNC PROFILE", desc: "Input your Player ID. No password needed." },
              { icon: Rocket, title: "EXECUTE ORDER", desc: "Instant KHQR payment. Delivered instantly." }
            ].map((step, i) => (
              <div key={i} className="group relative glass-morphism p-6 rounded-2xl border-white/5 hover:border-royal-primary/30 transition-all duration-500">
                <div className="mb-4 h-12 w-12 rounded-xl bg-royal-primary/10 flex items-center justify-center text-royal-primary group-hover:scale-110 group-hover:rotate-6 transition-all duration-500">
                  <step.icon size={24} />
                </div>
                <div className="text-royal-primary font-black mb-1 tracking-widest text-[10px] opacity-50">PHASE 0{i+1}</div>
                <h3 className="text-xl font-black mb-2 tracking-tight uppercase">{step.title}</h3>
                <p className="text-royal-muted text-sm leading-relaxed font-medium">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
