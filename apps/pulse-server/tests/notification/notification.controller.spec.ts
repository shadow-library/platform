import { describe, expect, it } from 'bun:test';

import { type HandlerMetadata } from '@shadow-library/app';
import { type AuthClient, type AuthPrincipal } from '@shadow-library/auth';
import { AUTH_ROUTE_METADATA, AuthGuard, type AuthGuardHandler, extendContextWithAuth } from '@shadow-library/auth/module';
import { AppError } from '@shadow-library/common';
import { ContextService } from '@shadow-library/fastify';

import { PULSE_PERMISSIONS, PULSE_SCOPES } from '@modules/auth';
import { NotificationController } from '@modules/notification/notification.controller';

const ORG = '1';
const PULSE_ADMIN_PERMISSIONS: string[] = Object.values(PULSE_PERMISSIONS);
const PULSE_VIEWER_PERMISSIONS: string[] = [PULSE_PERMISSIONS.templatesRead, PULSE_PERMISSIONS.sendersRead, PULSE_PERMISSIONS.metricsRead, PULSE_PERMISSIONS.logsRead];

const ADMIN: AuthPrincipal = { kind: 'user', sub: 'admin', org: ORG, aal: 'AAL2', scopes: [], claims: {} };
const UNELEVATED_ADMIN: AuthPrincipal = { kind: 'user', sub: 'unelevated-admin', org: ORG, aal: 'AAL1', scopes: [], claims: {} };
const VIEWER: AuthPrincipal = { kind: 'user', sub: 'viewer', org: ORG, scopes: [], claims: {} };
const SENDERS_ADMIN: AuthPrincipal = { kind: 'user', sub: 'senders-admin', org: ORG, aal: 'AAL2', scopes: [], claims: {} };
const PRODUCER: AuthPrincipal = { kind: 'service', sub: 'identity', clientId: 'identity', scopes: [PULSE_SCOPES.notificationsSend], claims: {} };

const GRANTS = new Map<string, string[]>([
  [ADMIN.sub, PULSE_ADMIN_PERMISSIONS],
  [UNELEVATED_ADMIN.sub, PULSE_ADMIN_PERMISSIONS],
  [VIEWER.sub, PULSE_VIEWER_PERMISSIONS],
  [SENDERS_ADMIN.sub, PULSE_ADMIN_PERMISSIONS.filter(permission => permission !== PULSE_PERMISSIONS.notificationsSend)],
]);

const client = {
  verify: (token: string) => Promise.resolve([ADMIN, UNELEVATED_ADMIN, VIEWER, SENDERS_ADMIN, PRODUCER].find(principal => principal.sub === token)),
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

/** Resolves to null when the guard admits the principal, else to the refusal's error code. */
function refusalOf(method: keyof NotificationController, principal: AuthPrincipal): Promise<string | null> {
  const handler = guard.generate(handlerMetadata(method)) as AuthGuardHandler;
  return new Promise(resolve => {
    const hook = context.init() as unknown as (request: unknown, response: unknown, done: () => void) => void;
    hook({ id: 'guard-rid' }, {}, () => {
      handler({ headers: { authorization: `Bearer ${principal.sub}` } }).then(
        () => resolve(null),
        (error: unknown) => resolve(AppError.is(error) ? error.code : null),
      );
    });
  });
}

async function admits(method: keyof NotificationController, principal: AuthPrincipal): Promise<boolean> {
  return (await refusalOf(method, principal)) === null;
}

describe('NotificationController', () => {
  describe('the console send', () => {
    it('should admit a pulse admin session', async () => {
      expect(await admits('sendFromConsole', ADMIN)).toBe(true);
    });

    it('should ask an admin session that has not stepped up to elevate', async () => {
      expect(await refusalOf('sendFromConsole', UNELEVATED_ADMIN)).toBe('IAM_003');
    });

    it('should require the console send permission with the high-risk decision TTL and an elevated session', () => {
      expect(handlerMetadata('sendFromConsole')[AUTH_ROUTE_METADATA]).toMatchObject({ permission: PULSE_PERMISSIONS.notificationsSend, highRisk: true, elevated: true });
    });

    it('should refuse a pulse viewer session', async () => {
      expect(await admits('sendFromConsole', VIEWER)).toBe(false);
    });

    it('should refuse a producer service token, which carries no organisation to evaluate a permission in', async () => {
      expect(await admits('sendFromConsole', PRODUCER)).toBe(false);
    });

    it('should refuse a session holding every other admin permission but not the console send one', async () => {
      expect(await admits('sendFromConsole', SENDERS_ADMIN)).toBe(false);
    });
  });

  describe('the producer send', () => {
    it('should admit a producer service token carrying the send scope', async () => {
      expect(await admits('createNotification', PRODUCER)).toBe(true);
    });

    it('should refuse an admin session, which never carries the service-only scope', async () => {
      expect(await admits('createNotification', ADMIN)).toBe(false);
    });
  });
});
