// @ts-nocheck

type MysteryBoxReward = {
  id: string;
  name: string;
  description: string;
  probability: number;
  valueUsd: number;
  type: string;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Weighted random selection for Mystery Box rewards.
 */
export function drawMysteryReward(rewards: any[]): any {
  const totalWeight = rewards.reduce((sum: number, r: any) => sum + r.probability, 0);
  let random = Math.random() * totalWeight;

  for (const reward of rewards) {
    if (random < reward.probability) {
      return reward;
    }
    random -= reward.probability;
  }

  return rewards[rewards.length - 1]; // Fallback
}
