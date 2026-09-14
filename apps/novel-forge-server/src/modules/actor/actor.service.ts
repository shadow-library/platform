import { Injectable } from '@shadow-library/app';
import { AppError } from '@shadow-library/common';
import { ContextService } from '@shadow-library/fastify';

import { type OwnerRef } from '@server/common';

export interface UserActor extends OwnerRef {
  kind: 'user';
  organisationId: bigint | null;
}

export interface BotActor extends OwnerRef {
  kind: 'bot';
  organisationId: bigint;
}

export type Actor = UserActor | BotActor;

/** The owner columns a new `projects` row takes from its creator; `organisationId` is set only for a bot. */
export interface ProjectOwnerColumns {
  ownerKind: Actor['kind'];
  ownerId: bigint;
  organisationId: bigint | null;
}

export function projectOwnerColumns(actor: Actor): ProjectOwnerColumns {
  return { ownerKind: actor.kind, ownerId: actor.id, organisationId: actor.kind === 'bot' ? actor.organisationId : null };
}

function toId(value: string | undefined): bigint | null {
  if (!value) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

/**
 * Resolves the caller into the owner every record is attributed to. A bot's `sub` is its OAuth client id
 * (`bot_…`), so its numeric identity is the `bot_id` claim instead — which is the whole reason the derivation
 * lives here rather than as a `BigInt(principal.sub)` in each service.
 */
@Injectable()
export class ActorService {
  constructor(private readonly context: ContextService) {}

  current(): Actor {
    const principal = this.context.getAuthPrincipal();

    if (principal.kind === 'bot') {
      const id = toId(principal.botId);
      const organisationId = toId(principal.org);
      if (id === null || organisationId === null) throw AppError.internal('a bot principal named no numeric bot id or organisation');
      return { kind: 'bot', id, organisationId };
    }

    if (principal.kind !== 'user') throw AppError.internal(`a ${principal.kind} principal reached an owner-scoped route`);

    const id = toId(principal.sub);
    if (id === null) throw AppError.internal('a user principal named no numeric subject');
    return { kind: 'user', id, organisationId: toId(principal.org) };
  }
}
