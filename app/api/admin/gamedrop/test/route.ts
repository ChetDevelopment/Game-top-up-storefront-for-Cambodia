import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { guardAdminApi } from "@/lib/api-security";
import { checkGameDropBalance } from "@/lib/gamedrop";

export async function POST(req: NextRequest) {
  const security = await guardAdminApi(req);
  if ("response" in security) return security.response;

  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  if (!settings?.gameDropToken) {
    return NextResponse.json({ error: "No GameDrop token set" }, { status: 400 });
  }

  try {
    const data = await checkGameDropBalance(settings.gameDropToken);
    
    // Update balance in settings
    try {
      await prisma.settings.update({
        where: { id: 1 },
        data: {
          currentBalance: typeof data.balance === 'number' ? data.balance : 0,
          lastBalanceCheck: new Date(),
          gameDropPartnerId: typeof data.partnerId === 'number' ? data.partnerId : null,
        },
      });
    } catch (dbErr: any) {
      console.error("[gamedrop-test] Database update failed:", dbErr.message);
      // Don't fail the test if DB update fails - just log it
    }
    
    return NextResponse.json({ 
      success: true, 
      balance: data.balance,
      partnerId: data.partnerId,
      isPostpaid: data.isPostpaid,
    });
  } catch (err: any) {
    console.error("[gamedrop-test] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
