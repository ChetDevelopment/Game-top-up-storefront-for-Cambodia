/**
 * Background Worker System for Ty Khai TopUp
 * Handles: Payment reconciliation, expiration, delivery retry, fraud detection, balance monitoring
 * Uses: Node.js cron + Prisma (for single-server). 
 */

import { prisma } from "./prisma";
import { notifyTelegram } from "./telegram";
import { checkGameDropBalance } from "./gamedrop";
import { pauseSystem, resumeSystem, sendBalanceAlert } from "./system-control";

// ===================== Configuration =====================
const WORKER_CONFIG = {
  reconcileIntervalMs: 30 * 1000,      // Reconcile missed payments every 30 SECONDS
  deliveryRetryIntervalMs: 10 * 60 * 1000, // Retry failed deliveries every 10 min
  fraudCheckIntervalMs: 30 * 60 * 1000, // Run fraud checks every 30 min
  balanceCheckIntervalMs: 5 * 60 * 1000, // Check provider balance every 5 min
  reservationCleanupIntervalMs: 15 * 60 * 1000, // Cleanup expired reservations
  batchSize: 50,
  maxDeliveryAttempts: 3,
};

// ===================== Worker State =====================
let isRunning = false;
let intervals: NodeJS.Timeout[] = [];
let lastRunTimestamp: Record<string, number> = {};
const WORKER_TIMEOUT_MS = 60 * 1000; // 60 second timeout per job

// ===================== Main Worker Loop =====================
export async function startBackgroundWorker() {
  console.log("[worker] Starting background worker loop...");

  // Job 1: Reconcile Payments (missed webhooks + expiration)
  // This is the FINAL SOURCE OF TRUTH for payment status.
  const reconcileInterval = setInterval(async () => {
    const jobName = "reconcilePayments";
    const now = Date.now();
    
    if (isRunning) return;
    
    if (lastRunTimestamp[jobName] && (now - lastRunTimestamp[jobName]) > WORKER_TIMEOUT_MS) {
      console.warn(`[worker] ${jobName} timeout - force releasing lock`);
      isRunning = false;
    }
    
    lastRunTimestamp[jobName] = now;
    isRunning = true;
    
    try {
      const { reconcileMissedPayments } = await import("./payment");
      const results = await reconcileMissedPayments();
      if (results.recovered > 0 || results.expired > 0) {
        console.log(`[worker] Reconciliation: ${results.recovered} recovered, ${results.expired} expired, ${results.checked} checked`);
      }
    } catch (err) {
      console.error(`[worker] ${jobName} error:`, err);
    } finally {
      isRunning = false;
      delete lastRunTimestamp[jobName];
    }
  }, WORKER_CONFIG.reconcileIntervalMs);

  // Job 2: Retry Failed Deliveries
  const deliveryInterval = setInterval(async () => {
    try {
      const { processDeliveryQueue } = await import("./payment");
      const results = await processDeliveryQueue(WORKER_CONFIG.batchSize);
      if (results.processed > 0) {
        console.log(`[worker] Delivery queue: ${results.succeeded} succeeded, ${results.failed} failed, ${results.skipped} skipped`);
      }
    } catch (err) {
      console.error("[worker] Delivery retry error:", err);
    }
  }, WORKER_CONFIG.deliveryRetryIntervalMs);

  // Job 3: Fraud detection
  const fraudInterval = setInterval(async () => {
    try {
      await runFraudDetection();
    } catch (err) {
      console.error("[worker] Fraud detection error:", err);
    }
  }, WORKER_CONFIG.fraudCheckIntervalMs);

  // Job 4: Balance check
  const balanceInterval = setInterval(async () => {
    try {
      await runBalanceCheck();
    } catch (err) {
      console.error("[worker] Balance check error:", err);
    }
  }, WORKER_CONFIG.balanceCheckIntervalMs);

  // Job 5: Reservation cleanup
  const reservationInterval = setInterval(async () => {
    try {
      await expireReservations();
    } catch (err) {
      console.error("[worker] Reservation cleanup error:", err);
    }
  }, WORKER_CONFIG.reservationCleanupIntervalMs);

  intervals = [reconcileInterval, deliveryInterval, fraudInterval, balanceInterval, reservationInterval];
  console.log("[worker] All background jobs scheduled successfully");
}

