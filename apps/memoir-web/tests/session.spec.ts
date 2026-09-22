import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it } from 'bun:test';
import { isRedirect } from '@tanstack/react-router';

import { accountKeys } from '@/lib/data';
import { ONBOARDING_PATH, onboardingBootQuery, routeByOnboarding, seedOnboardingStatus } from '@/lib/session';

import { httpFake, restoreFetch } from './http-fake';

const ACCOUNT_ID = 'usr_A';

afterEach(restoreFetch);

describe('routeByOnboarding', () => {
  it('should leave a failed account read to the client gate', async () => {
    httpFake({ 'GET /api/v1/account': () => ({ status: 500, body: { code: 'UNKNOWN', type: 'UnknownError', message: 'Unknown Error' } }) });

    await expect(routeByOnboarding(new QueryClient(), ACCOUNT_ID, '/finance')).resolves.toBeUndefined();
  });

  it('should redirect a not-onboarded owner away from a non-onboarding path', async () => {
    httpFake({ 'GET /api/v1/account': () => ({ body: { id: ACCOUNT_ID, onboardingCompletedAt: null } }) });

    const outcome = await routeByOnboarding(new QueryClient(), ACCOUNT_ID, '/finance').catch((error: unknown) => error);
    expect(isRedirect(outcome)).toBe(true);
    expect(isRedirect(outcome) && outcome.options.to).toBe(ONBOARDING_PATH);
  });

  it('should send an onboarded owner away from onboarding home', async () => {
    httpFake({ 'GET /api/v1/account': () => ({ body: { id: ACCOUNT_ID, onboardingCompletedAt: '2026-01-01T00:00:00.000Z' } }) });

    const outcome = await routeByOnboarding(new QueryClient(), ACCOUNT_ID, ONBOARDING_PATH).catch((error: unknown) => error);
    expect(isRedirect(outcome)).toBe(true);
    expect(isRedirect(outcome) && outcome.options.to).toBe('/');
  });

  it('should cache the answer per account instead of re-fetching on the next call', async () => {
    const fake = httpFake({ 'GET /api/v1/account': () => ({ body: { id: ACCOUNT_ID, onboardingCompletedAt: '2026-01-01T00:00:00.000Z' } }) });
    const queryClient = new QueryClient();

    await routeByOnboarding(queryClient, ACCOUNT_ID, '/finance');
    await routeByOnboarding(queryClient, ACCOUNT_ID, '/finance');

    expect(fake.count('GET', '/api/v1/account')).toBe(1);
  });

  it('should keep one account’s cached answer from leaking into another’s', async () => {
    const queryClient = new QueryClient();
    httpFake({ 'GET /api/v1/account': () => ({ body: { id: 'usr_A', onboardingCompletedAt: null } }) });
    await expect(routeByOnboarding(queryClient, 'usr_A', ONBOARDING_PATH)).resolves.toEqual({ completed: false });

    httpFake({ 'GET /api/v1/account': () => ({ body: { id: 'usr_B', onboardingCompletedAt: '2026-01-01T00:00:00.000Z' } }) });
    await routeByOnboarding(queryClient, 'usr_B', '/finance');

    await expect(routeByOnboarding(queryClient, 'usr_A', '/finance').catch((error: unknown) => error)).resolves.toEqual({ completed: false });
  });
});

describe('seedOnboardingStatus', () => {
  it('should not hand a stale not-onboarded answer to the client gate', () => {
    const routerClient = new QueryClient();
    const memoirClient = new QueryClient();
    routerClient.setQueryData(onboardingBootQuery(ACCOUNT_ID).queryKey, { completed: false });

    seedOnboardingStatus(routerClient, memoirClient, ACCOUNT_ID);

    expect(memoirClient.getQueryData(accountKeys.onboarding)).toBeUndefined();
  });

  it('should hand a finished setup to the client gate, stamped with when it was fetched', () => {
    const routerClient = new QueryClient();
    const memoirClient = new QueryClient();
    routerClient.setQueryData(onboardingBootQuery(ACCOUNT_ID).queryKey, { completed: true });

    seedOnboardingStatus(routerClient, memoirClient, ACCOUNT_ID);

    expect(memoirClient.getQueryData(accountKeys.onboarding)).toEqual({ completed: true });
    expect(memoirClient.getQueryState(accountKeys.onboarding)?.dataUpdatedAt).toBe(routerClient.getQueryState(onboardingBootQuery(ACCOUNT_ID).queryKey)?.dataUpdatedAt);
  });
});
