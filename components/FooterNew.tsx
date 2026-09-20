import Link from "next/link";
import { 
  ShoppingBag, 
  Github, 
  Twitter, 
  Facebook, 
  Instagram,
  Mail,
  Phone,
  MapPin,
  Heart
} from "lucide-react";

export default function FooterNew() {
  const currentYear = new Date().getFullYear();

  const footerLinks = {
    Product: [
      { href: "/games", label: "Games" },
      { href: "/order", label: "Track Order" },
      { href: "/reseller", label: "Reseller Program" },
      { href: "/refer-and-earn", label: "Refer & Earn" },
    ],
    Support: [
      { href: "/faq", label: "FAQ" },
      { href: "/support", label: "Contact Us" },
      { href: "/terms", label: "Terms of Service" },
      { href: "/privacy", label: "Privacy Policy" },
    ],
    Company: [
      { href: "/blog", label: "Blog" },
      { href: "/about", label: "About Us" },
      { href: "/leaderboard", label: "Leaderboard" },
      { href: "/daily-mission", label: "Daily Missions" },
    ],
  };

  const socialLinks = [
    { href: "https://facebook.com", icon: Facebook, label: "Facebook" },
    { href: "https://twitter.com", icon: Twitter, label: "Twitter" },
    { href: "https://instagram.com", icon: Instagram, label: "Instagram" },
    { href: "https://github.com", icon: Github, label: "GitHub" },
  ];

  return (
    <footer className="relative border-t border-[var(--nexus-border)] bg-[var(--nexus-bg-secondary)]">
      {/* Background Gradient */}
      <div className="absolute inset-0 bg-gradient-to-t from-[var(--nexus-primary)]/5 to-transparent pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {/* Main Footer Content */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-12 mb-12">
          {/* Brand Column */}
          <div className="lg:col-span-2">
            <Link href="/" className="flex items-center gap-3 mb-6">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[var(--nexus-primary)] to-[var(--nexus-accent)] flex items-center justify-center shadow-lg">
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

            <p className="text-[var(--nexus-text-secondary)] mb-6 leading-relaxed">
              The fastest and most secure game top-up platform in Cambodia. 
              Instant delivery, 24/7 support, and the best prices.
            </p>

            {/* Contact Info */}
            <div className="space-y-3 mb-6">
              <div className="flex items-center gap-3 text-sm text-[var(--nexus-text-secondary)]">
                <Mail className="h-4 w-4 text-[var(--nexus-primary)]" />
                support@example.com
              </div>
              <div className="flex items-center gap-3 text-sm text-[var(--nexus-text-secondary)]">
                <Phone className="h-4 w-4 text-[var(--nexus-primary)]" />
                +855 XX XXX XXX
              </div>
              <div className="flex items-center gap-3 text-sm text-[var(--nexus-text-secondary)]">
                <MapPin className="h-4 w-4 text-[var(--nexus-primary)]" />
                Phnom Penh, Cambodia
              </div>
            </div>

            {/* Social Links */}
            <div className="flex items-center gap-3">
              {socialLinks.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-10 w-10 rounded-xl bg-[var(--nexus-surface)] border border-[var(--nexus-border)] flex items-center justify-center text-[var(--nexus-text-secondary)] hover:text-[var(--nexus-primary)] hover:border-[var(--nexus-primary)] transition-all hover:-translate-y-1"
                  aria-label={social.label}
                >
                  <social.icon className="h-5 w-5" />
                </a>
              ))}
            </div>
          </div>

          {/* Link Columns */}
          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h3 className="font-semibold text-sm uppercase tracking-wider mb-4">
                {category}
              </h3>
              <ul className="space-y-3">
                {links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-[var(--nexus-text-secondary)] hover:text-[var(--nexus-primary)] transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-[var(--nexus-border)]">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            {/* Copyright */}
            <div className="text-sm text-[var(--nexus-text-muted)]">
              © {currentYear} Nexus TopUp. All rights reserved.
            </div>

            {/* Made with Love */}
            <div className="flex items-center gap-2 text-sm text-[var(--nexus-text-muted)]">
              Made with <Heart className="h-4 w-4 text-[var(--nexus-secondary)] fill-[var(--nexus-secondary)]" /> for gamers
            </div>

            {/* Payment Methods */}
            <div className="flex items-center gap-3">
              <div className="text-xs text-[var(--nexus-text-muted)] mr-2">
                Accepted Payments:
              </div>
              <div className="flex items-center gap-2">
                {["KHQR", "ABA", "Wing", "TrueMoney"].map((method) => (
                  <div
                    key={method}
                    className="px-3 py-1.5 rounded-lg bg-[var(--nexus-surface)] border border-[var(--nexus-border)] text-[10px] font-semibold text-[var(--nexus-text-secondary)]"
                  >
                    {method}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
