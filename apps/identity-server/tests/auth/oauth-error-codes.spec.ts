import { describe, expect, it } from 'bun:test';

import { type FastifyReply, type FastifyRequest } from 'fastify';
import { AppError } from '@shadow-library/common';

import { AppErrorCode } from '@server/classes';
import { type JwtClaims, type KeyService } from '@server/modules/auth/keys';
import { OAuthController } from '@server/modules/auth/oauth/oauth.controller';
import { type OAuthService } from '@server/modules/auth/oauth/oauth.service';

import { buildOAuthService } from './oauth-harness';
import { fakeReply, withinRequest } from './request-context';

const inAnHour = (): number => Math.floor(Date.now() / 1000) + 3600;
const TOKENS: Record<string, JwtClaims> = {
  user: { sub: '42', token_type: 'user', client_id: 'third-party-app', scope: 'openid', exp: inAnHour() },
  expired: { sub: '42', token_type: 'user', client_id: 'third-party-app', scope: 'openid', exp: 1 },
  service: { sub: 'novel-forge', token_type: 'service', client_id: 'novel-forge', exp: inAnHour() },
};

function controllerWith(): OAuthController {
  const keyService = { verify: (token: string) => TOKENS[token] ?? null } as unknown as KeyService;
  const oauthService = { consumeUserInfoBudget: () => Promise.resolve() } as unknown as OAuthService;
  const userEmailService = { getPrimaryEmail: () => Promise.resolve(null) };
  return new OAuthController(oauthService, {} as never, {} as never, keyService, userEmailService as never, {} as never);
}

async function userinfo(authorization?: string): Promise<{ error: unknown; challenge?: string }> {
  const reply = fakeReply();
  const request = { headers: authorization ? { authorization } : {} } as unknown as FastifyRequest;
  const error = await controllerWith()
    .getUserInfo(request, reply as unknown as FastifyReply)
    .then(
      () => null,
      (failure: unknown) => failure,
    );
  return { error, challenge: reply.headers.get('www-authenticate') };
}

describe('OAuthController userinfo', () => {
  it('should answer a bad bearer with invalid_token and a Bearer challenge naming it', async () => {
    for (const bearer of ['Bearer not-a-token', 'Bearer expired', 'Bearer service']) {
      const { error, challenge } = await userinfo(bearer);
      expect(AppError.is(error, AppErrorCode.OAU_007)).toBe(true);
      expect(error).toMatchObject({ code: 'invalid_token', status: 401 });
      expect(challenge).toBe('Bearer error="invalid_token"');
    }
  });

  it('should challenge a request that presents no bearer without naming an error', async () => {
    const { error, challenge } = await userinfo();
    expect(AppError.is(error, AppErrorCode.OAU_007)).toBe(true);
    expect(challenge).toBe('Bearer');
  });

  it("should release a valid user token's claims", async () => {
    const reply = fakeReply();
    const request = { headers: { authorization: 'Bearer user' } } as unknown as FastifyRequest;
    expect(await controllerWith().getUserInfo(request, reply as unknown as FastifyReply)).toEqual({ sub: '42', email: undefined, email_verified: undefined });
    expect(reply.headers.has('www-authenticate')).toBe(false);
  });
});

describe('OAuthService token grant types', () => {
  it('should refuse an unknown grant_type as unsupported_grant_type', async () => {
    const { service, client } = buildOAuthService();
    const error = await withinRequest(() => service.token({ grantType: 'password' }, { clientId: client.id, clientSecret: 'correct-secret' })).then(
      () => null,
      (failure: unknown) => failure,
    );

    expect(AppError.is(error, AppErrorCode.OAU_008)).toBe(true);
    expect(error).toMatchObject({ code: 'unsupported_grant_type', status: 400 });
  });
});
