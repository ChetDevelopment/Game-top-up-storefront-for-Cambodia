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
  ShieldCheck,
  Package,
  Store,
  Megaphone,
  RefreshCw,
  Database
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
    { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
    { href: "/admin/insights", label: "Insights", icon: BarChart3 },
    { href: "/admin/orders", label: "Orders", icon: ShoppingBag },
    { href: "/admin/games", label: "Games", icon: Gamepad2 },
    { href: "/admin/products", label: "Products", icon: Gem },
    { href: "/admin/g2bulk/catalogue", label: "G2Bulk Catalogue", icon: Database },
    { href: "/admin/tools/pricing", label: "Pricing Tool", icon: TrendingUp },
    { href: "/admin/price-sync", label: "Price Sync", icon: RefreshCw },
    { href: "/admin/promo-codes", label: "Promo Codes", icon: Ticket },
    { href: "/admin/banners", label: "Banners", icon: ImageIcon },
    { href: "/admin/popup", label: "Popup", icon: Megaphone },
    { href: "/admin/faqs", label: "FAQ", icon: HelpCircle },
    { href: "/admin/blog", label: "Blog", icon: FileText },
    { href: "/admin/customers", label: "Customers", icon: Users },
    { href: "/admin/banlist", label: "Banlist", icon: Ban },
    { href: "/admin/audit-logs", label: "Audit Log", icon: History },
    { href: "/admin/users", label: "Elite Members", icon: Users },
    { href: "/admin/resellers", label: "Resellers", icon: Store },
    { href: "/admin/bundles", label: "Bundles", icon: Package },
    { href: "/admin/settings", label: "Settings", icon: Settings },
  ];

  return (
    <div className="min-h-screen flex bg-black text-white">
      <aside className="w-64 border-r border-white/10 bg-zinc-950 flex flex-col sticky top-0 h-screen">
        <Link href="/admin" className="p-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-royal-primary flex items-center justify-center shadow-lg shadow-royal-primary/20">
              <ShieldCheck className="h-5 w-5 text-black" />
            </div>
            <div>
              <div className="font-display font-bold text-base tracking-tight">
                Ty Khai <span className="text-royal-primary">TopUp</span>
              </div>
              <div className="text-[10px] text-zinc-500 uppercase font-semibold tracking-[0.2em]">
                Control Center
              </div>
            </div>
          </div>
        </Link>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-800">
          {menuItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-zinc-400 hover:bg-white/5 hover:text-royal-primary transition-all duration-200 group"
            >
              <item.icon className="h-4.5 w-4.5 group-hover:scale-110 transition-transform duration-200" />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-white/10 bg-zinc-950/50">
          <div className="flex items-center gap-3 px-2 mb-4">
            <div className="h-8 w-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold border border-white/10">
              {admin.email[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-zinc-500 font-medium truncate">Logged in as</div>
              <div className="text-sm font-semibold text-zinc-200 truncate">{admin.email}</div>
            </div>
          </div>
          <LogoutButton />
        </div>
      </aside>

      <main className="flex-1 overflow-auto bg-zinc-950">
        <div className="min-h-full">
          {children}
        </div>
      </main>
    </div>
  );
}
