"use client";

interface Point {
  date: string;
  revenue: number;
  count: number;
}

/**
 * Minimal SVG sparkline/bar chart — no chart library needed.
 */
export default function RevenueSparkline({ data }: { data: Point[] }) {
  if (data.length === 0) {
    return <div className="text-sm text-royal-muted">No data yet.</div>;
  }

  const width = 600;
  const height = 140;
  const padX = 8;
  const padY = 10;

  const max = Math.max(1, ...data.map((d) => d.revenue));
  const barW = (width - padX * 2) / data.length;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" preserveAspectRatio="none">
      <defs>
        <linearGradient id="rev-grad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#FF6B1A" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#FFB800" stopOpacity="0.2" />
        </linearGradient>
      </defs>
      {data.map((d, i) => {
        const h = d.revenue === 0 ? 0 : ((d.revenue / max) * (height - padY * 2));
        const x = padX + i * barW;
        const y = height - padY - h;
        return (
          <g key={d.date}>
            <rect
              x={x + 1}
              y={y}
              width={Math.max(1, barW - 2)}
              height={Math.max(0, h)}
              fill="url(#rev-grad)"
              rx={2}
            >
              <title>{`${d.date}: $${d.revenue.toFixed(2)} (${d.count} orders)`}</title>
            </rect>
          </g>
        );
      })}
    </svg>
  );
}

