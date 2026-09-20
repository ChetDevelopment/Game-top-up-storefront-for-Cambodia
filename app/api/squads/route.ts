import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createSquadPool, joinSquadPool, listOpenSquadPools, cancelSquadPool } from "@/lib/squad";

export async function POST(req: Request) {
  try {
    const session = await getCurrentUser();
    if (!session) {
      return NextResponse.json({ error: "Please login to use Squads" }, { status: 401 });
    }

    const { action, productId, poolId } = await req.json().catch(() => ({}));

    if (action === "CREATE") {
      const pool = await createSquadPool(productId, session.userId);
      return NextResponse.json(pool);
    }

    if (action === "JOIN") {
      const pool = await joinSquadPool(poolId, session.userId);
      return NextResponse.json(pool);
    }

    if (action === "CANCEL") {
      const pool = await cancelSquadPool(poolId, session.userId);
      return NextResponse.json(pool);
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const productId = searchParams.get("productId");

    if (!productId) return NextResponse.json([]);

    const pools = await listOpenSquadPools(productId);
    return NextResponse.json(pools);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to load squads" },
      { status: 500 }
    );
  }
}
