import { NextRequest, NextResponse } from "next/server";
import { guardUserApi } from "@/lib/api-security";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const security = await guardUserApi(req);
  if ("response" in security) return security.response;

  const userId = security.user.userId;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const lastCheckin = await prisma.pointTransaction.findFirst({
    where: {
      userId,
      type: "DAILY_CHECKIN",
      createdAt: { gte: today },
    },
  });

  if (lastCheckin) {
    return NextResponse.json({ error: "Already checked in today!" }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.pointTransaction.create({
      data: {
        userId,
        amount: 5,
        type: "DAILY_CHECKIN",
      },
    }),
    prisma.user.update({
      where: { id: userId },
      data: {
        pointsBalance: { increment: 5 },
      },
    }),
  ]);

  return NextResponse.json({ ok: true, pointsAwarded: 5 });
}

export async function GET(req: NextRequest) {
  const security = await guardUserApi(req);
  if ("response" in security) return security.response;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const lastCheckin = await prisma.pointTransaction.findFirst({
    where: {
      userId: security.user.userId,
      type: "DAILY_CHECKIN",
      createdAt: { gte: today },
    },
  });

  return NextResponse.json({ checkedIn: !!lastCheckin });
}
