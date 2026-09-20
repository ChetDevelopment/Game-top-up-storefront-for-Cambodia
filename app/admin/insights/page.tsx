"use client";

import { useEffect, useState } from "react";
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  Package, 
  Clock, 
  Gamepad2,
  ChevronRight,
  DollarSign
} from "lucide-react";

export default function InsightsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/stats/revenue?days=${days}`)
      .then(r => r.json())
      .then(d => {
        setData(d);
        setLoading(false);
      });
  }, [days]);

  if (loading) return <div className="p-8 text-royal-muted">Analyzing data...</div>;

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold">Insights</h1>
        <p className="text-royal-muted">Deep analytics for your business.</p>
      </div>

      <div className="flex gap-2">
        {[7, 30, 90].map(d => (
          <button 
            key={d}
            onClick={() => setDays(d)}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${days === d ? "bg-royal-primary text-black" : "bg-royal-surface text-royal-muted hover:text-royal-text"}`}
          >
            Last {d} Days
          </button>
        ))}
      </div>

      {/* Hero Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card p-6 bg-gradient-to-br from-royal-primary/10 to-transparent border-royal-primary/20">
          <div className="flex justify-between items-start mb-4">
            <div className="h-10 w-10 rounded-xl bg-royal-primary/20 flex items-center justify-center text-royal-primary">
              <DollarSign className="h-6 w-6" />
            </div>
            <span className="text-[10px] font-black tracking-widest text-royal-primary uppercase">Revenue</span>
          </div>
          <div className="text-3xl font-black text-royal-text">${data.totalRevenue.toLocaleString()}</div>
          <div className="text-xs text-royal-muted mt-1">Total revenue in last {days} days</div>
        </div>

        <div className="card p-6">
          <div className="flex justify-between items-start mb-4">
            <div className="h-10 w-10 rounded-xl bg-royal-accent/20 flex items-center justify-center text-royal-accent">
              <Package className="h-6 w-6" />
            </div>
            <span className="text-[10px] font-black tracking-widest text-royal-accent uppercase">Orders</span>
          </div>
          <div className="text-3xl font-black text-royal-text">{data.totalOrders.toLocaleString()}</div>
          <div className="text-xs text-royal-muted mt-1">Total paid orders in last {days} days</div>
        </div>

        <div className="card p-6">
          <div className="flex justify-between items-start mb-4">
            <div className="h-10 w-10 rounded-xl bg-purple-500/20 flex items-center justify-center text-purple-400">
              <TrendingUp className="h-6 w-6" />
            </div>
            <span className="text-[10px] font-black tracking-widest text-purple-400 uppercase">Avg. Order</span>
          </div>
          <div className="text-3xl font-black text-royal-text">
            ${data.totalOrders > 0 ? (data.totalRevenue / data.totalOrders).toFixed(2) : "0.00"}
          </div>
          <div className="text-xs text-royal-muted mt-1">Average order value</div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Top Products */}
        <div className="card p-6">
          <h3 className="font-bold mb-6 flex items-center gap-2">
            <Package className="h-5 w-5 text-royal-primary" />
            Top Products by Revenue
          </h3>
          <div className="space-y-4">
            {data.topProducts.map((p: any, i: number) => (
              <div key={i} className="flex items-center gap-4">
                <div className="w-8 text-xl font-black text-royal-muted/20">{i + 1}</div>
                <div className="flex-1">
                  <div className="font-bold text-sm">{p.name}</div>
                  <div className="text-[10px] text-royal-muted uppercase">{p.game}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono font-bold text-royal-primary">${p.revenue.toLocaleString()}</div>
                  <div className="text-[10px] text-royal-muted">{p.count} sales</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Daily Performance */}
        <div className="card p-6">
          <h3 className="font-bold mb-6 flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-royal-primary" />
            Daily Revenue Trend
          </h3>
          <div className="flex items-end gap-1 h-48 border-b border-l border-royal-border p-2">
            {data.daily.map((b: any, i: number) => {
              const max = Math.max(...data.daily.map((x: any) => x.revenue), 1);
              const height = (b.revenue / max) * 100;
              return (
                <div 
                  key={i} 
                  className="flex-1 bg-royal-primary/40 hover:bg-royal-primary transition-all rounded-t-sm relative group"
                  style={{ height: `${height}%` }}
                >
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-royal-surface border border-royal-border px-2 py-1 rounded text-[10px] font-mono whitespace-nowrap opacity-0 group-hover:opacity-100 z-10">
                    {b.date}: ${b.revenue}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex justify-between mt-2 text-[10px] text-royal-muted uppercase font-black">
            <span>{data.daily[0]?.date}</span>
            <span>{data.daily[data.daily.length - 1]?.date}</span>
          </div>
        </div>
      </div>

      {/* Advanced Stats */}
      <div className="grid lg:grid-cols-2 gap-8">
        {/* Hourly Distribution */}
        <div className="card p-6">
          <h3 className="font-bold mb-6 flex items-center gap-2">
            <Clock className="h-5 w-5 text-royal-primary" />
            Orders by Hour (GMT+7)
          </h3>
          <div className="flex items-end gap-1 h-32 p-2">
            {data.hourly.map((count: number, i: number) => {
              const max = Math.max(...data.hourly, 1);
              const height = (count / max) * 100;
              return (
                <div 
                  key={i} 
                  className={`flex-1 transition-all rounded-t-sm relative group ${height > 70 ? "bg-royal-primary" : "bg-royal-primary/20"}`}
                  style={{ height: `${height}%` }}
                >
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-royal-surface border border-royal-border px-2 py-1 rounded text-[10px] font-mono whitespace-nowrap opacity-0 group-hover:opacity-100 z-10">
                    {i}:00 - {count} orders
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex justify-between mt-2 text-[8px] text-royal-muted font-black">
            <span>00:00</span>
            <span>06:00</span>
            <span>12:00</span>
            <span>18:00</span>
            <span>23:00</span>
          </div>
        </div>

        {/* Customer Retention */}
        <div className="card p-6 bg-gradient-to-br from-indigo-500/5 to-transparent">
          <h3 className="font-bold mb-4 flex items-center gap-2">
            <Users className="h-5 w-5 text-indigo-400" />
            Customer Retention
          </h3>
          
          <div className="flex items-center gap-8 h-32">
             <div className="relative h-24 w-24 shrink-0">
                <svg className="h-full w-full" viewBox="0 0 36 36">
                  <path className="text-royal-border" strokeDasharray="100, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" strokeWidth="3" />
                  <path className="text-indigo-400" strokeDasharray={`${data.retention.rate}, 100`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" strokeWidth="3" strokeLinecap="round" />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                   <span className="text-xl font-black text-royal-text">{data.retention.rate}%</span>
                   <span className="text-[7px] font-black uppercase text-royal-muted">Loyalty</span>
                </div>
             </div>
             
             <div className="space-y-3 flex-1">
                <div>
                   <div className="text-[10px] font-black uppercase text-royal-muted tracking-widest mb-1 text-indigo-400">Returning Savages</div>
                   <div className="text-2xl font-black">{data.retention.returningUsers}</div>
                   <p className="text-[10px] text-royal-muted leading-tight">Players who topped up more than once.</p>
                </div>
                <div className="pt-2 border-t border-royal-border/50">
                   <div className="text-[10px] font-black uppercase text-royal-muted tracking-widest mb-1">Total Unique Players</div>
                   <div className="text-xl font-bold">{data.retention.uniqueUsers}</div>
                </div>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
