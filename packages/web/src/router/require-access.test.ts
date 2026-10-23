import { QueryClient, queryOptions } from '@tanstack/react-query';
import { isRedirect } from '@tanstack/react-router';
import { describe, expect, it } from 'bun:test';

import { type AuthAccess, type AuthPrincipal } from '../auth';
import { ApiError } from '../lib/api-error';
import { requireAccess, resolveAccessMode } from './require-access';

const PRINCIPAL: AuthPrincipal = { sub: 'user-1', scopes: [] };
const GATE = { loginTo: '/login', returnTo: '/library' };

function setup(access: () => Promise<AuthAccess>, session: () => Promise<AuthPrincipal>) {
  const queryClient = new QueryClient();
  let sessionCalls = 0;
  const options = {
    ...GATE,
    access: queryOptions({ queryKey: ['access'], queryFn: access, retry: false, staleTime: Infinity }),
    session: queryOptions({
      queryKey: ['session'],
      queryFn: () => {
        sessionCalls += 1;
        return session();
      },
      retry: false,
    }),
  };
  return { queryClient, options, sessionCalls: () => sessionCalls };
}

const unauthenticated = () => Promise.reject(new ApiError(401, { code: 'IAM_001', type: 'Error', message: 'Unauthenticated' }));
const signedIn = () => Promise.resolve(PRINCIPAL);

describe('requireAccess', () => {
  it('should resolve a public deployment without reading the session', async () => {
    const { queryClient, options, sessionCalls } = setup(() => Promise.resolve({ mode: 'public' }), signedIn);

    expect(await requireAccess(queryClient, options)).toEqual({ mode: 'public' });
    expect(sessionCalls()).toBe(0);
  });

  it('should resolve a public deployment for a signed-out guest', async () => {
    const { queryClient, options } = setup(() => Promise.resolve({ mode: 'public' }), unauthenticated);

    expect(await requireAccess(queryClient, options)).toEqual({ mode: 'public' });
  });

  it('should return the session of a signed-in visitor on a private deployment', async () => {
    const { queryClient, options } = setup(() => Promise.resolve({ mode: 'private' }), signedIn);

    expect(await requireAccess(queryClient, options)).toEqual({ mode: 'private', session: PRINCIPAL });
  });

  it('should redirect a signed-out visitor to login with a returnTo on a private deployment', async () => {
    const { queryClient, options } = setup(() => Promise.resolve({ mode: 'private' }), unauthenticated);

    const thrown = await requireAccess(queryClient, options).catch((error: unknown) => error);

    expect(isRedirect(thrown)).toBe(true);
    expect(thrown).toMatchObject({ options: { to: '/login', search: { returnTo: '/library' } } });
  });

  it('should fail closed when the access mode cannot be read', async () => {
    const { queryClient, options } = setup(() => Promise.reject(new ApiError(503, { code: 'DOWN', type: 'Error', message: 'down' })), unauthenticated);

    const thrown = await requireAccess(queryClient, options).catch((error: unknown) => error);

    expect(isRedirect(thrown)).toBe(true);
  });

  it('should fail closed on a network error yet still serve a signed-in visitor', async () => {
    const { queryClient, options } = setup(() => Promise.reject(new TypeError('fetch failed')), signedIn);

    expect(await requireAccess(queryClient, options)).toEqual({ mode: 'private', session: PRINCIPAL });
  });

  it('should fail closed when the access mode is unrecognised', async () => {
    for (const body of [{}, { mode: 'PRIVATE' }, null]) {
      const { queryClient, options } = setup(() => Promise.resolve(body as unknown as AuthAccess), signedIn);

      expect(await requireAccess(queryClient, options)).toEqual({ mode: 'private', session: PRINCIPAL });
    }
  });

  it('should not pin a failed access read, so a later call can resolve public', async () => {
    let accessCalls = 0;
    const { queryClient, options } = setup(() => {
      accessCalls += 1;
      return accessCalls === 1 ? Promise.reject(new TypeError('fetch failed')) : Promise.resolve({ mode: 'public' });
    }, signedIn);

    expect((await requireAccess(queryClient, options)).mode).toBe('private');
    expect(await requireAccess(queryClient, options)).toEqual({ mode: 'public' });
  });

  it('should reuse a cached access mode instead of fetching it again', async () => {
    let accessCalls = 0;
    const { queryClient, options } = setup(() => {
      accessCalls += 1;
      return Promise.resolve({ mode: 'public' });
    }, signedIn);

    await requireAccess(queryClient, options);
    await requireAccess(queryClient, options);

    expect(accessCalls).toBe(1);
  });
});

describe('resolveAccessMode', () => {
  const resolve = (access: () => Promise<AuthAccess>) => resolveAccessMode(new QueryClient(), queryOptions({ queryKey: ['access'], queryFn: access, retry: false }));

  it('should read an exact public answer as public', async () => {
    expect(await resolve(() => Promise.resolve({ mode: 'public' }))).toBe('public');
  });

  it('should read a failed or unrecognised answer as private without rejecting', async () => {
    expect(await resolve(() => Promise.reject(new TypeError('fetch failed')))).toBe('private');
    expect(await resolve(() => Promise.resolve({ mode: 'PUBLIC' } as unknown as AuthAccess))).toBe('private');
  });
});
