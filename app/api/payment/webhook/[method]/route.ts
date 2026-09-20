import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  return NextResponse.json({ error: "Use /api/payment/webhook/bakong" }, { status: 410 });
}