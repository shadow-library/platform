import { describe, expect, it } from 'bun:test';

import { type HandlerMetadata } from '@shadow-library/app';
import { type AuthClient, type AuthPrincipal } from '@shadow-library/auth';
import { AuthGuard, type AuthGuardHandler, extendContextWithAuth } from '@shadow-library/auth/module';
import { AppError } from '@shadow-library/common';
import { ContextService } from '@shadow-library/fastify';

import { PULSE_PERMISSIONS, PULSE_SCOPES } from '@modules/auth';
import { NotificationController } from '@modules/notification/notification.controller';

const ORG = '1';
const PULSE_ADMIN_PERMISSIONS: string[] = Object.values(PULSE_PERMISSIONS);

const ADMIN: AuthPrincipal = { kind: 'user', sub: 'admin', org: ORG, scopes: [], claims: {} };
const PRODUCER: AuthPrincipal = { kind: 'service', sub: 'identity', clientId: 'identity', scopes: [PULSE_SCOPES.notificationsSend], claims: {} };

const GRANTS = new Map<string, string[]>([[ADMIN.sub, PULSE_ADMIN_PERMISSIONS]]);

const client = {
  verify: (token: string) => Promise.resolve([ADMIN, PRODUCER].find(principal => principal.sub === token)),
  isServiceCallerAllowed: () => true,
  check: (input: { action: string; principal: AuthPrincipal }) => Promise.resolve(GRANTS.get(input.principal.sub)?.includes(input.action) ?? false),
} as unknown as AuthClient;

const context = new ContextService();
extendContextWithAuth(context);
const guard = new AuthGuard(client, context);

function handlerMetadata(method: keyof NotificationController): HandlerMetadata {
  const handler = NotificationController.prototype[method];
  const key = Reflect.getMetadataKeys(handler).find(candidate => typeof candidate === 'symbol' && candidate.description === 'handler-metadata');
  return Reflect.getMetadata(key, handler) as HandlerMetadata;
}

function admits(method: keyof NotificationController, principal: AuthPrincipal): Promise<boolean> {
  const handler = guard.generate(handlerMetadata(method)) as AuthGuardHandler;
  return new Promise(resolve => {
    const hook = context.init() as unknown as (request: unknown, response: unknown, done: () => void) => void;
    hook({ id: 'guard-rid' }, {}, () => {
      handler({ headers: { authorization: `Bearer ${principal.sub}` } }).then(
        () => resolve(true),
        (error: unknown) => resolve(!AppError.is(error)),
      );
    });
  });
}

describe('NotificationController', () => {
  describe('the producer send', () => {
    it('should admit a producer service token carrying the send scope', async () => {
      expect(await admits('createNotification', PRODUCER)).toBe(true);
    });

    it('should refuse an admin session, which never carries the service-only scope', async () => {
      expect(await admits('createNotification', ADMIN)).toBe(false);
    });
  });
});
