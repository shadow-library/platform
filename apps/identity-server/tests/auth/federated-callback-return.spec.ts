import { beforeAll, describe, expect, it } from 'bun:test';

import { type FastifyReply } from 'fastify';
import { Config } from '@shadow-library/common';

import { type AuthFlowContext } from '@server/modules/auth/flow/auth-flow.service';
import { FederatedController } from '@server/modules/auth/flow/federated.controller';
import { type FlowStepResult } from '@server/modules/auth/flow/flow.types';

const ISSUER = 'https://identity.shadow-apps.com';
const LOGIN_URL = `${ISSUER}/login`;
const RESUME = '/oauth2/authorize?client_id=app&redirect_uri=https%3A%2F%2Fapp.shadow-apps.com%2Fcb&state=s';

interface Landing {
  status?: number;
  location?: string;
}

function loginFlow(returnTo?: string): AuthFlowContext {
  return {
    flowId: 'flow-1',
    kind: 'LOGIN',
    status: 'AWAITING_FEDERATED',
    returnTo,
    federated: { identityProviderId: 'idp-1', codeVerifier: 'verifier', nonce: 'nonce' },
  } as unknown as AuthFlowContext;
}

async function callback(flow: AuthFlowContext | null, outcome: FlowStepResult | Error, query: { code?: string; error?: string } = { code: 'code' }): Promise<Landing> {
  const authFlowService = { get: () => Promise.resolve(flow) };
  const identityProviderService = { getById: () => Promise.resolve({ isActive: true }) };
  const upstreamOidcService = { exchangeAndVerify: () => Promise.resolve({ subject: 'upstream-1' }) };
  const loginService = { continueFederated: () => (outcome instanceof Error ? Promise.reject(outcome) : Promise.resolve(outcome)) };
  const controller = new FederatedController(authFlowService as never, identityProviderService as never, upstreamOidcService as never, loginService as never, {} as never);

  const landing: Landing = {};
  const reply = {
    status: (code: number) => {
      landing.status = code;
      return reply;
    },
    redirect: (location: string) => {
      landing.location = location;
      return reply;
    },
    setCookie: () => reply,
  };
  await controller.handleFederatedCallback({ state: 'flow-1', ...query } as never, reply as unknown as FastifyReply);
  return landing;
}

const loginPage = (location: string | undefined): URL => {
  const url = new URL(location ?? '');
  expect(`${url.origin}${url.pathname}`).toBe(LOGIN_URL);
  return url;
};

describe('FederatedController callback', () => {
  beforeAll(() => {
    Config.load('oauth.issuer', { defaultValue: ISSUER });
    Config.load('oauth.login-url', { defaultValue: LOGIN_URL });
  });

  it('should hand a flow that still needs a second factor back to the login page with its return target', async () => {
    const landing = await callback(loginFlow(RESUME), { outcome: 'CONTINUE', flowId: 'flow-1', status: 'AWAITING_MFA' });
    const url = loginPage(landing.location);
    expect(landing.status).toBe(302);
    expect(url.searchParams.get('flow_id')).toBe('flow-1');
    expect(url.searchParams.get('status')).toBe('AWAITING_MFA');
    expect(url.searchParams.get('returnTo')).toBe(RESUME);
  });

  it('should keep the return target when the callback fails', async () => {
    const url = loginPage((await callback(loginFlow(RESUME), new Error('boom'))).location);
    expect(url.searchParams.get('error')).toBe('federation_failed');
    expect(url.searchParams.get('returnTo')).toBe(RESUME);
  });

  it('should keep the return target when the provider reports an error', async () => {
    const url = loginPage((await callback(loginFlow(RESUME), new Error('unused'), { error: 'access_denied' })).location);
    expect(url.searchParams.get('error')).toBe('federation_failed');
    expect(url.searchParams.get('returnTo')).toBe(RESUME);
  });

  it('should send no return target for an unknown flow or one that named none', async () => {
    expect(loginPage((await callback(null, new Error('unused'))).location).searchParams.has('returnTo')).toBe(false);
    const landing = await callback(loginFlow(), { outcome: 'CONTINUE', flowId: 'flow-1', status: 'AWAITING_MFA' });
    expect(loginPage(landing.location).searchParams.has('returnTo')).toBe(false);
  });

  it('should redirect a completed sign-in straight to its return target', async () => {
    const landing = await callback(loginFlow(RESUME), { outcome: 'COMPLETED', flowId: 'flow-1', cookies: [] });
    expect(landing).toEqual({ status: 302, location: RESUME });
  });

  it('should not follow a destination stored before the sanitizer refused it', async () => {
    for (const stored of ['/\\evil.test', '/\t/evil.test', 'https://evil.test/x']) {
      expect(await callback(loginFlow(stored), { outcome: 'COMPLETED', flowId: 'flow-1', cookies: [] })).toEqual({ status: 302, location: '/account' });
      const landing = await callback(loginFlow(stored), { outcome: 'CONTINUE', flowId: 'flow-1', status: 'AWAITING_MFA' });
      expect(loginPage(landing.location).searchParams.has('returnTo')).toBe(false);
    }
  });
});
