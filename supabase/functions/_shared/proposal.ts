import { findExplicitKeyword } from "../../../src/lib/domain/explicit";

export type ProposalEvaluationError =
  | "explicit"
  | "duplicate_active"
  | "queue_full"
  | "proposal_limit"
  | null;

export interface EvaluateProposalInput {
  title: string;
  artist: string;
  explicitKeywords: readonly string[];
  filterEnabled: boolean;
  existingActive: boolean;
  queueSize: number;
  maxQueueSize: number;
  proposalsUsed: number;
  maxProposals: number;
}

export function evaluateProposal(
  input: EvaluateProposalInput,
): ProposalEvaluationError {
  if (
    input.filterEnabled &&
    findExplicitKeyword(
      `${input.title} ${input.artist}`,
      input.explicitKeywords,
    )
  ) {
    return "explicit";
  }
  if (input.existingActive) {
    return "duplicate_active";
  }
  if (input.queueSize >= input.maxQueueSize) {
    return "queue_full";
  }
  if (input.proposalsUsed >= input.maxProposals) {
    return "proposal_limit";
  }
  return null;
}

