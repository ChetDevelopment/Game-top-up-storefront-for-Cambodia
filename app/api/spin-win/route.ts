import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const PRIZES = [
  { prize: "50_points", prizeValue: 50, weight: 40 },
  { prize: "100_points", prizeValue: 100, weight: 30 },
  { prize: "200_points", prizeValue: 200, weight: 20 },
  { prize: "$5_discount", prizeValue: 500, weight: 8 },
  { prize: "free_diamond", prizeValue: 1000, weight: 2 },
];

function getRandomPrize() {
  const total = PRIZES.reduce((sum, p) => sum + p.weight, 0);
  let rand = Math.random() * total;
  
  for (const p of PRIZES) {
    rand -= p.weight;
    if (rand <= 0) return p;
  }
  return PRIZES[0];
}

export async function GET() {
  const session = await getCurrentUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const existingSpin = await prisma.spinWin.findFirst({
    where: {
      userId: session.userId,
      createdAt: { gte: today }
    }
  });

  if (existingSpin) {
    return NextResponse.json({ 
      spun: true, 
      prize: existingSpin.prize, 
      claimed: existingSpin.claimed 
    });
  }

  return NextResponse.json({ spun: false });
}

export async function POST(req: NextRequest) {
  const session = await getCurrentUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const existingSpin = await prisma.spinWin.findFirst({
    where: {
      userId: session.userId,
      createdAt: { gte: today }
    }
  });

  if (existingSpin) {
    return NextResponse.json({ error: "Already spun today" }, { status: 400 });
  }

  const winningPrize = getRandomPrize();

  const spin = await prisma.spinWin.create({
    data: {
      userId: session.userId,
      prize: winningPrize.prize,
      prizeValue: winningPrize.prizeValue,
      won: true,
    }
  });

  return NextResponse.json({ 
    ok: true, 
    prize: winningPrize.prize, 
    prizeValue: winningPrize.prizeValue,
    spinId: spin.id
  });
}

export async function PATCH(req: NextRequest) {
  const session = await getCurrentUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { spinId } = body;

  if (!spinId) {
    return NextResponse.json({ error: "Spin ID required" }, { status: 400 });
  }

  const spin = await prisma.spinWin.findUnique({
    where: { id: spinId }
  });

  if (!spin || spin.userId !== session.userId || spin.claimed) {
    return NextResponse.json({ error: "Invalid spin" }, { status: 400 });
  }

  if (spin.prize.includes("_points")) {
    const points = spin.prizeValue;
    await prisma.user.update({
      where: { id: session.userId },
      data: { pointsBalance: { increment: points } }
    });
    await prisma.pointTransaction.create({
      data: {
        userId: session.userId,
        amount: points,
        type: "SPIN_WIN",
      }
    });
  }

  await prisma.spinWin.update({
    where: { id: spinId },
    data: { claimed: true }
  });

  return NextResponse.json({ ok: true });
}