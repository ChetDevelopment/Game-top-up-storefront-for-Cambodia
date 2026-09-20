import { NextRequest, NextResponse } from "next/server";
import { guardUserApi } from "@/lib/api-security";
import { prisma } from "@/lib/prisma";
import { decryptField } from "@/lib/encryption";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const security = await guardUserApi(req);
  if ("response" in security) return security.response;

  const user = await prisma.user.findUnique({
    where: { id: security.user.userId },
    include: {
      referrer: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const referralCode = user.id.slice(-6).toUpperCase();
  // Always use production URL for referral links (they are shared externally)
  const baseUrl = "https://tykhai.vercel.app";
  const referralLink = `${baseUrl}/register?ref=${referralCode}`;

  const referredUsers = await prisma.user.findMany({
    where: { referredById: security.user.userId },
    select: {
      id: true,
      name: true,
      email: true,
      totalSpentUsd: true,
      referralEarnings: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  // Decrypt emails
  const decryptedReferredUsers = referredUsers.map(user => ({
    ...user,
    email: user.email ? (decryptField(user.email) || user.email) : user.email,
  }));

  const totalReferrals = referredUsers.length;
  const totalEarnings = referredUsers.reduce(
    (sum, referredUser) => sum + (referredUser.referralEarnings || 0),
    0
  );

  return NextResponse.json({
    referralCode,
    referralLink,
    totalReferrals,
    totalEarnings,
    referrals: decryptedReferredUsers,
  });
}
