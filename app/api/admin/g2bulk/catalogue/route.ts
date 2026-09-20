import { NextRequest, NextResponse } from "next/server";
import { getFreeFireCatalogue } from "@/scripts/match-g2bulk-catalogue";
import { prisma } from "@/lib/prisma";

const FREE_FIRE_GAME_CODE = "freefire_sgmy";

/**
 * GET /api/admin/g2bulk/catalogue
 * Fetch G2Bulk Free Fire catalogue and return matched products
 */
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const action = searchParams.get("action") || "list";

    if (action === "list") {
      // Just fetch and return catalogue
      const catalogue = await getFreeFireCatalogue();
      
      // Get existing products for comparison
      const freeFireGame = await prisma.game.findFirst({
        where: {
          OR: [
            { slug: "free-fire" },
            { slug: "freefire" },
            { name: { contains: "Free Fire", mode: "insensitive" } },
          ],
        },
      });

      if (!freeFireGame) {
        return NextResponse.json({
          error: "Free Fire game not found",
          catalogue: catalogue.map((item) => ({
            ...item,
            matched: false,
          })),
        });
      }

      const existingProducts = await prisma.product.findMany({
        where: { gameId: freeFireGame.id },
        select: { id: true, name: true, amount: true, priceUsd: true },
      });

      const matchedCatalogue = catalogue.map((item) => {
        const match = existingProducts.find((p) => p.name === item.name);
        return {
          ...item,
          matched: !!match,
          existingProductId: match?.id,
          existingProductName: match?.name,
          existingPriceUsd: match?.priceUsd,
        };
      });

      return NextResponse.json({
        success: true,
        catalogue: matchedCatalogue,
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: any) {
    console.error("[G2Bulk Catalogue] Error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to fetch catalogue" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/g2bulk/catalogue
 * Sync G2Bulk catalogue with database
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, items } = body;

    if (action === "sync") {
      const freeFireGame = await prisma.game.findFirst({
        where: {
          OR: [
            { slug: "free-fire" },
            { slug: "freefire" },
            { name: { contains: "Free Fire", mode: "insensitive" } },
          ],
        },
      });

      if (!freeFireGame) {
        return NextResponse.json({ error: "Free Fire game not found" }, { status: 404 });
      }

      const results = {
        created: 0,
        updated: 0,
        skipped: 0,
        errors: 0,
      };

      for (const item of items) {
        try {
          const existing = await prisma.product.findFirst({
            where: {
              gameId: freeFireGame.id,
              name: item.name,
            },
          });

          if (existing) {
            // Update existing product
            await prisma.product.update({
              where: { id: existing.id },
              data: {
                amount: item.amount,
                priceUsd: item.priceUsd || existing.priceUsd,
                g2bulkCatalogueName: item.name,
                active: true,
              },
            });
            results.updated++;
          } else {
            // Create new product
            await prisma.product.create({
              data: {
                gameId: freeFireGame.id,
                name: item.name,
                amount: item.amount,
                priceUsd: item.priceUsd || 0,
                g2bulkCatalogueName: item.name,
                active: true,
              },
            });
            results.created++;
          }
        } catch (err: any) {
          console.error(`[G2Bulk Sync] Error processing ${item.name}:`, err);
          results.errors++;
        }
      }

      return NextResponse.json({
        success: true,
        ...results,
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: any) {
    console.error("[G2Bulk Catalogue Sync] Error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to sync catalogue" },
      { status: 500 }
    );
  }
}
