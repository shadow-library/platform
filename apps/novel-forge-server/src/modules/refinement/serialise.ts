/**
 * Response serialisation helpers for the refinement module.
 *
 * The response schema serialises a `bigint` field typed as `@Field(() => String)` by coercing it to
 * a string — but only on the non-nullable path. A nullable bigint-as-string field (a chat message's
 * `proposalId`, a proposal's `messageId`) that actually holds a value is handed to the serialiser as
 * a raw `bigint`, which fails its `string | null` schema. Coercing the value here, before it reaches
 * the serialiser, keeps the wire contract (`string | null`) intact.
 */

/** Coerce a chat message's nullable `proposalId` bigint to the wire's `string | null`. */
export function serialiseMessage<T extends { proposalId?: bigint | null }>(message: T): T {
  return { ...message, proposalId: message.proposalId == null ? null : (String(message.proposalId) as unknown as bigint) };
}

/** Coerce a proposal's nullable `messageId` bigint to the wire's `string | null`, and derive `revertible`. */
export function serialiseProposal<T extends { messageId?: bigint | null; status?: string; inverseOps?: unknown }>(proposal: T): T {
  const inverseOps = proposal.inverseOps as unknown[] | null | undefined;
  return {
    ...proposal,
    messageId: proposal.messageId == null ? null : (String(proposal.messageId) as unknown as bigint),
    revertible: proposal.status === 'applied' && (inverseOps?.length ?? 0) > 0,
  };
}
