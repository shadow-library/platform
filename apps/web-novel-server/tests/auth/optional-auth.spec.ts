import { describe, expect, it, spyOn } from 'bun:test';

import { AuthClient, type AuthPrincipal } from '@shadow-library/auth';
import { type AppSessionService, extendContextWithAuth } from '@shadow-library/auth/module';
import { ContextService, type HttpRequest } from '@shadow-library/fastify';

import { OptionalAuthResolver } from '@modules/auth';

import { AUDIENCE, idp, userToken, WEB_NOVEL_CLIENT_ID, WEB_NOVEL_CLIENT_SECRET } from '../test-idp';

/**
 * The public catalog resolves a reader when one is presented and never refuses anyone. A bot is not a
 * reader: its key must not be exchanged at identity, and a bot token that verifies must still leave
 * the request anonymous.
 */
const context = new ContextService();
extendContextWithAuth(context);

const client = new AuthClient({ issuer: idp.issuer, audience: AUDIENCE, client: { id: WEB_NOVEL_CLIENT_ID, secret: WEB_NOVEL_CLIENT_SECRET } });
const sessions = { readHandle: () => undefined } as unknown as AppSessionService;
const resolver = new OptionalAuthResolver(client, context, sessions);
const handler = resolver.generate({ path: '/api/novels/:slug' }) as unknown as (request: HttpRequest) => Promise<void>;

function resolvePrincipal(bearer: string): Promise<AuthPrincipal | null> {
  const request = { headers: { authorization: `Bearer ${bearer}` } } as unknown as HttpRequest;
  return new Promise((resolve, reject) => {
    const hook = context.init() as unknown as (request: unknown, response: unknown, done: () => void) => void;
    hook({ id: 'optional-auth-rid' }, {}, () => {
      handler(request)
        .then(() => resolve(context.getAuthPrincipalOrNull()))
        .catch(reject);
    });
  });
}

describe('OptionalAuthResolver', () => {
  it('should resolve a reader from a user token', async () => {
    expect(await resolvePrincipal(await userToken('reader-1'))).toMatchObject({ kind: 'user', sub: 'reader-1' });
  });

  it('should treat a bot key as anonymous without exchanging it', async () => {
    const verify = spyOn(client, 'verify');
    const resolveBotKey = spyOn(client, 'resolveBotKey');
    const exchangesBefore = idp.getBotKeyExchangeCount();

    expect(await resolvePrincipal(idp.issueBotKey({ botId: 'catalog-bot', org: '7' }))).toBeNull();
    expect(verify).not.toHaveBeenCalled();
    expect(resolveBotKey).not.toHaveBeenCalled();
    expect(idp.getBotKeyExchangeCount()).toBe(exchangesBefore);

    verify.mockRestore();
    resolveBotKey.mockRestore();
  });

  it('should treat a bot token presented directly as anonymous', async () => {
    expect(await resolvePrincipal(await idp.mintBotToken({ botId: 'catalog-bot', org: '7', audience: AUDIENCE }))).toBeNull();
  });
});
