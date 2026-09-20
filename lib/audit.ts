import { prisma } from "./prisma";
import { getCurrentAdmin } from "./auth";

export interface AuditEntry {
  action: string;
  targetType?: string;
  targetId?: string;
  details?: string | Record<string, unknown>;
}

/**
 * Write an audit log entry. Resolves the current admin automatically.
 * Silently ignores failures so audit never blocks a real operation.
 */
export async function writeAudit(entry: AuditEntry): Promise<void> {
  try {
    const admin = await getCurrentAdmin().catch(() => null);
    const detailsString =
      entry.details == null
        ? null
        : typeof entry.details === "string"
        ? entry.details.slice(0, 4000)
        : JSON.stringify(entry.details).slice(0, 4000);
    await prisma.auditLog.create({
      data: {
        adminEmail: admin?.email ?? null,
        action: entry.action,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        details: detailsString,
      },
    });
  } catch (err) {
    console.warn("[audit] write failed:", err);
  }
}