export async function stopBackgroundWorker() {
  console.log("[worker] Stopping background worker...");
  intervals.forEach(clearInterval);
  intervals = [];
}

// ===================== Job 3: Fraud Detection =====================
async function runFraudDetection() {
  // Rule: High-frequency orders from same IP/email/UID
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  
  const recentOrders = await prisma.order.findMany({
    where: { createdAt: { gte: hourAgo } },
    select: { id: true, customerEmail: true, ipAddress: true, playerUid: true, amountUsd: true },
  });

  if (recentOrders.length < 5) return;

  const emailCounts = new Map<string, number>();
  const ipCounts = new Map<string, number>();
  const uidCounts = new Map<string, number>();

  for (const order of recentOrders) {
    if (order.customerEmail) emailCounts.set(order.customerEmail, (emailCounts.get(order.customerEmail) || 0) + 1);
    if (order.ipAddress) ipCounts.set(order.ipAddress, (ipCounts.get(order.ipAddress) || 0) + 1);
    uidCounts.set(order.playerUid, (uidCounts.get(order.playerUid) || 0) + 1);
  }

  // Thresholds
  for (const [email, count] of emailCounts) {
    if (count > 8) await flagFraud("HIGH_FREQUENCY_EMAIL", "HIGH", `Email ${email} has ${count} orders in 1hr`, { email, count });
  }
  for (const [ip, count] of ipCounts) {
    if (count > 12) await flagFraud("HIGH_FREQUENCY_IP", "HIGH", `IP ${ip} has ${count} orders in 1hr`, { ip, count });
  }
  for (const [uid, count] of uidCounts) {
    if (count > 5) await flagFraud("SAME_UID_MULTI", "MEDIUM", `UID ${uid} used in ${count} orders in 1hr`, { uid, count });
  }
}

async function flagFraud(type: string, severity: string, description: string, metadata: any) {
  // Avoid duplicate flags within 24h
  const exists = await prisma.fraudFlag.findFirst({
    where: { type, description, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }
  });
  if (exists) return;

  await prisma.fraudFlag.create({
    data: { type, severity, description, metadata: JSON.stringify(metadata) }
  });

  if (severity === "HIGH") {
    await notifyTelegram(`🚨 <b>Fraud Alert: ${type}</b>\n${description}`);
  }
}

// ===================== Job 4: Balance Check =====================
async function runBalanceCheck() {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  if (!settings || settings.systemMode === "FORCE_CLOSE") return;

  try {
    let balanceData: any = null;
    let source = "";

    if (settings.g2bulkToken) {
      const { checkG2BulkBalance } = await import("./g2bulk");
      balanceData = await checkG2BulkBalance(settings.g2bulkToken);
      source = "G2BULK";
    } else if (settings.gameDropToken) {
      balanceData = await checkGameDropBalance(settings.gameDropToken);
      source = "GAMEDROP";
    }

    if (!balanceData) return;

    const available = balanceData.balance - balanceData.draftBalance;

    await prisma.settings.update({
      where: { id: 1 },
      data: { currentBalance: balanceData.balance, lastBalanceCheck: new Date() }
    });

    await prisma.balanceLog.create({
      data: { balance: balanceData.balance, reserved: balanceData.draftBalance, available, source }
    });

    // Auto-pause if low balance
    if (settings.systemMode === "AUTO") {
      if (settings.criticalThreshold && available < settings.criticalThreshold) {
        await pauseSystem("LOW_BALANCE", available);
      } else if (settings.warningThreshold && available < settings.warningThreshold) {
        await sendBalanceAlert("WARNING", available, settings.warningThreshold);
      }
    }
  } catch (err) {
    console.error("[worker] Balance check failed:", err);
  }
}

// ===================== Job 5: Reservation Cleanup =====================
async function expireReservations() {
  const now = new Date();
  const expired = await prisma.walletReservation.findMany({
    where: { status: "ACTIVE", expiresAt: { lt: now } }
  });

  for (const res of expired) {
    await prisma.walletReservation.update({ where: { id: res.id }, data: { status: "EXPIRED" } });
    if (res.userId) {
       // Refund wallet balance
       await prisma.user.update({
         where: { id: res.userId },
         data: { walletBalance: { increment: res.amount } }
       });
    }
  }
}
