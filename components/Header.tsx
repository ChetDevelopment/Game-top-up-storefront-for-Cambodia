"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import CurrencyToggle from "./CurrencyToggle";
import { User, LogIn, ShoppingBag, Search, Menu, X } from "lucide-react";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/#games", label: "Games" },
  { href: "/order", label: "Track Order" },
  { href: "/leaderboard", label: "Whales" },
];

export default function Header() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    
    // Check for user session (client side simplified)
    fetch("/api/user/me").then(r => r.json()).then(data => {
      if (data.user) setUser(data.user);
    }).catch(() => {});

    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-500 ${
        scrolled
          ? "py-3 border-b border-royal-border/50 bg-royal-bg/70 backdrop-blur-2xl"
          : "py-5 border-b border-transparent bg-transparent"
      }`}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3 group">
          <div className="relative h-16 w-16 flex items-center justify-center rounded-2xl bg-gradient-to-br from-royal-primary via-royal-accent to-royal-gold p-[1px] transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3 shadow-2xl shadow-royal-primary/20">
            <div className="h-full w-full rounded-[15px] bg-royal-bg flex items-center justify-center overflow-hidden">
              <img
                src="/icon-512x512.png"
                alt="Ty Khai TopUp"
                className="h-12 w-12 object-contain"
              />
            </div>
          </div>
          <div className="flex flex-col">
            <span className="font-display text-xl font-bold tracking-tight text-royal-text">
              Ty Khai <span className="text-royal-primary italic">TopUp</span>
            </span>
            <div className="flex items-center gap-1">
              <div className="h-1 w-1 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[9px] text-royal-muted font-bold tracking-widest uppercase">System Online</span>
            </div>
          </div>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden lg:flex items-center gap-1 px-2 py-1 rounded-2xl border border-royal-border/30 bg-royal-card/30 backdrop-blur-md">
          {NAV.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname?.startsWith(item.href.replace(/#.*/, ""));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative px-5 py-2 text-xs font-bold uppercase tracking-wider transition-all duration-300 rounded-xl ${
                  active ? "text-royal-text bg-royal-primary/10" : "text-royal-muted hover:text-royal-primary"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-3 mr-2">
             <CurrencyToggle />
          </div>

          {user ? (
            <Link 
              href="/account" 
              className="flex items-center gap-2 pl-2 pr-4 py-1.5 rounded-full border border-royal-border bg-royal-card/50 hover:border-royal-primary/50 transition-all"
            >
              <div className="h-7 w-7 rounded-full bg-royal-primary flex items-center justify-center text-black font-bold text-xs uppercase">
                {user.email[0]}
              </div>
              <span className="text-xs font-bold text-royal-text hidden sm:inline">Dashboard</span>
            </Link>
          ) : (
            <Link
              href="/login"
              className="group relative flex items-center gap-2 overflow-hidden rounded-xl bg-royal-card border border-royal-border px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-royal-text transition-all hover:border-royal-primary/50 hover:shadow-xl hover:shadow-royal-primary/10"
            >
              <LogIn className="h-4 w-4 text-royal-primary transition-transform group-hover:-translate-x-1" />
              <span>Sign In</span>
            </Link>
          )}

          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="lg:hidden p-2.5 rounded-xl border border-royal-border bg-royal-card/50 text-royal-text"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Nav */}
      <div className={`lg:hidden fixed inset-0 top-[73px] z-40 bg-royal-bg/95 backdrop-blur-2xl transition-all duration-500 ${mobileOpen ? "translate-x-0 opacity-100" : "translate-x-full opacity-0"}`}>
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 gap-2">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className="flex items-center justify-between p-4 rounded-2xl bg-royal-card/50 border border-royal-border text-lg font-bold text-royal-text"
              >
                {item.label}
                <div className="h-2 w-2 rounded-full bg-royal-primary/20" />
              </Link>
            ))}
          </div>
          
          <div className="p-6 rounded-3xl bg-gradient-to-br from-royal-primary/10 to-royal-accent/5 border border-royal-primary/20">
            <h4 className="text-sm font-bold uppercase tracking-widest text-royal-primary mb-4">Member Perks</h4>
            <ul className="space-y-3">
              <li className="flex items-center gap-3 text-xs text-royal-muted">
                <div className="h-5 w-5 rounded-lg bg-royal-primary/10 flex items-center justify-center text-royal-primary">✓</div>
                Save Multiple Game UIDs
              </li>
              <li className="flex items-center gap-3 text-xs text-royal-muted">
                <div className="h-5 w-5 rounded-lg bg-royal-primary/10 flex items-center justify-center text-royal-primary">✓</div>
                Exclusive Flash Discounts
              </li>
              <li className="flex items-center gap-3 text-xs text-royal-muted">
                <div className="h-5 w-5 rounded-lg bg-royal-primary/10 flex items-center justify-center text-royal-primary">✓</div>
                Detailed Order History
              </li>
            </ul>
            <Link 
              href="/login" 
              onClick={() => setMobileOpen(false)}
              className="mt-6 w-full flex items-center justify-center p-4 rounded-xl bg-royal-primary text-black font-black uppercase tracking-tighter"
            >
              Create Account
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}

