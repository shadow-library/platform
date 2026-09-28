import { describe, expect, it } from 'bun:test';

import { AppError } from '@shadow-library/common';

import { AppErrorCode } from '@server/classes';
import {
  GENERAL_LIMIT,
  IP_GENERAL_BUCKET,
  M2M_CLIENT_BUCKET,
  M2M_CLIENT_LIMIT,
  OAUTH_PUBLIC_CLIENT_BUCKET,
  OAUTH_PUBLIC_CLIENT_LIMIT,
} from '@server/modules/infrastructure/security/security.constants';

import { buildOAuthService } from './oauth-harness';
import { fakeReply, withinRequest } from './request-context';

const CLIENT_CREDENTIALS = { grantType: 'client_credentials', scope: '' };

async function refusal(work: () => Promise<unknown>): Promise<unknown> {
  return work().then(
    () => null,
    (error: unknown) => error,
  );
}

describe('OAuthService client budgets', () => {
  it('should tell a confidential client refused by its own budget when to retry', async () => {
    const { service, client, redis } = buildOAuthService();
    await redis.set(`rl:${M2M_CLIENT_BUCKET}:${client.id}`, String(M2M_CLIENT_LIMIT), 'EX', 40);
    const reply = fakeReply();

    const error = await withinRequest(() => refusal(() => service.token(CLIENT_CREDENTIALS, { clientId: client.id, clientSecret: 'correct-secret' })), reply);

    expect(AppError.is(error, AppErrorCode.SEC_001)).toBe(true);
    expect(reply.headers.get('retry-after')).toBe('40');
  });

  it('should tell a public client refused for its source address when to retry', async () => {
    const { service, client, redis } = buildOAuthService({ client: { tokenEndpointAuthMethod: 'none', kind: 'SPA_PUBLIC' } });
    await redis.set(`rl:${OAUTH_PUBLIC_CLIENT_BUCKET}:${client.id}:198.51.100.7`, String(OAUTH_PUBLIC_CLIENT_LIMIT), 'EX', 25);
    const reply = fakeReply();

    const error = await withinRequest(() => refusal(() => service.token({ grantType: 'refresh_token', refreshToken: 'junk' }, { clientId: client.id })), reply);

    expect(AppError.is(error, AppErrorCode.SEC_001)).toBe(true);
    expect(reply.headers.get('retry-after')).toBe('25');
  });

  it("should charge userinfo for a confidential client's token to that client, never to the address its pod shares", async () => {
    const { service, client, redis } = buildOAuthService();
    await redis.set(`rl:${IP_GENERAL_BUCKET}:198.51.100.7`, String(GENERAL_LIMIT), 'EX', 30);

    await withinRequest(() => service.consumeUserInfoBudget(client.id));

    expect(await redis.get(`rl:${M2M_CLIENT_BUCKET}:${client.id}`)).toBe('1');
    expect(await redis.get(`rl:${IP_GENERAL_BUCKET}:198.51.100.7`)).toBe(String(GENERAL_LIMIT));
  });

  it("should charge userinfo for a public client's token to the address it comes from", async () => {
    const { service, client, redis } = buildOAuthService({ client: { tokenEndpointAuthMethod: 'none', kind: 'SPA_PUBLIC' } });
    await redis.set(`rl:${IP_GENERAL_BUCKET}:198.51.100.7`, String(GENERAL_LIMIT), 'EX', 30);
    const reply = fakeReply();

    const error = await withinRequest(() => refusal(() => service.consumeUserInfoBudget(client.id)), reply);

    expect(AppError.is(error, AppErrorCode.SEC_001)).toBe(true);
    expect(reply.headers.get('retry-after')).toBe('30');
    expect(await redis.get(`rl:${M2M_CLIENT_BUCKET}:${client.id}`)).toBeNull();
  });

  it('should serve a client still inside its budget without a retry hint', async () => {
    const { service, client } = buildOAuthService();
    const reply = fakeReply();

    const result = await withinRequest(() => service.token(CLIENT_CREDENTIALS, { clientId: client.id, clientSecret: 'correct-secret' }), reply);

    expect(result.tokenType).toBe('Bearer');
    expect(reply.headers.has('retry-after')).toBe(false);
  });
});
