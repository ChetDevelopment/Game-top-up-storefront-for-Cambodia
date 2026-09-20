import { NextRequest } from "next/server";

interface SecurityLog {
  timestamp: string;
  type: "SECURITY" | "AUDIT" | "ERROR" | "ACCESS";
  event: string;
  ip: string;
  userAgent: string;
  path: string;
  details?: any;
}

const logs: SecurityLog[] = [];
const MAX_LOGS = 1000;

export function logSecurityEvent(
  type: SecurityLog["type"],
  event: string,
  req: NextRequest,
  details?: any
) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const userAgent = req.headers.get("user-agent") || "unknown";
  
  const logEntry: SecurityLog = {
    timestamp: new Date().toISOString(),
    type,
    event,
    ip,
    userAgent: userAgent.slice(0, 200), // Truncate to prevent log injection
    path: req.nextUrl.pathname,
    details,
  };
  
  logs.unshift(logEntry); // Add to beginning for recent-first order
  
  // Keep only recent logs
  if (logs.length > MAX_LOGS) {
    logs.length = MAX_LOGS;
  }
  
  // Console output for immediate visibility
  const emoji = type === "SECURITY" ? "🚨" : type === "AUDIT" ? "📝" : type === "ERROR" ? "❌" : "ℹ️";
  console.log(
    `${emoji} [${type}] ${logEntry.timestamp} | ${event} | IP: ${ip} | Path: ${logEntry.path}`
  );
  
  if (details) {
    console.log(`   Details:`, JSON.stringify(details).slice(0, 500));
  }
}

export function getSecurityLogs(count: number = 50): SecurityLog[] {
  return logs.slice(0, count);
}

export function getSecurityStats() {
  const last24h = Date.now() - 24 * 60 * 60 * 1000;
  
  const recentLogs = logs.filter(log => 
    new Date(log.timestamp).getTime() > last24h
  );
  
  return {
    total: logs.length,
    last24h: recentLogs.length,
    byType: {
      SECURITY: recentLogs.filter(l => l.type === "SECURITY").length,
      AUDIT: recentLogs.filter(l => l.type === "AUDIT").length,
      ERROR: recentLogs.filter(l => l.type === "ERROR").length,
      ACCESS: recentLogs.filter(l => l.type === "ACCESS").length,
    },
    topIPs: getTopIPs(recentLogs, 5),
  };
}

function getTopIPs(logs: SecurityLog[], count: number): Array<{ip: string, count: number}> {
  const ipCounts: Record<string, number> = {};
  logs.forEach(log => {
    ipCounts[log.ip] = (ipCounts[log.ip] || 0) + 1;
  });
  
  return Object.entries(ipCounts)
    .map(([ip, count]) => ({ ip, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, count);
}

// Cleanup old logs every hour
setInterval(() => {
  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const initialLength = logs.length;
  // In a real app, you'd persist logs to a database
  // This is just for runtime monitoring
}, 60 * 60 * 1000);
