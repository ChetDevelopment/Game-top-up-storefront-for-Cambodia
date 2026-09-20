import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/session
 * 
 * Returns current user session for client-side fetching.
 * This endpoint is used by NextAuth's useSession() hook.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    
    return NextResponse.json(session);
  } catch (error: any) {
    console.error("[Session API] Error:", error);
    return NextResponse.json(
      { error: "Failed to get session", details: error.message },
      { status: 500 }
    );
  }
}
