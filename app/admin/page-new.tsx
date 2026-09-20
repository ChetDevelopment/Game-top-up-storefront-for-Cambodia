import { prisma } from "@/lib/prisma";
import Link from "next/link";
import {
  ShoppingBag,
  DollarSign,
  CheckCircle2,
  Clock,
  XCircle,
  Gamepad2,
  Package,
  ArrowRight,
  TrendingUp,
  Image as ImageIcon,
  HelpCircle,
  FileText,
  Users,
  Ban,
  History,
  Zap,
  Activity,
  CreditCard,
  Smile,
  Gem,
  Settings
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const now = new Date();
  const since = new Date(now);
  since.setDate(since.getDate() - 29);
  since.setHours(0, 0, 0, 0);

  const [
    totalOrders,
    pendingOrders,
    deliveredOrders,
    failedOrders,
    totalRevenue,
    recentOrders,
    gameCount,
    productCount,
    last30PaidOrders,
  ] = await Promise.all([
    prisma.order.count(),
    prisma.order.count({ where: { status: "PENDING" } }),
    prisma.order.count({ where: { status: "DELIVERED" } }),
    prisma.order.count({ where: { status: "FAILED" } }),
    prisma.order.aggregate({
      where: { status: { in: ["PAID", "DELIVERED"] } },
      _sum: { amountUsd: true },
    }),
    prisma.order.findMany({
      take: 10,
      orderBy: { createdAt: "desc" },
      include: {
        game: { select: { name: true } },
        product: { select: { name: true } },
      },
    }),
    prisma.game.count({ where: { active: true } }),
    prisma.product.count({ where: { active: true } }),
    prisma.order.findMany({
      where: {
        status: { in: ["PAID", "DELIVERED"] },
        paidAt: { gte: since },
      },
      select: { paidAt: true, amountUsd: true },
    }),
  ]);

  // Aggregate last-30-days revenue.
  const dayKey = (d: Date) => d.toISOString().slice(0, 10);
  const buckets = new Map<string, { revenue: number; count: number }>();
  for (let i = 0; i < 30; i++) {
    const d = new Date(since);
    d.setDate(since.getDate() + i);
    buckets.set(dayKey(d), { revenue: 0, count: 0 });
  }
  for (const o of last30PaidOrders) {
    if (!o.paidAt) continue;
    const k = dayKey(o.paidAt);
    const b = buckets.get(k);
    if (b) {
      b.revenue += o.amountUsd;
      b.count += 1;
    }
  }
  const dailyRevenue = Array.from(buckets.entries()).map(([date, v]) => ({ date, ...v }));
  const last30Total = dailyRevenue.reduce((s, d) => s + d.revenue, 0);

  const stats = [
    { 
      label: "Total Revenue", 
      value: `$${(totalRevenue._sum.amountUsd ?? 0).toFixed(2)}`, 
      change: "+12.5%",
      trend: "up",
      color: "[var(--nexus-primary)]",
      Icon: DollarSign, 
      bgGradient: "from-[var(--nexus-primary)]/20 to-[var(--nexus-accent)]/5" 
    },
    { 
      label: "Total Orders", 
      value: totalOrders.toLocaleString(), 
      change: "+8.2%",
      trend: "up",
      color: "[var(--nexus-accent)]",
      Icon: ShoppingBag, 
      bgGradient: "from-[var(--nexus-accent)]/20 to-[var(--nexus-primary)]/5" 
    },
    { 
      label: "Delivered", 
      value: deliveredOrders.toLocaleString(), 
      change: "+15.3%",
      trend: "up",
      color: "[var(--nexus-success)]",
      Icon: CheckCircle2, 
      bgGradient: "from-[var(--nexus-success)]/20 to-[var(--nexus-success)]/5" 
    },
    { 
      label: "Pending", 
      value: pendingOrders.toLocaleString(), 
      change: "-2.1%",
      trend: "down",
      color: "[var(--nexus-warning)]",
      Icon: Clock, 
      bgGradient: "from-[var(--nexus-warning)]/20 to-[var(--nexus-warning)]/5" 
    },
  ];

  const quickLinks = [
    { href: "/admin/orders", icon: ShoppingBag, label: "Orders", count: pendingOrders },
    { href: "/admin/games", icon: Gamepad2, label: "Games", count: gameCount },
    { href: "/admin/products", icon: Gem, label: "Products", count: productCount },
    { href: "/admin/customers", icon: Users, label: "Customers", count: null },
    { href: "/admin/banners", icon: ImageIcon, label: "Banners", count: null },
    { href: "/admin/settings", icon: Settings, label: "Settings", count: null },
  ];

  return (
    <div className="space-y-8">
      {/* Stats Grid - New Card Design */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((s) => (
          <div
            key={s.label}
            className="group relative overflow-hidden nexus-card p-6 transition-all duration-300 hover:border-[var(--nexus-primary)]/40 hover:-translate-y-1"
          >
            {/* Gradient Background */}
            <div className={`absolute inset-0 bg-gradient-to-br ${s.bgGradient} opacity-60 pointer-events-none rounded-2xl`} />

            <div className="relative">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm font-medium text-[var(--nexus-text-secondary)]">{s.label}</div>
                <div 
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br shadow-lg"
                  style={{ backgroundImage: `linear-gradient(135deg, ${s.color}20 0%, ${s.color}40 100%)` }}
                >
                  <s.Icon className="h-5 w-5" style={{ color: s.color }} strokeWidth={2} />
                </div>
              </div>

              {/* Value */}
              <div className="text-3xl font-display font-black mb-2" style={{ color: s.color }}>
                {s.value}
              </div>

              {/* Trend */}
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full ${
                  s.trend === "up" 
                    ? "bg-[var(--nexus-success)]/10 text-[var(--nexus-success)]" 
                    : "bg-[var(--nexus-error)]/10 text-[var(--nexus-error)]"
                }`}>
                  {s.trend === "up" ? "↑" : "↓"} {s.change}
                </span>
                <span className="text-xs text-[var(--nexus-text-muted)]">vs last month</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid lg:grid-cols-3 gap-8">
        {/* Revenue Chart Card */}
        <div className="lg:col-span-2 nexus-card overflow-hidden">
          <div className="p-6 border-b border-[var(--nexus-border)] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[var(--nexus-primary)]/20 to-[var(--nexus-accent)]/20 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-[var(--nexus-primary)]" strokeWidth={2} />
              </div>
              <div>
                <h2 className="font-semibold text-lg">Revenue Overview</h2>
                <p className="text-sm text-[var(--nexus-text-muted)]">Last 30 days performance</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-display font-black text-[var(--nexus-primary)]">
                ${last30Total.toFixed(2)}
              </div>
              <div className="text-xs text-[var(--nexus-text-muted)]">Total revenue</div>
            </div>
          </div>
          <div className="p-6">
            {/* Placeholder for chart - replace with actual chart component */}
            <div className="h-64 flex items-center justify-center bg-[var(--nexus-bg)]/50 rounded-xl border border-[var(--nexus-border)]">
              <div className="text-center">
                <Activity className="h-12 w-12 text-[var(--nexus-text-muted)]/30 mx-auto mb-3" />
                <p className="text-sm text-[var(--nexus-text-muted)]">Revenue chart placeholder</p>
                <p className="text-xs text-[var(--nexus-text-muted)]/60">Integrate Recharts or Chart.js here</p>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Links Card */}
        <div className="nexus-card overflow-hidden">
          <div className="p-6 border-b border-[var(--nexus-border)]">
            <h2 className="font-semibold text-lg">Quick Actions</h2>
            <p className="text-sm text-[var(--nexus-text-muted)]">Frequently used features</p>
          </div>
          <div className="p-6 grid grid-cols-2 gap-4">
            {quickLinks.map((q) => (
              <Link
                key={q.href}
                href={q.href}
                className="group nexus-card-hover p-4 text-center transition-all"
              >
                <div className="h-12 w-12 mx-auto mb-3 rounded-xl bg-gradient-to-br from-[var(--nexus-primary)]/20 to-[var(--nexus-accent)]/20 flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                  <q.icon className="h-6 w-6 text-[var(--nexus-primary)]" />
                </div>
                <div className="text-sm font-semibold mb-1">{q.label}</div>
                {q.count !== null && (
                  <div className="text-xs text-[var(--nexus-text-muted)]">{q.count.toLocaleString()}</div>
                )}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Orders Table - New Design */}
      <div className="nexus-card overflow-hidden">
        <div className="p-6 border-b border-[var(--nexus-border)] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[var(--nexus-accent)]/20 to-[var(--nexus-primary)]/20 flex items-center justify-center">
              <ShoppingBag className="h-5 w-5 text-[var(--nexus-accent)]" strokeWidth={2} />
            </div>
            <div>
              <h2 className="font-semibold text-lg">Recent Orders</h2>
              <p className="text-sm text-[var(--nexus-text-muted)]">Latest transactions</p>
            </div>
          </div>
          <Link href="/admin/orders" className="nexus-btn-primary text-sm px-4 py-2">
            View All Orders
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[var(--nexus-bg)] text-[var(--nexus-text-secondary)] text-[10px] uppercase tracking-wider">
              <tr>
                <th className="text-left px-6 py-4 font-semibold">Order #</th>
                <th className="text-left px-6 py-4 font-semibold">Game</th>
                <th className="text-left px-6 py-4 font-semibold hidden md:table-cell">Product</th>
                <th className="text-left px-6 py-4 font-semibold hidden lg:table-cell">UID</th>
                <th className="text-right px-6 py-4 font-semibold">Amount</th>
                <th className="text-left px-6 py-4 font-semibold">Status</th>
                <th className="text-left px-6 py-4 font-semibold hidden md:table-cell">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--nexus-border)]">
              {recentOrders.map((o: any) => (
                <tr key={o.id} className="hover:bg-[var(--nexus-surface)]/50 transition-colors">
                  <td className="px-6 py-4">
                    <Link 
                      href={`/admin/orders/${o.orderNumber}`} 
                      className="font-mono text-[var(--nexus-accent)] hover:underline text-xs font-semibold"
                    >
                      {o.orderNumber}
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-sm font-medium">{o.game.name}</td>
                  <td className="px-6 py-4 text-[var(--nexus-text-secondary)] text-sm hidden md:table-cell">{o.product.name}</td>
                  <td className="px-6 py-4 font-mono text-xs hidden lg:table-cell">{o.playerUid}</td>
                  <td className="px-6 py-4 text-right font-mono text-sm font-semibold">${o.amountUsd.toFixed(2)}</td>
                  <td className="px-6 py-4">
                    <StatusPill status={o.status} />
                  </td>
                  <td className="px-6 py-4 text-[var(--nexus-text-muted)] text-xs hidden md:table-cell">
                    {new Date(o.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
              {recentOrders.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center">
                    <Package className="h-12 w-12 text-[var(--nexus-text-muted)]/30 mx-auto mb-4" />
                    <p className="text-[var(--nexus-text-secondary)] mb-1">No orders yet</p>
                    <p className="text-xs text-[var(--nexus-text-muted)]/60">Orders will appear here once customers start purchasing.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const colors: Record<string, string> = {
    PENDING: "bg-[var(--nexus-warning)]/10 text-[var(--nexus-warning)] border-[var(--nexus-warning)]/30",
    PAID: "bg-[var(--nexus-info)]/10 text-[var(--nexus-info)] border-[var(--nexus-info)]/30",
    PROCESSING: "bg-[var(--nexus-info)]/10 text-[var(--nexus-info)] border-[var(--nexus-info)]/30",
    DELIVERED: "bg-[var(--nexus-success)]/10 text-[var(--nexus-success)] border-[var(--nexus-success)]/30",
    FAILED: "bg-[var(--nexus-error)]/10 text-[var(--nexus-error)] border-[var(--nexus-error)]/30",
    REFUNDED: "bg-[var(--nexus-text-muted)]/10 text-[var(--nexus-text-muted)] border-[var(--nexus-border)]",
    CANCELLED: "bg-[var(--nexus-text-muted)]/10 text-[var(--nexus-text-muted)] border-[var(--nexus-border)]",
  };
  return (
    <span className={`inline-block rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-wider ${colors[status] || ""}`}>
      {status}
    </span>
  );
}
