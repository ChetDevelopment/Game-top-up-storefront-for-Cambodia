import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const bundles = await prisma.bundle.findMany({
    where: { 
      active: true,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } }
      ]
    },
    orderBy: { createdAt: "desc" }
  });

  return NextResponse.json(bundles);
}