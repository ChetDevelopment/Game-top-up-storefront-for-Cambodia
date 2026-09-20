import { prisma } from "@/lib/prisma";
import { History, FileText } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AuditLogsPage() {
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div className="p-4 sm:p-8">
      <div className="flex items-center gap-3 mb-2">
        <History className="h-6 w-6 text-royal-primary" />
        <h1 className="font-display text-2xl sm:text-3xl font-bold">Audit Log</h1>
      </div>
      <p className="text-royal-muted text-sm mb-6">Every admin action in the last 200 events.</p>

      {logs.length === 0 ? (
        <div className="card p-16 text-center">
          <FileText className="h-10 w-10 text-royal-muted/30 mx-auto mb-3" />
          <p className="text-royal-muted text-sm">No events yet.</p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-royal-muted border-b border-royal-border">
              <tr>
                <th className="py-3 px-4">When</th>
                <th className="py-3 px-4">Admin</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Target</th>
                <th className="py-3 px-4">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-royal-border/60">
              {logs.map((l: any) => (
                <tr key={l.id} className="hover:bg-royal-surface/40">
                  <td className="py-2 px-4 text-royal-muted whitespace-nowrap">{new Date(l.createdAt).toLocaleString()}</td>
                  <td className="py-2 px-4">{l.adminEmail || "—"}</td>
                  <td className="py-2 px-4 font-mono text-xs text-royal-accent">{l.action}</td>
                  <td className="py-2 px-4 text-xs">
                    {l.targetType && <span className="text-royal-muted">{l.targetType}</span>}
                    {l.targetId && <span className="font-mono text-royal-muted/70 ml-1">{l.targetId.slice(-8)}</span>}
                  </td>
                  <td className="py-2 px-4 text-xs text-royal-muted max-w-sm truncate" title={l.details ?? undefined}>
                    {l.details}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

