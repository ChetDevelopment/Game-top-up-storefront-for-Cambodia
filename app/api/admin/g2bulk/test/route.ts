import { NextRequest, NextResponse } from "next/server";
import { guardAdminApi } from "@/lib/api-security";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const security = await guardAdminApi(req);
  if ("response" in security) return security.response;

  try {
    const settings = await prisma.settings.findUnique({ where: { id: 1 } });
    const token = settings?.g2bulkToken;

    if (!token) {
      return NextResponse.json({ success: false, error: "G2Bulk token not configured" });
    }

    const res = await fetch("https://api.g2bulk.com/v1/getMe", {
      headers: { "X-API-Key": token },
      cache: "no-store",
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => "Unknown error");
      console.error("[g2bulk-test] API error:", res.status, errorText);
      return NextResponse.json({ 
        success: false, 
        error: `API error: ${res.status}`,
        details: errorText 
      });
    }

    const data = await res.json();
    console.log("[g2bulk-test] Response:", data);

    if (!data.success) {
      return NextResponse.json({ success: false, error: "Failed to connect to G2Bulk", details: data });
    }

    // Update balance in settings
    try {
      await prisma.settings.update({
        where: { id: 1 },
        data: {
          currentBalance: typeof data.balance === 'number' ? data.balance : 0,
          lastBalanceCheck: new Date(),
          g2bulkPartnerId: typeof data.user_id === 'number' ? data.user_id : null,
        },
      });
    } catch (dbErr: any) {
      console.error("[g2bulk-test] Database update failed:", dbErr.message);
      // Don't fail the test if DB update fails - just log it
    }

    return NextResponse.json({
      success: true,
      balance: data.balance,
      userId: data.user_id,
      username: data.username,
    });
  } catch (err: any) {
    console.error("[g2bulk-test] Error:", err);
    return NextResponse.json({ success: false, error: err.message });
  }
}
