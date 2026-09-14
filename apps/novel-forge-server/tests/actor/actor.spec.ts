import { describe, expect, it } from 'bun:test';

import { type AuthPrincipal } from '@shadow-library/auth';
import { type AppError } from '@shadow-library/common';
import { type ContextService } from '@shadow-library/fastify';

import { ActorService, projectOwnerColumns } from '@modules/actor';
import { isOwnedBy } from '@server/common';

function actorFor(principal: AuthPrincipal): ActorService {
  return new ActorService({ getAuthPrincipal: () => principal } as unknown as ContextService);
}

const user: AuthPrincipal = { kind: 'user', sub: '1001', org: '7001', scopes: [], claims: {} };
const bot: AuthPrincipal = { kind: 'bot', sub: 'bot_client_9', org: '7001', botId: '1001', keyId: 'key-1', rateLimitPerMinute: 60, scopes: [], claims: {} };

describe('ActorService', () => {
  it('should resolve a user from its subject and organisation', () => {
    expect(actorFor(user).current()).toEqual({ kind: 'user', id: BigInt(1001), organisationId: BigInt(7001) });
  });

  it('should leave a user without an organisation claim unscoped', () => {
    expect(actorFor({ ...user, org: undefined }).current().organisationId).toBeNull();
  });

  it('should leave a user whose organisation claim is not numeric unscoped rather than failing the request', () => {
    expect(actorFor({ ...user, org: 'org-test' }).current().organisationId).toBeNull();
  });

  it('should resolve a bot from its bot id, never its client-id subject', () => {
    expect(actorFor(bot).current()).toEqual({ kind: 'bot', id: BigInt(1001), organisationId: BigInt(7001) });
  });

  it('should refuse a service principal, which owns no records', () => {
    const error = (() => {
      try {
        return actorFor({ kind: 'service', sub: 'pulse-server', scopes: [], claims: {} }).current();
      } catch (err) {
        return err as AppError;
      }
    })() as AppError;

    expect(error.message).toContain('service');
  });

  it('should attribute a new project to the bot organisation, and never to a user one', () => {
    expect(projectOwnerColumns(actorFor(bot).current())).toEqual({ ownerKind: 'bot', ownerId: BigInt(1001), organisationId: BigInt(7001) });
    expect(projectOwnerColumns(actorFor(user).current())).toEqual({ ownerKind: 'user', ownerId: BigInt(1001), organisationId: null });
  });
});

describe('isOwnedBy', () => {
  const owner = { kind: 'user', id: BigInt(1001) } as const;

  it('should match a row owned by the same kind and id', () => {
    expect(isOwnedBy({ ownerKind: 'user', ownerId: BigInt(1001) }, owner)).toBe(true);
  });

  it('should not match a bot row sharing the numeric id', () => {
    expect(isOwnedBy({ ownerKind: 'bot', ownerId: BigInt(1001) }, owner)).toBe(false);
  });

  it('should not match an unowned row', () => {
    expect(isOwnedBy({ ownerKind: 'user', ownerId: null }, owner)).toBe(false);
  });
});
