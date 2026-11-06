export type QueueCandidate = {
  id: string;
  voteCount: number;
  createdAt: string;
};

export const MIN_VOTES_FOR_QUEUE = 5;
export const PROPOSAL_COOLDOWN_SECONDS = 120; // 2 minutes between proposals

export function effectiveVoteScore(voteCount: number): number {
  if (!voteCount || voteCount >= 9999 || voteCount < 0) return 0;
  return voteCount;
}

export function compareQueue(a: QueueCandidate, b: QueueCandidate): number {
  const scoreA = effectiveVoteScore(a.voteCount);
  const scoreB = effectiveVoteScore(b.voteCount);
  if (scoreA !== scoreB) {
    return scoreB - scoreA;
  }

  return Date.parse(a.createdAt) - Date.parse(b.createdAt);
}

export function sortQueue<T extends QueueCandidate>(items: T[]): T[] {
  return [...items].sort(compareQueue);
}

export function partitionQueueAndProposals<
  T extends {
    id: string;
    voteCount: number;
    createdAt: string;
    status?: string;
    proposedByParticipantId?: string | null;
    isGuestProposal?: boolean;
  }
>(
  queueItems: T[],
  candidateItems?: T[],
  threshold = MIN_VOTES_FOR_QUEUE,
): { activeQueue: T[]; candidateProposals: T[] } {
  const combined =
    candidateItems && candidateItems.length > 0
      ? [...queueItems, ...candidateItems.filter((c) => !queueItems.some((q) => q.id === c.id))]
      : queueItems;

  const active: T[] = [];
  const cand: T[] = [];

  for (const item of combined) {
    if (item.status === "playing") continue;

    const isGuestProposal =
      item.status === "proposed" ||
      Boolean(item.isGuestProposal) ||
      Boolean(item.proposedByParticipantId) ||
      (item.voteCount > 0 && item.voteCount < 9999);

    if (!isGuestProposal) {
      // House / Playlist / Operator tracks (voteCount === 0 or >= 9999)
      active.push(item);
    } else if (item.voteCount >= threshold) {
      // Guest proposal that reached the required vote threshold (e.g. 3 votes in Democratic mode)
      active.push(item);
    } else {
      // Guest proposal in pre-queue waiting to reach threshold votes
      cand.push(item);
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
