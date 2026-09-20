import { describe, expect, it, mock } from 'bun:test';

import { type AuthPrincipal } from '@shadow-library/auth';
import { AUTH_PRINCIPAL, AuthGuardErrorCode, extendContextWithAuth } from '@shadow-library/auth/module';
import { AppError } from '@shadow-library/common';
import { ContextService } from '@shadow-library/fastify';

import { type AccountContext, AccountContextMiddleware } from '@server/modules/auth';

/**
 * Memoir grants no organisation-owned principal anything. The SDK already refuses a bot on every route
 * without `@BotPermission`; the account middleware refuses one explicitly as well, rather than resolving
 * no account and leaving the refusal to whichever handler happens to need one.
 */
const USER: AuthPrincipal = { kind: 'user', sub: 'memoir-user', scopes: [], claims: {} };
const SERVICE: AuthPrincipal = { kind: 'service', sub: 'memoir-worker', clientId: 'memoir-worker', scopes: [], claims: {} };
const BOT: AuthPrincipal = { kind: 'bot', sub: 'bot_42', clientId: 'bot_42', scopes: [], org: '7', botId: '42', keyId: 'key-1', rateLimitPerMinute: 60, claims: {} };

const context = new ContextService();
extendContextWithAuth(context);
const resolveAccount = mock(async () => undefined);
const middleware = new AccountContextMiddleware(context, { resolve: resolveAccount } as unknown as AccountContext);
const handler = middleware.generate({ shadowAuth: { authenticated: true, botPermissions: ['memoir:sync'] } }) as () => Promise<void>;

function runAs(principal: AuthPrincipal): Promise<unknown> {
  return new Promise(resolve => {
    const hook = context.init() as unknown as (request: unknown, response: unknown, done: () => void) => void;
    hook({ id: 'account-context-rid' }, {}, () => {
      context.set(AUTH_PRINCIPAL, principal);
      handler().then(() => resolve(undefined), resolve);
    });
  });
}

describe('AccountContextMiddleware', () => {
  it('should refuse a bot principal with 403 without resolving an account', async () => {
    resolveAccount.mockClear();
    const error = await runAs(BOT);

    expect(AppError.is(error, AuthGuardErrorCode.IAM_002)).toBe(true);
    expect((error as AppError).status).toBe(403);
    expect(resolveAccount).not.toHaveBeenCalled();
  });

  it('should resolve an account for a user and nothing for a service', async () => {
    resolveAccount.mockClear();
    expect(await runAs(USER)).toBeUndefined();
    expect(await runAs(SERVICE)).toBeUndefined();
    expect(resolveAccount).toHaveBeenCalledTimes(1);
  });
});
