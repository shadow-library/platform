import { type Refinement } from '@server/database';

import { type ProposalResponse } from './refinement.dto';

/**
 * Response serialisation helpers for the refinement module. The response schema serialises a `bigint`
 * field typed as `@Field(() => String)` by coercing it to a string — but only on the non-nullable
 * path. A nullable bigint-as-string field (a chat message's `proposalId`, a proposal's `messageId`)
 * that actually holds a value is handed to the serialiser as a raw `bigint`, which fails its
 * `string | null` schema. Coercing the value here, before it reaches the serialiser, keeps the wire
 * contract (`string | null`) intact.
 */

export function serialiseMessage<T extends { proposalId?: bigint | null }>(message: T): T {
  return { ...message, proposalId: message.proposalId == null ? null : (String(message.proposalId) as unknown as bigint) };
}

// The proposal's op/state columns are jsonb (`unknown` on the row); the response exposes them as the
// loose `Record<string, unknown>` shape the DTO declares, and `messageId`'s nullable bigint is coerced
// to the wire's `string | null` (see the bigint-as-string note above). `revertible` is derived here.
export function serialiseProposal(proposal: Refinement.Proposal): ProposalResponse {
  const inverseOps = proposal.inverseOps as unknown[] | null | undefined;
  return {
    ...proposal,
    messageId: proposal.messageId == null ? null : (String(proposal.messageId) as unknown as bigint),
    changeSet: proposal.changeSet as Record<string, unknown>[],
    baseline: proposal.baseline as Record<string, unknown>,
    opResults: (proposal.opResults ?? null) as Record<string, unknown>[] | null,
    revertible: proposal.status === 'applied' && (inverseOps?.length ?? 0) > 0,
  };
}
