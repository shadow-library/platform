import { type Project, type Refinement } from '@server/database';

import { type CallUsageTotals } from '../ai/usage/call-usage';
import { type NotesOffer, notesOffer } from '../notes/notes-message';
import { type ChatMessageResponse, type ChatTurnResponse } from './chat.dto';
import { type ChatTurnResult } from './chat.service';
import { type OpResult } from './proposal-apply.service';
import { type AppliedActionJobItem, type ProposalResponse } from './refinement.dto';

/**
 * Response serialisation for the refinement module. Every helper here **projects** its row onto the
 * declared response fields rather than spreading it: over HTTP the compiled schema would drop whatever
 * the DTO does not declare, but the turn stream writes these objects straight to the wire with no schema
 * in front of them, and a spread row would put `refinement_proposals.inverse_ops` — the full rollback
 * payload the DTO reduces to the derived `revertible` flag — in front of the client.
 *
 * Bigints are left as bigints: a field typed `@Field(() => String)` is coerced by the response
 * serialiser, except on the nullable path (a message's `proposalId` and `appliedProposalId`, a proposal's `messageId`), where a
 * raw bigint fails its `string | null` schema — so those are coerced here instead.
 */

interface ChatMessageRow {
  id: bigint;
  sessionId: string;
  ordinal: number;
  role: string;
  content: string;
  proposalId?: bigint | null;
  appliedProposalId?: bigint | null;
  runId?: string | null;
  modelProvider?: string | null;
  modelId?: string | null;
  contentMode?: Project.ContentMode | null;
  costTier?: Project.CostTier | null;
  question?: unknown;
  trace?: Refinement.ChatTurnTrace | null;
  createdAt: Date;
}

const NO_NOTES = notesOffer('');

/** `offersNotes` reads the message against the author's notes, so one they already hold, or could not take, is not offered. */
export function serialiseMessage(message: ChatMessageRow, offersNotes: NotesOffer = NO_NOTES): ChatMessageResponse {
  return {
    id: message.id,
    sessionId: message.sessionId,
    ordinal: message.ordinal,
    role: message.role,
    content: message.content,
    proposalId: message.proposalId == null ? null : (String(message.proposalId) as unknown as bigint),
    appliedProposalId: message.appliedProposalId == null ? null : (String(message.appliedProposalId) as unknown as bigint),
    runId: message.runId ?? null,
    modelProvider: message.modelProvider ?? null,
    modelId: message.modelId ?? null,
    contentMode: message.contentMode ?? null,
    costTier: message.costTier ?? null,
    offersNotes: offersNotes(message),
    question: (message.question as ChatMessageResponse['question']) ?? null,
    trace: message.trace ?? null,
    createdAt: message.createdAt,
  };
}

export function serialiseProposal(proposal: Refinement.Proposal): ProposalResponse {
  const inverseOps = proposal.inverseOps as unknown[] | null | undefined;
  return {
    id: proposal.id,
    projectId: proposal.projectId,
    sessionId: proposal.sessionId,
    messageId: proposal.messageId == null ? null : (String(proposal.messageId) as unknown as bigint),
    scopeType: proposal.scopeType,
    scopeRef: proposal.scopeRef,
    kind: proposal.kind,
    status: proposal.status,
    summary: proposal.summary,
    changeSet: proposal.changeSet as Record<string, unknown>[],
    baseline: proposal.baseline as Record<string, unknown>,
    autoApplied: proposal.autoApplied,
    revertible: proposal.status === 'applied' && (inverseOps?.length ?? 0) > 0,
    opResults: (proposal.opResults ?? null) as Record<string, unknown>[] | null,
    model: proposal.model,
    runId: proposal.runId,
    appliedAt: proposal.appliedAt,
    revertedAt: proposal.revertedAt,
    error: proposal.error as Record<string, unknown> | null,
    warnings: proposal.warnings ?? [],
    diagnostics: proposal.diagnostics ?? (proposal.warnings ?? []).map(message => ({ kind: 'other' as const, message })),
    createdAt: proposal.createdAt,
    updatedAt: proposal.updatedAt,
  };
}

/** One turn on the wire. Shared by the synchronous turn endpoint and the stream's `done` event, which carry the same shape by contract. */
export function serialiseTurn(result: ChatTurnResult, offersNotes: NotesOffer = NO_NOTES): ChatTurnResponse {
  const applied = result.applied;
  return {
    userMessage: serialiseMessage(result.userMessage, offersNotes),
    assistantMessage: serialiseMessage(result.assistantMessage),
    proposal: result.proposal ? serialiseProposal(result.proposal) : undefined,
    appliedProposal: result.appliedProposal ? serialiseProposal(result.appliedProposal) : undefined,
    applied: applied && {
      applied: applied.applied.map(({ artifactRef, newRevision }) => ({ artifactRef, newRevision })),
      staleMarked: applied.staleMarked,
      opResults: applied.opResults,
    },
    applyNote: result.applyNote,
    held: result.held,
    runId: result.runId,
  };
}

/** Folds a `TurnCostService` figure onto an already-serialised message; a message with no figure (a user message, or a reply that made no run-linked call) is returned unchanged. */
export function withTurnCost(message: ChatMessageResponse, usage: CallUsageTotals | undefined): ChatMessageResponse {
  if (!usage) return message;
  return { ...message, costUsd: usage.costUsd, inputTokens: usage.inputTokens, cachedInputTokens: usage.cachedInputTokens, outputTokens: usage.outputTokens };
}

export function startedJobs(opResults: readonly OpResult[]): AppliedActionJobItem[] {
  return opResults.flatMap(({ index, status, result }) => {
    const jobId = result?.['jobId'];
    if (status !== 'applied' || typeof jobId !== 'string') return [];
    const runId = result?.['runId'];
    return [{ index, jobId, ...(typeof runId === 'string' ? { runId } : {}) }];
  });
}
