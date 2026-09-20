import { User } from "@prisma/client";

export type RankType = "BRONZE" | "SILVER" | "GOLD" | "DIAMOND_LEGEND";

interface RankMetadata {
  label: string;
  minSpend: number;
  discount: number; // in percentage, e.g. 0.01 for 1%
  color: string;
  badge: string;
}

export const RANKS: Record<RankType, RankMetadata> = {
  BRONZE: {
    label: "Bronze",
    minSpend: 0,
    discount: 0,
    color: "text-orange-400",
    badge: "bg-orange-500/20 text-orange-400 border-orange-500/50",
  },
  SILVER: {
    label: "Silver",
    minSpend: 50,
    discount: 0.01,
    color: "text-slate-300",
    badge: "bg-slate-400/20 text-slate-300 border-slate-400/50",
  },
  GOLD: {
    label: "Gold",
    minSpend: 250,
    discount: 0.02,
    color: "text-amber-400",
    badge: "bg-amber-500/20 text-amber-400 border-amber-500/50",
  },
  DIAMOND_LEGEND: {
    label: "Legendary",
    minSpend: 1000,
    discount: 0.03,
    color: "text-cyan-400",
    badge: "bg-cyan-500/20 text-cyan-400 border-cyan-500/50",
  },
};

export function getRank(totalSpentUsd: number): RankType {
  if (totalSpentUsd >= RANKS.DIAMOND_LEGEND.minSpend) return "DIAMOND_LEGEND";
  if (totalSpentUsd >= RANKS.GOLD.minSpend) return "GOLD";
  if (totalSpentUsd >= RANKS.SILVER.minSpend) return "SILVER";
  return "BRONZE";
}

export function getNextRank(currentRank: RankType): RankType | null {
  const keys: RankType[] = ["BRONZE", "SILVER", "GOLD", "DIAMOND_LEGEND"];
  const currentIndex = keys.indexOf(currentRank);
  if (currentIndex < keys.length - 1) {
    return keys[currentIndex + 1];
  }
  return null;
}

export function calculateProgress(totalSpentUsd: number) {
  const currentRank = getRank(totalSpentUsd);
  const nextRankType = getNextRank(currentRank);
  
  if (!nextRankType) return { percent: 100, remaining: 0, nextRank: null };

  const currentMin = RANKS[currentRank].minSpend;
  const nextMin = RANKS[nextRankType].minSpend;
  
  const totalNeeded = nextMin - currentMin;
  const currentProgress = totalSpentUsd - currentMin;
  
  const percent = Math.min(Math.floor((currentProgress / totalNeeded) * 100), 99);
  const remaining = nextMin - totalSpentUsd;

  return {
    percent,
    remaining,
    nextRank: RANKS[nextRankType]
  };
}
