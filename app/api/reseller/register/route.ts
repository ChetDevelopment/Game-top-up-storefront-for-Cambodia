import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { encryptField } from "@/lib/encryption";

const resellerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(100),
  phone: z.string().min(7).max(20),
  website: z.string().url().optional(),
  message: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const parsed = resellerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({
    where: { email: parsed.data.email }
  });

  if (existing) {
    if (existing.role === "RESELLER") {
      return NextResponse.json({ error: "You are already a reseller" }, { status: 400 });
    }
    await prisma.user.update({
      where: { id: existing.id },
      data: { role: "RESELLER_PENDING" }
    });
    return NextResponse.json({ success: true, message: "Application submitted!" });
  }

  return NextResponse.json({ error: "Please register an account first" }, { status: 400 });
}
