import { NextRequest, NextResponse } from "next/server";
import { guardUserApi } from "@/lib/api-security";
import { prisma } from "@/lib/prisma";
import { decryptField } from "@/lib/encryption";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const security = await guardUserApi(req);
  if ("response" in security) return security.response;

  const user = security.user;
  
  // Use try-catch for each part to be resilient to intermittent DB errors
  let boughtOrders = [];
  let savedUids = [];
  let recentOrders = [];
  let wishlist = [];
  let userData = null;

  try {
    const results = await Promise.allSettled([
      prisma.order.findMany({
        where: {
          userId: user.userId,
          status: { in: ["PAID", "DELIVERED", "PROCESSING"] },
        },
        select: { productId: true },
      }),
      prisma.savedUid.findMany({
        where: { userId: user.userId },
        include: {
          game: {
            select: {
              id: true,
              name: true,
              slug: true,
              imageUrl: true,
              requiresServer: true,
              servers: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.order.findMany({
        where: {
          userId: user.userId,
          status: { in: ["PAID", "DELIVERED", "PROCESSING"] },
        },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          game: { select: { id: true, name: true, slug: true, imageUrl: true } },
          product: { select: { id: true, name: true, priceUsd: true } },
        },
      }),
      prisma.wishlist.findMany({
        where: { userId: user.userId },
        include: {
          product: { include: { game: { select: { name: true, slug: true } } } },
        },
      }),
      prisma.user.findUnique({
        where: { id: user.userId },
        select: { pointsBalance: true, walletBalance: true },
      }),
    ]);

    if (results[0].status === "fulfilled") boughtOrders = results[0].value;
    if (results[1].status === "fulfilled") savedUids = results[1].value;
    if (results[2].status === "fulfilled") recentOrders = results[2].value;
    if (results[3].status === "fulfilled") wishlist = results[3].value;
    if (results[4].status === "fulfilled") userData = results[4].value;
  } catch (err) {
    console.error("Partial data fetch error in /api/user/me:", err);
  }

  const boughtProductIds = Array.from(new Set(boughtOrders.map((order: any) => order.productId)));
  const quickData = recentOrders.map((order) => ({
    gameSlug: order.game.slug,
    gameName: order.game.name,
    gameImage: order.game.imageUrl,
    productId: order.product.id,
    productName: order.product.name,
    lastPrice: order.product.priceUsd,
    playerUid: order.playerUid,
    serverId: order.serverId,
  }));

  // Decrypt user email for response
  const userWithDecryptedEmail = {
    ...user,
    email: user.email ? (decryptField(user.email) || user.email) : user.email,
  };

  return NextResponse.json({
    user: userWithDecryptedEmail,
    boughtProductIds,
    savedUids,
    quickData,
    wishlist: wishlist.map((item) => ({
      productId: item.product.id,
      productName: item.product.name,
      priceUsd: item.product.priceUsd,
      gameName: item.product.game.name,
      gameSlug: item.product.game.slug,
    })),
    pointsBalance: userData?.pointsBalance || 0,
    walletBalance: userData?.walletBalance || 0,
  });
}
