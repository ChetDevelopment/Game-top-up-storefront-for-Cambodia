import { prisma } from "@/lib/prisma";
import { notifyTelegram } from "./telegram";
import { encryptField } from "./encryption";

export type SystemStatus = "ACTIVE" | "PAUSED";
export type PauseReason = "LOW_BALANCE" | "MANUAL" | "API_ERROR";
export type SystemMode = "AUTO" | "FORCE_OPEN" | "FORCE_CLOSE";

export async function pauseSystem(reason: PauseReason, availableBalance?: number) {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  if (settings?.systemStatus === "PAUSED") return;

  await prisma.settings.update({
    where: { id: 1 },
    data: { systemStatus: "PAUSED", pauseReason: reason },
  });

  const msg = `⚠️ <b>System Paused</b>\nReason: ${reason}` +
    (availableBalance ? `\nAvailable Balance: $${availableBalance.toFixed(2)}` : "");
  await notifyTelegram(msg).catch(() => {});
}

export async function resumeSystem(reason: string) {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  if (settings?.systemStatus === "ACTIVE") return;

  await prisma.settings.update({
    where: { id: 1 },
    data: { systemStatus: "ACTIVE", pauseReason: null },
  });

  await notifyTelegram(`✅ <b>System Resumed</b>\nReason: ${reason}`).catch(() => {});
}

export async function sendBalanceAlert(
  level: "WARNING" | "CRITICAL",
  available: number,
  threshold: number,
  source: string = "API"
) {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  if (!settings) return;

  // Check cooldown
  if (settings.lastAlertSentAt) {
    const minsSince = (Date.now() - settings.lastAlertSentAt.getTime()) / 60000;
    if (minsSince < (settings.alertCooldownMinutes || 15)) return;
  }

  // Send Telegram alert
  const msg = `⚠️ <b>Balance Alert: ${level}</b>\n` +
    `Available: $${available.toFixed(2)}\n` +
    `Threshold: $${threshold.toFixed(2)}\n` +
    `Source: ${source}`;

  await notifyTelegram(msg).catch(() => {});

  await prisma.settings.update({
    where: { id: 1 },
    data: { lastAlertSentAt: new Date() },
  });
}
