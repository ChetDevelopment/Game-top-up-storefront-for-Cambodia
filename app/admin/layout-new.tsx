import Link from "next/link";
import { getCurrentAdmin } from "@/lib/auth";
import {
  LayoutDashboard,
  BarChart3,
  TrendingUp,
  ShoppingBag,
  Gamepad2,
  Gem,
  Ticket,
  Image as ImageIcon,
  HelpCircle,
  FileText,
  Users,
  Ban,
  History,
  Settings,
  Shield,
  Package,
  Store,
  Megaphone,
  RefreshCw,
  ChevronDown,
  Bell,
  Search,
  LogOut
} from "lucide-react";
import LogoutButton from "@/components/LogoutButton";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await getCurrentAdmin();

  if (!admin) {
    return <>{children}</>;
  }

  const menuItems = [
    { href: "/admin", label: "Dashboard", icon: LayoutDashboard, section: "Main" },
    { href: "/admin/insights", label: "Insights", icon: BarChart3, section: "Main" },
    { href: "/admin/orders", label: "Orders", icon: ShoppingBag, section: "Management" },
    { href: "/admin/games", label: "Games", icon: Gamepad2, section: "Management" },
    { href: "/admin/products", label: "Products", icon: Gem, section: "Management" },
    { href: "/admin/tools/pricing", label: "Pricing Tool", icon: TrendingUp, section: "Management" },
    { href: "/admin/price-sync", label: "Price Sync", icon: RefreshCw, section: "Management" },
    { href: "/admin/promo-codes", label: "Promo Codes", icon: Ticket, section: "Marketing" },
    { href: "/admin/banners", label: "Banners", icon: ImageIcon, section: "Marketing" },
    { href: "/admin/popup", label: "Popup", icon: Megaphone, section: "Marketing" },
    { href: "/admin/faqs", label: "FAQ", icon: HelpCircle, section: "Content" },
    { href: "/admin/blog", label: "Blog", icon: FileText, section: "Content" },
    { href: "/admin/customers", label: "Customers", icon: Users, section: "Users" },
    { href: "/admin/banlist", label: "Banlist", icon: Ban, section: "Users" },
    { href: "/admin/users", label: "Elite Members", icon: Users, section: "Users" },
    { href: "/admin/resellers", label: "Resellers", icon: Store, section: "Users" },
    { href: "/admin/bundles", label: "Bundles", icon: Package, section: "Products" },
    { href: "/admin/audit-logs", label: "Audit Log", icon: History, section: "System" },
    { href: "/admin/settings", label: "Settings", icon: Settings, section: "System" },
  ];

  // Group menu items by section
  const groupedMenu = menuItems.reduce((acc, item) => {
    if (!acc[item.section]) {
      acc[item.section] = [];
    }
    acc[item.section].push(item);
    return acc;
  }, {} as Record<string, typeof menuItems>);

  return (
    <div className="min-h-screen flex bg-[var(--nexus-bg)] text-[var(--nexus-text)]">
      {/* SIDEBAR - New Design */}
      <aside className="w-72 border-r border-[var(--nexus-border)] bg-[var(--nexus-bg-secondary)] flex flex-col sticky top-0 h-screen">
        {/* Logo */}
        <Link href="/admin" className="p-6 border-b border-[var(--nexus-border)]">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[var(--nexus-primary)] to-[var(--nexus-accent)] flex items-center justify-center shadow-lg shadow-[var(--nexus-primary)]/20">
              <Shield className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="font-display font-bold text-lg tracking-tight">
                Nexus<span className="text-[var(--nexus-primary)]">Admin</span>
              </div>
              <div className="text-[9px] text-[var(--nexus-text-muted)] uppercase font-semibold tracking-[0.2em]">
                Control Panel
              </div>
            </div>
          </div>
        </Link>

        {/* Search Bar */}
        <div className="p-4 border-b border-[var(--nexus-border)]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--nexus-text-muted)]" />
            <input
              type="text"
              placeholder="Search..."
              className="w-full bg-[var(--nexus-bg)] border border-[var(--nexus-border)] rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--nexus-primary)] focus:border-transparent transition-all"
            />
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-6 overflow-y-auto scrollbar-thin scrollbar-thumb-[var(--nexus-border)]">
          {Object.entries(groupedMenu).map(([section, items]) => (
            <div key={section}>
              <div className="text-[10px] font-black uppercase tracking-widest text-[var(--nexus-text-muted)] mb-3 px-3">
                {section}
              </div>
              <div className="space-y-1">
                {items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-[var(--nexus-text-secondary)] hover:bg-[var(--nexus-surface)] hover:text-[var(--nexus-primary)] transition-all duration-200 group"
                  >
                    <item.icon className="h-4.5 w-4.5 group-hover:scale-110 transition-transform duration-200" />
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* User Profile */}
        <div className="p-4 border-t border-[var(--nexus-border)] bg-[var(--nexus-bg)]">
          <div className="flex items-center gap-3 px-2 mb-4">
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-[var(--nexus-primary)] to-[var(--nexus-accent)] flex items-center justify-center text-sm font-bold text-white shadow-lg">
              {admin.email[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-[var(--nexus-text-muted)] font-medium truncate">Logged in as</div>
              <div className="text-sm font-semibold text-[var(--nexus-text)] truncate">{admin.email}</div>
            </div>
            <button className="h-8 w-8 rounded-lg hover:bg-[var(--nexus-surface)] flex items-center justify-center transition-colors">
              <Bell className="h-4 w-4 text-[var(--nexus-text-secondary)]" />
            </button>
          </div>
          <LogoutButton />
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 overflow-auto">
        {/* Top Bar */}
        <header className="sticky top-0 z-50 bg-[var(--nexus-bg)]/80 backdrop-blur-xl border-b border-[var(--nexus-border)] px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-display font-bold">Welcome back</h1>
              <p className="text-sm text-[var(--nexus-text-muted)]">Manage your top-up platform</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--nexus-surface)] border border-[var(--nexus-border)]">
                <div className="h-2 w-2 rounded-full bg-[var(--nexus-success)] animate-pulse" />
                <span className="text-sm font-medium">System Online</span>
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
