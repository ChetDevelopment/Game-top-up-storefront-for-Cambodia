import { prisma } from "./prisma";

type SquadPoolRecord = {
  id: string;
  productId: string;
  leaderId: string;
  targetSize: number;
  currentSize: number;
  status: string;
  expiresAt: Date;
  createdAt: Date;
};

export interface SquadPoolSummary {
  id: string;
  leaderId: string;
  targetSize: number;
  currentSize: number;
  expiresAt: string;
  leader: {
    name: string;
    image: string | null;
  };
}

function mapPool(
  pool: SquadPoolRecord,
  leaderMap: Map<string, { name: string | null; image: string | null }>
): SquadPoolSummary {
  const leader = leaderMap.get(pool.leaderId);

  return {
    id: pool.id,
    leaderId: pool.leaderId,
    targetSize: pool.targetSize,
    currentSize: pool.currentSize,
    expiresAt: pool.expiresAt.toISOString(),
    leader: {
      name: leader?.name?.trim() || "Squad Leader",
      image: leader?.image ?? null,
    },
  };
}

async function summarizePools(pools: SquadPoolRecord[]): Promise<SquadPoolSummary[]> {
  const leaderIds = [...new Set(pools.map((pool) => pool.leaderId))];
  const leaders =
    leaderIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: leaderIds } },
          select: { id: true, name: true, image: true },
        })
      : [];

  const leaderMap = new Map(
    leaders.map((leader) => [
      leader.id,
      { name: leader.name, image: leader.image },
    ])
  );

  return pools.map((pool) => mapPool(pool, leaderMap));
}

async function summarizePool(pool: SquadPoolRecord): Promise<SquadPoolSummary> {
  const [summary] = await summarizePools([pool]);
  return summary;
}

export async function listOpenSquadPools(productId: string) {
  const pools = await prisma.squadPool.findMany({
    where: {
      productId,
      status: "OPEN",
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  return summarizePools(pools);
}

export async function createSquadPool(productId: string, userId: string) {
  const [product, existingPool] = await Promise.all([
    prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    }),
    prisma.squadPool.findFirst({
      where: {
        productId,
        leaderId: userId,
        status: "OPEN",
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  if (!product) throw new Error("Product not found");
  if (existingPool) return summarizePool(existingPool);

  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);

  const pool = await prisma.squadPool.create({
    data: {
      productId,
      leaderId: userId,
      targetSize: 5,
      currentSize: 1,
      expiresAt,
      status: "OPEN",
    },
  });

  return summarizePool(pool);
}

export async function joinSquadPool(poolId: string, userId: string) {
  const pool = await prisma.squadPool.findUnique({
    where: { id: poolId },
  });

  if (!pool) throw new Error("Squad not found");
  if (pool.status !== "OPEN") throw new Error("Squad is no longer open");
  if (new Date() > pool.expiresAt) {
    await prisma.squadPool.update({
      where: { id: poolId },
      data: { status: "EXPIRED" },
    });
    throw new Error("Squad has expired");
  }
  if (pool.currentSize >= pool.targetSize) {
    await prisma.squadPool.update({
      where: { id: poolId },
      data: { status: "COMPLETED" },
    });
    throw new Error("Squad is already full");
  }
  if (pool.leaderId === userId) {
    return summarizePool(pool);
  }

  const nextSize = Math.min(pool.currentSize + 1, pool.targetSize);
  const updatedPool = await prisma.squadPool.update({
    where: { id: poolId },
    data: {
      currentSize: nextSize,
      status: nextSize >= pool.targetSize ? "COMPLETED" : "OPEN",
    },
  });

  return summarizePool(updatedPool);
}

export async function cancelSquadPool(poolId: string, userId: string) {
  const pool = await prisma.squadPool.findUnique({
    where: { id: poolId },
  });

  if (!pool) throw new Error("Squad not found");
  if (pool.leaderId !== userId) throw new Error("Only the squad leader can cancel the pool");
  
  // We mark it as EXPIRED or we could delete it. 
  // Given we might have orders linked, marking it as EXPIRED/CANCELLED is safer.
  const updatedPool = await prisma.squadPool.update({
    where: { id: poolId },
    data: { status: "EXPIRED" },
  });

  return summarizePool(updatedPool);
}
