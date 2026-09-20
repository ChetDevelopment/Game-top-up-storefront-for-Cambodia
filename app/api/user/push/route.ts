import { NextRequest, NextResponse } from "next/server";
import { guardUserApi } from "@/lib/api-security";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const pushSchema = z.object({
  subscription: z.object({
    endpoint: z.string(),
    keys: z.object({
      p256dh: z.string(),
      auth: z.string(),
    }),
  }),
});

export async function GET(req: NextRequest) {
  const security = await guardUserApi(req);
  if ("response" in security) return security.response;

  const user = await prisma.user.findUnique({
    where: { id: security.user.userId },
    select: { pushSubscription: true },
  });

  return NextResponse.json({
    subscription: user?.pushSubscription ? JSON.parse(user.pushSubscription) : null,
  });
}

export async function POST(req: NextRequest) {
  const security = await guardUserApi(req);
  if ("response" in security) return security.response;

  const body = await req.json().catch(() => ({}));
  const parsed = pushSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: security.user.userId },
    data: { pushSubscription: JSON.stringify(parsed.data.subscription) },
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const security = await guardUserApi(req);
  if ("response" in security) return security.response;

  await prisma.user.update({
    where: { id: security.user.userId },
    data: { pushSubscription: null },
  });

  return NextResponse.json({ success: true });
}
