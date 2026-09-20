import { prisma } from "@/lib/prisma";
import Header from "@/components/HeaderNew";
import Footer from "@/components/FooterNew";
import GameCardNew from "@/components/GameCardNew";
import Link from "next/link";
import { 
  Zap, 
  Shield, 
  Rocket, 
  Gamepad2, 
  TrendingUp, 
  Users, 
  Sparkles,
  ArrowRight,
  Play,
  Star
} from "lucide-react";

export const revalidate = 60;

export default async function HomePage() {
  const [settings, games, banners, recentOrders] = await Promise.all([
    prisma.settings.findUnique({ where: { id: 1 } }).catch(() => null),
    prisma.game.findMany({
      where: { active: true },
      orderBy: [{ featured: "desc" }, { sortOrder: "asc" }],
      select: { id: true, slug: true, name: true, publisher: true, currencyName: true, imageUrl: true, featured: true },
    }).catch(() => []),
    prisma.heroBanner.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, title: true, subtitle: true, imageUrl: true, linkUrl: true, ctaLabel: true },
    }).catch(() => []),
    prisma.order.findMany({
      where: { status: { in: ["PAID", "DELIVERED"] } },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { game: { select: { name: true, imageUrl: true } }, product: { select: { name: true } } },
    }).catch(() => []),
  ]);

  return (
    <div className="min-h-screen bg-[var(--nexus-bg)] text-[var(--nexus-text)] overflow-x-hidden">
      <Header />

      {/* HERO SECTION - Completely New Design */}
      <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden">
        {/* Animated Background Elements */}
        <div className="absolute inset-0 z-0">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[var(--nexus-primary)]/10 rounded-full blur-[120px] animate-pulse" />
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-[var(--nexus-accent)]/10 rounded-full blur-[100px] animate-pulse delay-1000" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[var(--nexus-secondary)]/5 rounded-full blur-[150px]" />
        </div>

        {/* Grid Pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:60px_60px] [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_80%)]" />

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="text-center">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--nexus-surface)]/50 backdrop-blur-xl border border-[var(--nexus-border)] mb-8 animate-fade-in">
              <Sparkles className="h-4 w-4 text-[var(--nexus-primary)]" />
              <span className="text-xs font-bold uppercase tracking-widest text-[var(--nexus-text-secondary)]">
                #1 Gaming Top-Up Platform in Cambodia
              </span>
            </div>

            {/* Main Headline */}
            <h1 className="font-display text-5xl sm:text-7xl md:text-8xl font-black tracking-tight mb-6 animate-slide-up">
              <span className="block text-[var(--nexus-text)]">LEVEL UP YOUR</span>
              <span className="block nexus-gradient-text">GAMING EXPERIENCE</span>
            </h1>

            {/* Subheadline */}
            <p className="max-w-2xl mx-auto text-lg sm:text-xl text-[var(--nexus-text-secondary)] mb-10 animate-slide-up delay-100">
              Instant game credits delivered in seconds. Support for 50+ games with 
              KHQR, ABA Pay, and all major Cambodian payment methods.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16 animate-slide-up delay-200">
              <Link 
                href="#games" 
                className="nexus-btn-primary text-lg px-8 py-4 group"
              >
                <Gamepad2 className="h-5 w-5" />
                Browse Games
                <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link 
                href="/order" 
                className="nexus-btn-ghost text-lg px-8 py-4"
              >
                <Play className="h-5 w-5" />
                Track Order
              </Link>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto">
              {[
                { icon: Zap, value: "50+", label: "Games Supported", color: "text-[var(--nexus-primary)]" },
                { icon: Users, value: "10K+", label: "Happy Gamers", color: "text-[var(--nexus-accent)]" },
                { icon: Rocket, value: "<60s", label: "Avg Delivery", color: "text-[var(--nexus-secondary)]" },
                { icon: Shield, value: "100%", label: "Secure Payment", color: "text-[var(--nexus-success)]" },
              ].map((stat, i) => (
                <div key={i} className="nexus-card p-6 animate-fade-in" style={{ animationDelay: `${i * 100}ms` }}>
                  <stat.icon className={`h-6 w-6 ${stat.color} mb-3`} />
                  <div className="text-3xl font-black mb-1">{stat.value}</div>
                  <div className="text-xs text-[var(--nexus-text-muted)] uppercase tracking-wider">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Scroll Indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
          <div className="w-6 h-10 rounded-full border-2 border-[var(--nexus-border)] flex items-start justify-center p-2">
            <div className="w-1 h-2 bg-[var(--nexus-primary)] rounded-full animate-pulse" />
          </div>
        </div>
      </section>

      {/* LIVE ACTIVITY FEED */}
      <section className="relative py-8 border-y border-[var(--nexus-border)] bg-[var(--nexus-bg-secondary)]/50">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center gap-4 overflow-hidden">
            <div className="flex items-center gap-2 flex-shrink-0">
              <TrendingUp className="h-5 w-5 text-[var(--nexus-primary)]" />
              <span className="text-sm font-bold uppercase tracking-widest text-[var(--nexus-text-secondary)]">
                Live Activity
              </span>
            </div>
            <div className="flex-1 overflow-hidden">
              <div className="flex gap-4 animate-[shimmer_20s_linear_infinite]">
                {recentOrders.map((order) => (
                  <div 
                    key={order.id} 
                    className="flex-shrink-0 nexus-card-glass px-4 py-2 flex items-center gap-3"
                  >
                    <div className="h-8 w-8 rounded-lg overflow-hidden">
                      <img src={order.game.imageUrl} alt={order.game.name} className="h-full w-full object-cover" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold">{order.game.name}</div>
                      <div className="text-[10px] text-[var(--nexus-text-muted)]">{order.product.name}</div>
                    </div>
                    <div className="nexus-badge-success">✓</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* GAMES SECTION - New Grid Layout */}
      <section id="games" className="relative py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Section Header */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
            <div>
              <div className="flex items-center gap-2 text-[var(--nexus-primary)] font-black uppercase tracking-[0.2em] mb-3">
                <span className="h-[2px] w-8 bg-[var(--nexus-primary)]"></span>
                Game Library
              </div>
              <h2 className="font-display text-4xl sm:text-5xl md:text-6xl font-black tracking-tight">
                Choose Your <span className="nexus-gradient-text">Game</span>
              </h2>
            </div>
            <p className="text-[var(--nexus-text-secondary)] max-w-md text-lg">
              Instant delivery on all titles. No password required. Just your player ID.
            </p>
          </div>

          {/* Games Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
            {games.map((game, i) => (
              <div 
                key={game.id} 
                className="animate-slide-up"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <GameCardNew
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

          {/* View All Link */}
          {games.length > 12 && (
            <div className="text-center mt-12">
              <Link href="/games" className="nexus-btn-outline px-8 py-3">
                View All Games
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* FEATURES SECTION - Completely Redesigned */}
      <section className="relative py-24 bg-[var(--nexus-bg-secondary)]/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="font-display text-4xl sm:text-5xl font-black mb-4">
              Why Choose <span className="nexus-gradient-text">Nexus</span>?
            </h2>
            <p className="text-[var(--nexus-text-secondary)] text-lg max-w-2xl mx-auto">
              Built by gamers, for gamers. Experience the fastest top-up service in Cambodia.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: Zap,
                title: "Instant Delivery",
                description: "Automated system delivers your credits in under 60 seconds. No waiting, no delays.",
                gradient: "from-[var(--nexus-primary)] to-[var(--nexus-accent)]",
              },
              {
                icon: Shield,
                title: "100% Secure",
                description: "Bank-level encryption and secure payment gateways. Your data is always protected.",
                gradient: "from-[var(--nexus-accent)] to-[var(--nexus-secondary)]",
              },
              {
                icon: Rocket,
                title: "24/7 Support",
                description: "Our team is available around the clock to help with any issues or questions.",
                gradient: "from-[var(--nexus-secondary)] to-[var(--nexus-primary)]",
              },
            ].map((feature, i) => (
              <div 
                key={i} 
                className="nexus-card-hover p-8 group relative overflow-hidden"
              >
                {/* Gradient Background on Hover */}
                <div className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} opacity-0 group-hover:opacity-10 transition-opacity duration-500`} />
                
                <div className="relative">
                  <div className={`inline-flex h-14 w-14 rounded-2xl bg-gradient-to-br ${feature.gradient} items-center justify-center mb-6 shadow-lg`}>
                    <feature.icon className="h-7 w-7 text-white" />
                  </div>
                  <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
                  <p className="text-[var(--nexus-text-secondary)] leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS - New Timeline Design */}
      <section className="relative py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="font-display text-4xl sm:text-5xl font-black mb-4">
              How It <span className="nexus-gradient-text">Works</span>
            </h2>
            <p className="text-[var(--nexus-text-secondary)] text-lg">
              Three simple steps to get your game credits
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 relative">
            {/* Connection Line */}
            <div className="hidden md:block absolute top-12 left-[16%] right-[16%] h-[2px] bg-gradient-to-r from-[var(--nexus-primary)]/20 via-[var(--nexus-accent)]/20 to-[var(--nexus-secondary)]/20" />

            {[
              {
                step: "01",
                title: "Select Game",
                description: "Choose from our library of 50+ popular games",
                icon: Gamepad2,
                color: "[var(--nexus-primary)]",
              },
              {
                step: "02",
                title: "Enter Player ID",
                description: "Input your player ID - no password needed",
                icon: Users,
                color: "[var(--nexus-accent)]",
              },
              {
                step: "03",
                title: "Pay & Receive",
                description: "Complete payment and get instant delivery",
                icon: Rocket,
                color: "[var(--nexus-secondary)]",
              },
            ].map((item, i) => (
              <div key={i} className="relative text-center group">
                {/* Step Number Badge */}
                <div className="relative inline-flex mb-6">
                  <div 
                    className="h-24 w-24 rounded-2xl flex items-center justify-center border-4 border-[var(--nexus-bg)] shadow-xl"
                    style={{ background: `linear-gradient(135deg, ${item.color}20 0%, ${item.color}40 100%)` }}
                  >
                    <item.icon className="h-10 w-10" style={{ color: item.color }} />
                  </div>
                  <div 
                    className="absolute -top-2 -right-2 h-8 w-8 rounded-full flex items-center justify-center text-xs font-black"
                    style={{ background: item.color }}
                  >
                    {item.step}
                  </div>
                </div>

                <h3 className="text-xl font-bold mb-2">{item.title}</h3>
                <p className="text-[var(--nexus-text-secondary)]">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA SECTION */}
      <section className="relative py-24">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="nexus-card-glass rounded-[2.5rem] p-12 md:p-16 text-center relative overflow-hidden">
            {/* Background Glow */}
            <div className="absolute top-0 left-1/4 w-64 h-64 bg-[var(--nexus-primary)]/20 rounded-full blur-[100px]" />
            <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-[var(--nexus-accent)]/20 rounded-full blur-[100px]" />

            <div className="relative">
              <h2 className="font-display text-4xl sm:text-5xl md:text-6xl font-black mb-6">
                Ready to <span className="nexus-gradient-text">Start?</span>
              </h2>
              <p className="text-[var(--nexus-text-secondary)] text-lg mb-10 max-w-2xl mx-auto">
                Join thousands of gamers who trust Nexus for their top-up needs. 
                Get started in less than 60 seconds.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link href="#games" className="nexus-btn-primary text-lg px-10 py-4">
                  <Gamepad2 className="h-5 w-5" />
                  Start Top-Up
                </Link>
                <Link href="/support" className="nexus-btn-ghost text-lg px-10 py-4">
                  Contact Support
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
