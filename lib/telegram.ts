import { prisma } from "./prisma";
import { decryptField } from "./encryption";

function readSecret(value: string | null | undefined): string {
  return decryptField(value) ?? value ?? "";
}

/**
 * Send a Telegram message using the bot token + chat id stored in Settings
 * (falls back to env vars). Safe to call from any server code — never throws.
 */
export async function notifyTelegram(text: string): Promise<boolean> {
  try {
    const settings = await prisma.settings
      .findUnique({ where: { id: 1 } })
      .catch(() => null);

    const token =
      readSecret(settings?.telegramBotToken) ||
      process.env.TELEGRAM_BOT_TOKEN ||
      "";
    const chatId =
      readSecret(settings?.telegramChatId) ||
      process.env.TELEGRAM_CHAT_ID ||
      "";

    if (!token || !chatId) return false;

    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      cache: "no-store",
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn("[telegram] send failed:", res.status, body.slice(0, 200));
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[telegram] error:", err);
    return false;
  }
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
