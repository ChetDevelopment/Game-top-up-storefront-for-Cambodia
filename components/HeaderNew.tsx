"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, User, ShoppingBag, ChevronDown } from "lucide-react";
import { useState } from "react";

export default function HeaderNew() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { href: "/", label: "Home" },
    { href: "/games", label: "Games" },
    { href: "/order", label: "Track Order" },
    { href: "/blog", label: "Blog" },
    { href: "/faq", label: "FAQ" },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-[var(--nexus-border)] bg-[var(--nexus-bg)]/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[var(--nexus-primary)] to-[var(--nexus-accent)] flex items-center justify-center shadow-lg shadow-[var(--nexus-primary)]/20 group-hover:scale-105 transition-transform">
              <ShoppingBag className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="font-display font-black text-xl tracking-tight">
                NEXUS
              </div>
              <div className="text-[9px] text-[var(--nexus-text-muted)] uppercase tracking-[0.2em] -mt-1">
                TopUp
              </div>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                  pathname === link.href
                    ? "bg-[var(--nexus-surface)] text-[var(--nexus-primary)]"
                    : "text-[var(--nexus-text-secondary)] hover:text-[var(--nexus-text)] hover:bg-[var(--nexus-surface)]/50"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Right Side Actions */}
          <div className="hidden md:flex items-center gap-3">
            <Link 
              href="/login" 
              className="nexus-btn-ghost text-sm px-4 py-2"
            >
              <User className="h-4 w-4" />
              Sign In
            </Link>
            <Link 
              href="/register" 
              className="nexus-btn-primary text-sm px-4 py-2"
            >
              Get Started
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden h-10 w-10 rounded-xl flex items-center justify-center hover:bg-[var(--nexus-surface)] transition-colors"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-[var(--nexus-border)] animate-slide-up">
            <nav className="flex flex-col gap-2">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                    pathname === link.href
                      ? "bg-[var(--nexus-surface)] text-[var(--nexus-primary)]"
                      : "text-[var(--nexus-text-secondary)] hover:text-[var(--nexus-text)] hover:bg-[var(--nexus-surface)]/50"
                  }`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
              <div className="flex flex-col gap-2 mt-4 pt-4 border-t border-[var(--nexus-border)]">
                <Link 
                  href="/login" 
                  className="nexus-btn-ghost text-sm px-4 py-3 w-full justify-center"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Sign In
                </Link>
                <Link 
                  href="/register" 
                  className="nexus-btn-primary text-sm px-4 py-3 w-full justify-center"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Get Started
                </Link>
              </div>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
