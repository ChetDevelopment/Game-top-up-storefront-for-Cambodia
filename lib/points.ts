import { prisma } from "./prisma";

/**
 * Logic for earning and spending TK Points
 * Default: 10 points per $1 spent
 * Redemption: 100 points = $1 discount
 */

export const POINT_EARN_RATE = 10; // points per $1
export const POINT_VALUE = 0.01;   // $0.01 per point

export async function addPointsForPurchase(userId: string, amountUsd: number, orderId: string) {
  const pointsToEarn = Math.floor(amountUsd * POINT_EARN_RATE);
  if (pointsToEarn <= 0) return 0;

  await prisma.$transaction([
    prisma.pointTransaction.create({
      data: {
        userId,
        amount: pointsToEarn,
        type: "PURCHASE",
        orderId,
      },
    }),
    prisma.user.update({
      where: { id: userId },
      data: {
        pointsBalance: { increment: pointsToEarn },
      },
    }),
    prisma.order.update({
      where: { id: orderId },
      data: { pointsEarned: pointsToEarn },
    }),
  ]);

  return pointsToEarn;
}

export async function usePointsForDiscount(userId: string, pointsToUse: number, orderId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.pointsBalance < pointsToUse) {
    throw new Error("Insufficient points balance.");
  }

  const discountUsd = pointsToUse * POINT_VALUE;

  await prisma.$transaction([
    prisma.pointTransaction.create({
      data: {
        userId,
        amount: -pointsToUse,
        type: "REDEEM",
        orderId,
      },
    }),
    prisma.user.update({
      where: { id: userId },
      data: {
        pointsBalance: { decrement: pointsToUse },
      },
    }),
    prisma.order.update({
      where: { id: orderId },
      data: { 
        pointsUsed: pointsToUse,
        discountUsd: { increment: discountUsd }
      },
    }),
  ]);

  return discountUsd;
}
