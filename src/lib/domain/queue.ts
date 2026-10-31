export type QueueCandidate = {
  id: string;
  voteCount: number;
  createdAt: string;
};

export function compareQueue(a: QueueCandidate, b: QueueCandidate): number {
  if (a.voteCount !== b.voteCount) {
    return b.voteCount - a.voteCount;
  }

  return Date.parse(a.createdAt) - Date.parse(b.createdAt);
}

export function sortQueue<T extends QueueCandidate>(items: T[]): T[] {
  return [...items].sort(compareQueue);
}
