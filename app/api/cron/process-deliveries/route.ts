export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { processDeliveryQueue } from "@/lib/payment";
import { runReconciliation } from "@/lib/reconciler";

/**
 * POST /api/cron/process-deliveries
 * 
 * RECOVERY-ONLY background worker.
 * Not the primary payment or delivery path.
 * 
 * PURPOSES:
 * 1. Process pending delivery jobs with safe retry logic
 * 2. Reconcile UNKNOWN_EXTERNAL_STATE entries via provider APIs
 * 3. Escalate unresolvable cases to manual review queue
 * 
 * SECURITY: Protected by CRON_SECRET env var
 * SAFETY: Uses execution lock to prevent overlapping runs
 * 
 * Called by Vercel Cron every 5 minutes.
 */

// Simple in-memory lock for single-instance deployments
let isRunning = false;
let lastRunTime = 0;
const LOCK_TIMEOUT_MS = 300000; // 5 minutes

export async function POST(req: NextRequest) {
  // Auth check — support multiple auth methods:
  // 1. Vercel's built-in cron header (x-vercel-cron) — proves request from Vercel cron system
  // 2. Authorization: Bearer <CRON_SECRET> header — for manual triggers
  // 3. ?token=<CRON_SECRET> query param — fallback
  const cronSecret = process.env.CRON_SECRET;
  const isVercelCron = req.headers.get("x-vercel-cron") === "1";
  
  if (cronSecret && !isVercelCron) {
    const authHeader = req.headers.get("authorization");
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const queryToken = req.nextUrl.searchParams.get("token");

    if (bearerToken !== cronSecret && queryToken !== cronSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // Prevent overlapping runs
  const now = Date.now();
  if (isRunning && (now - lastRunTime) < LOCK_TIMEOUT_MS) {
    return NextResponse.json({
      success: false,
      reason: "Another instance is running",
      skipped: true,
    });
  }

  isRunning = true;
  lastRunTime = now;

  try {
    const results: Record<string, unknown> = {};

    // 1. Process pending delivery jobs (safe retry logic)
    const deliveryResults = await processDeliveryQueue(20);
    results.delivery = deliveryResults;

    // 2. Reconcile unknown/ambiguous states
    const reconcileResults = await runReconciliation();
    results.reconciliation = reconcileResults;

    return NextResponse.json({
      success: true,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[cron] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }, { status: 500 });
  } finally {
    isRunning = false;
  }
}

// Health check
export async function GET() {
  return NextResponse.json({
    status: "ok",
    endpoint: "/api/cron/process-deliveries",
    description: "Background delivery worker + reconciler (recovery only)",
    usage: "POST with Authorization: Bearer <CRON_SECRET> or ?token=<CRON_SECRET>",
  });
}
