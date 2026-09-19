import { type Refinement } from '@server/database';

import { asStudioPayload } from '../ideation/studio-payload.dto';
import { type ChatMessageResponse, type ChatTurnResponse } from './chat.dto';
import { type ScopedTurnResult } from './chat-turn.registry';
import { type ProposalResponse } from './refinement.dto';

/**
 * Response serialisation for the refinement module. Every helper here **projects** its row onto the
 * declared response fields rather than spreading it: over HTTP the compiled schema would drop whatever
 * the DTO does not declare, but the turn stream writes these objects straight to the wire with no schema
 * in front of them, and a spread row would put `refinement_proposals.inverse_ops` — the full rollback
 * payload the DTO reduces to the derived `revertible` flag — in front of the client.
 *
 * Bigints are left as bigints: a field typed `@Field(() => String)` is coerced by the response
 * serialiser, except on the nullable path (a message's `proposalId`, a proposal's `messageId`), where a
 * raw bigint fails its `string | null` schema — so those two are coerced here instead.
 */

interface ChatMessageRow {
  id: bigint;
  sessionId: string;
  ordinal: number;
  role: string;
  content: string;
  payload?: Record<string, unknown> | null;
  proposalId?: bigint | null;
  runId?: string | null;
  modelProvider?: string | null;
  modelId?: string | null;
  createdAt: Date;
}

export function serialiseMessage(message: ChatMessageRow): ChatMessageResponse {
  return {
    id: message.id,
    sessionId: message.sessionId,
    ordinal: message.ordinal,
    role: message.role,
    content: message.content,
    payload: asStudioPayload(message.payload),
    proposalId: message.proposalId == null ? null : (String(message.proposalId) as unknown as bigint),
    runId: message.runId ?? null,
    modelProvider: message.modelProvider ?? null,
    modelId: message.modelId ?? null,
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
    createdAt: proposal.createdAt,
    updatedAt: proposal.updatedAt,
  };
}

/** One turn on the wire. Shared by the synchronous turn endpoint and the stream's `done` event, which carry the same shape by contract. */
export function serialiseTurn(result: ScopedTurnResult): ChatTurnResponse {
  const applied = result.applied;
  return {
    userMessage: serialiseMessage(result.userMessage),
    assistantMessage: serialiseMessage(result.assistantMessage),
    proposal: result.proposal ? serialiseProposal(result.proposal) : undefined,
    applied: applied && {
      applied: applied.applied.map(({ artifactRef, newRevision }) => ({ artifactRef, newRevision })),
      staleMarked: applied.staleMarked,
      opResults: applied.opResults,
    },
    applyNote: result.applyNote,
    seed: result.seed,
    runId: result.runId,
  };
}
