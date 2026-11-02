import { afterAll, describe, expect, it } from 'bun:test';

import { setConfig } from '@shadow-library/common/testing';

import { OAuthController } from '@server/modules/auth/oauth/oauth.controller';

import { fakeReply } from './request-context';

describe('OAuthController.getUserInfo', () => {
  afterAll(setConfig({ 'oauth.issuer': 'https://identity.example.com', 'oauth.login-url': 'https://identity.example.com/login' }));

  it('should read the primary email and the profile claims together', async () => {
    const state = { inflight: 0, maxInflight: 0 };
    const read =
      <T>(value: T) =>
      (): Promise<T> => {
        state.maxInflight = Math.max(state.maxInflight, ++state.inflight);
        return Promise.resolve().then(() => (state.inflight--, value));
      };
    const keyService = { verify: () => ({ sub: '42', exp: Math.floor(Date.now() / 1000) + 60, token_type: 'user', client_id: 'app', scope: 'openid profile' }) };
    const oauthService = { consumeUserInfoBudget: () => Promise.resolve() };
    const userEmailService = { getPrimaryEmail: read('ada@example.com') };
    const userService = { getProfileClaims: read({ given_name: 'Ada' }) };
    const controller = new OAuthController(oauthService as never, {} as never, {} as never, keyService as never, userEmailService as never, userService as never);

    const info = await controller.getUserInfo({ headers: { authorization: 'Bearer token' } } as never, fakeReply() as never);

    expect(info).toEqual({ sub: '42', email: 'ada@example.com', email_verified: true, given_name: 'Ada' });
    expect(state.maxInflight).toBe(2);
  });
});
