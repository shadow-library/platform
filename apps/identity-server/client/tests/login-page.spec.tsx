/**
 * Importing npm packages
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

import { GlobalRegistrator } from '@happy-dom/global-registrator';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

/**
 * Declaring the constants
 *
 * happy-dom registers before the React imports execute (dynamic imports below), and unregisters
 * in afterAll so the DB-backed server suites in the same process keep Bun's native globals.
 */
GlobalRegistrator.register({ url: 'https://identity.shadow-apps.com/login' });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Optional peer of @shadow-library/ui reached only by the unused useSearchParams hook; the test
// runtime resolves the full module graph eagerly, so satisfy it with an empty stand-in.
mock.module('@tanstack/react-router', () => ({ useRouter: () => null }));

const { cleanup, fireEvent, render, screen, waitFor } = await import('@testing-library/react');
const { createElement } = await import('react');
const { LoginPage } = await import('../pages/login-page');

interface QueuedResponse {
  status: number;
  body: unknown;
}

const queue: QueuedResponse[] = [];
const calls: { path: string; body?: unknown }[] = [];
const originalFetch = globalThis.fetch;

const stubFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const next = queue.shift();
  if (!next) throw new Error(`Unexpected request: ${String(input)}`);
  calls.push({ path: String(input), body: init?.body ? JSON.parse(String(init.body)) : undefined });
  return new Response(JSON.stringify(next.body), { status: next.status, headers: { 'content-type': 'application/json' } });
}) as typeof fetch;

describe('LoginPage', () => {
  beforeEach(() => {
    globalThis.fetch = stubFetch;
    queue.length = 0;
    calls.length = 0;
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
  });

  afterAll(() => {
    GlobalRegistrator.unregister();
  });

  const typeIdentifier = async (value: string): Promise<void> => {
    render(createElement(LoginPage));
    fireEvent.input(screen.getByLabelText('Email or phone'), { target: { value } });
    fireEvent.submit(screen.getByLabelText('Email or phone').closest('form') as HTMLFormElement);
    await waitFor(() => expect(calls.length).toBe(1));
  };

  it('should advance from identifier to the password step', async () => {
    queue.push({ status: 200, body: { flowId: 'flow_1', status: 'AWAITING_PASSWORD', hasAlternativeMethods: true } });
    await typeIdentifier('jane@example.com');

    expect(calls[0]?.path).toBe('/api/v1/auth/login/init');
    expect((calls[0]?.body as { identifier: string }).identifier).toBe('jane@example.com');
    await waitFor(() => expect(screen.getByLabelText('Password')).toBeTruthy());
  });

  it('should surface a rejected password with the remaining budget', async () => {
    queue.push({ status: 200, body: { flowId: 'flow_1', status: 'AWAITING_PASSWORD' } });
    await typeIdentifier('jane@example.com');

    queue.push({ status: 401, body: { flowId: 'flow_1', status: 'AWAITING_PASSWORD', attemptsLeft: 2 } });
    const passwordInput = await waitFor(() => screen.getByLabelText('Password'));
    fireEvent.input(passwordInput, { target: { value: 'wrong-password' } });
    fireEvent.submit(passwordInput.closest('form') as HTMLFormElement);

    await waitFor(() => expect(screen.getByText(/2 attempts left/)).toBeTruthy());
  });

  it('should walk into the mfa step when the password answer continues the flow', async () => {
    queue.push({ status: 200, body: { flowId: 'flow_1', status: 'AWAITING_PASSWORD' } });
    await typeIdentifier('jane@example.com');

    queue.push({ status: 200, body: { flowId: 'flow_1', status: 'AWAITING_TOTP', attemptsLeft: 3 } });
    const passwordInput = await waitFor(() => screen.getByLabelText('Password'));
    fireEvent.input(passwordInput, { target: { value: 'correct-password' } });
    fireEvent.submit(passwordInput.closest('form') as HTMLFormElement);

    await waitFor(() => expect(screen.getByText('Two-step verification')).toBeTruthy());
    expect(screen.queryByText(/attempts left/)).toBeNull();
  });

  it('should offer a restart when the flow has expired', async () => {
    queue.push({ status: 200, body: { flowId: 'flow_1', status: 'AWAITING_PASSWORD' } });
    await typeIdentifier('jane@example.com');

    queue.push({ status: 410, body: { code: 'AUTH_001', type: 'NOT_FOUND', message: 'flow expired' } });
    const passwordInput = await waitFor(() => screen.getByLabelText('Password'));
    fireEvent.input(passwordInput, { target: { value: 'anything' } });
    fireEvent.submit(passwordInput.closest('form') as HTMLFormElement);

    await waitFor(() => expect(screen.getByText('Start over')).toBeTruthy());
  });

  it('should show the admin-forced reset hand-off', async () => {
    queue.push({ status: 200, body: { flowId: 'flow_1', status: 'AWAITING_PASSWORD' } });
    await typeIdentifier('jane@example.com');

    queue.push({ status: 401, body: { flowId: 'flow_1', status: 'PASSWORD_RESET_REQUIRED', attemptsLeft: 0 } });
    const passwordInput = await waitFor(() => screen.getByLabelText('Password'));
    fireEvent.input(passwordInput, { target: { value: 'correct-password' } });
    fireEvent.submit(passwordInput.closest('form') as HTMLFormElement);

    await waitFor(() => expect(screen.getByText('Password reset required')).toBeTruthy());
    expect(screen.getByText('Reset password')).toBeTruthy();
  });
});
