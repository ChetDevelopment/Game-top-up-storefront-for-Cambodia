import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";

import { guardAdminApi } from "@/lib/api-security";
import { encryptToken, decryptToken, encryptField, decryptField } from "@/lib/encryption";
import { z } from "zod";

const settingsSchema = z.object({
  siteName: z.string().min(1).optional(),
  exchangeRate: z.number().positive().optional(),
  supportTelegram: z.string().optional(),
  supportEmail: z.string().optional(),
  maintenanceMode: z.boolean().optional(),
  maintenanceMessage: z.string().nullable().optional(),
  announcement: z.string().nullable().optional(),
  announcementTone: z.enum(["info", "warning", "promo"]).nullable().optional(),
  popupActive: z.boolean().optional(),
  popupTitle: z.string().nullable().optional(),
  popupContent: z.string().nullable().optional(),
  popupImageUrl: z.string().nullable().optional(),
  telegramBotToken: z.string().nullable().optional(),
  telegramChatId: z.string().nullable().optional(),
  // New fields for balance monitoring - plain text (no encryption needed)
  gameDropToken: z.string().nullable().optional(),
  g2bulkToken: z.string().nullable().optional(),
  systemMode: z.enum(["AUTO", "FORCE_OPEN", "FORCE_CLOSE"]).optional(),
  warningThreshold: z.number().positive().optional(),
  criticalThreshold: z.number().positive().optional(),
  balanceCheckInterval: z.number().int().min(1).max(60).optional(),
  alertCooldownMinutes: z.number().int().min(1).max(60).optional(),
});

function serializeSettings<T extends {
  telegramBotToken?: string | null;
  telegramChatId?: string | null;
  gameDropToken?: string | null;
  g2bulkToken?: string | null;
}>(settings: T) {
  let gameDropToken: string | null = null;
  if (settings.gameDropToken) {
    try {
      gameDropToken = decryptToken(settings.gameDropToken);
    } catch {
      try {
        const legacy = decryptField(settings.gameDropToken);
        gameDropToken = legacy || settings.gameDropToken;
      } catch {
        gameDropToken = settings.gameDropToken;
      }
    }
  }

  let g2bulkToken: string | null = null;
  if (settings.g2bulkToken) {
    try {
      g2bulkToken = decryptToken(settings.g2bulkToken);
    } catch {
      try {
        const legacy = decryptField(settings.g2bulkToken);
        g2bulkToken = legacy || settings.g2bulkToken;
      } catch {
        g2bulkToken = settings.g2bulkToken;
      }
    }
  }

  return {
    ...settings,
    telegramBotToken: decryptField(settings.telegramBotToken),
    telegramChatId: decryptField(settings.telegramChatId),
    gameDropToken,
    g2bulkToken,
  };
}

export async function GET(req: NextRequest) {
  const security = await guardAdminApi(req);
  if ("response" in security) return security.response;

  const settings = await prisma.settings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });

  return NextResponse.json(serializeSettings(settings));
}

export async function PATCH(req: NextRequest) {
  const security = await guardAdminApi(req);
  if ("response" in security) return security.response;

  const body = await req.json().catch(() => ({}));
  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid" }, { status: 400 });
  }

  const updateData = {
    ...parsed.data,
    ...("telegramBotToken" in parsed.data
      ? { telegramBotToken: encryptField(parsed.data.telegramBotToken) }
      : {}),
    ...("telegramChatId" in parsed.data
      ? { telegramChatId: encryptField(parsed.data.telegramChatId) }
      : {}),
    ...("gameDropToken" in parsed.data && parsed.data.gameDropToken
      ? { gameDropToken: encryptToken(parsed.data.gameDropToken) }
      : {}),
    ...("g2bulkToken" in parsed.data && parsed.data.g2bulkToken
      ? { g2bulkToken: encryptToken(parsed.data.g2bulkToken) }
      : {}),
  };

  const settings = await prisma.settings.upsert({
    where: { id: 1 },
    update: updateData,
    create: { id: 1, ...updateData },
  });

  return NextResponse.json(serializeSettings(settings));
}

