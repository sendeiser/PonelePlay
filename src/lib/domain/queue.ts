export type QueueCandidate = {
  id: string;
  voteCount: number;
  createdAt: string;
};

export const MIN_VOTES_FOR_QUEUE = 5;
export const PROPOSAL_COOLDOWN_SECONDS = 120; // 2 minutes between proposals

export function compareQueue(a: QueueCandidate, b: QueueCandidate): number {
  if (a.voteCount !== b.voteCount) {
    return b.voteCount - a.voteCount;
  }

  return Date.parse(a.createdAt) - Date.parse(b.createdAt);
}

export function sortQueue<T extends QueueCandidate>(items: T[]): T[] {
  return [...items].sort(compareQueue);
}

export function partitionQueueAndProposals<
  T extends { id: string; voteCount: number; createdAt: string; status?: string }
>(
  queueItems: T[],
  candidateItems?: T[],
  threshold = MIN_VOTES_FOR_QUEUE,
): { activeQueue: T[]; candidateProposals: T[] } {
  // If candidates are provided explicitly from backend RPC
  if (candidateItems && candidateItems.length > 0) {
    const active = sortQueue(queueItems.filter((i) => i.status !== "proposed" && (i.status === "queued" || i.voteCount >= threshold)));
    const cand = sortQueue([...candidateItems]);
    return { activeQueue: active, candidateProposals: cand };
  }

  // Otherwise, partition items by status and threshold
  const active: T[] = [];
  const cand: T[] = [];

  for (const item of queueItems) {
    if (item.status === "playing") continue;

    if (item.status === "proposed" || item.voteCount < threshold) {
      cand.push(item);
    } else {
      active.push(item);
    }
  }

  return {
    activeQueue: sortQueue(active),
    candidateProposals: sortQueue(cand),
  };
}

export function formatVotesBadge(voteCount: number): string {
  if (voteCount >= 9999) return "⭐ Selección Bar";
  if (voteCount === 0) return "⭐ Selección Bar";
  return `${voteCount} ${voteCount === 1 ? "voto" : "votos"}`;
}

/**
 * Selects the round winner among candidate proposals when time expires:
 * Most voted candidate first; if tied, earliest proposed (created_at asc).
 */
export function selectRoundWinner<T extends QueueCandidate>(candidates: T[]): T | null {
  if (!candidates || candidates.length === 0) return null;
  const sorted = sortQueue(candidates);
  return sorted[0] ?? null;
}
