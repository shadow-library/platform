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

interface QueuedResponse {
  status: number;
  body: unknown;
}

/**
 * Declaring the constants
 *
 * All page suites share ONE happy-dom register cycle: react-dom's scheduler captures its
 * MessageChannel from the window alive at first import, so a re-registered window silently
 * stops flushing async state updates. State (URL, cookies) resets per test instead.
 */
const AUTHORIZE_URL =
  'https://identity.shadow-apps.com/oauth2/authorize?client_id=11111111-2222-3333-4444-555555555555&redirect_uri=https%3A%2F%2Fapp.example.com%2Fcb&response_type=code&scope=openid%20email&state=xyz';

GlobalRegistrator.register({ url: 'https://identity.shadow-apps.com/login' });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Optional peer of @shadow-library/ui reached only by the unused useSearchParams hook; the test
// runtime resolves the full module graph eagerly, so satisfy it with an empty stand-in.
mock.module('@tanstack/react-router', () => ({ useRouter: () => null }));

const { cleanup, fireEvent, render, waitFor } = await import('@testing-library/react');
const { createElement } = await import('react');
const { LoginPage } = await import('../pages/login-page');
const { ConsentPage } = await import('../pages/consent-page');

const queue: QueuedResponse[] = [];
const calls: { path: string; body?: unknown }[] = [];
const originalFetch = globalThis.fetch;

const stubFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const next = queue.shift();
  if (!next) throw new Error(`Unexpected request: ${String(input)}`);
  calls.push({ path: String(input), body: init?.body ? JSON.parse(String(init.body)) : undefined });
  return new Response(JSON.stringify(next.body), { status: next.status, headers: { 'content-type': 'application/json' } });
}) as typeof fetch;

afterAll(() => {
  GlobalRegistrator.unregister();
});

describe('LoginPage', () => {
  beforeEach(() => {
    globalThis.fetch = stubFetch;
    queue.length = 0;
    calls.length = 0;
    // Other DOM suites share this happy-dom window: drop their session hint and URL so the
    // consent-forwarding effect on the login page stays dormant.
    document.cookie = 'isLoggedIn=false; max-age=0';
    (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM.setURL('https://identity.shadow-apps.com/login');
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
  });

  type View = ReturnType<typeof render>;

  const typeIdentifier = async (value: string): Promise<View> => {
    const view = render(createElement(LoginPage));
    fireEvent.input(view.getByLabelText('Email or phone'), { target: { value } });
    fireEvent.submit(view.getByLabelText('Email or phone').closest('form') as HTMLFormElement);
    await waitFor(() => expect(calls.length).toBe(1));
    return view;
  };

  it('should advance from identifier to the password step', async () => {
    queue.push({ status: 200, body: { flowId: 'flow_1', status: 'AWAITING_PASSWORD', hasAlternativeMethods: true } });
    const view = await typeIdentifier('jane@example.com');

    expect(calls[0]?.path).toBe('/api/v1/auth/login/init');
    expect((calls[0]?.body as { identifier: string }).identifier).toBe('jane@example.com');
    await waitFor(() => expect(view.getByLabelText('Password')).toBeTruthy());
  });

  it('should surface a rejected password with the remaining budget', async () => {
    queue.push({ status: 200, body: { flowId: 'flow_1', status: 'AWAITING_PASSWORD' } });
    const view = await typeIdentifier('jane@example.com');

    queue.push({ status: 401, body: { flowId: 'flow_1', status: 'AWAITING_PASSWORD', attemptsLeft: 2 } });
    const passwordInput = await waitFor(() => view.getByLabelText('Password'));
    fireEvent.input(passwordInput, { target: { value: 'wrong-password' } });
    fireEvent.submit(passwordInput.closest('form') as HTMLFormElement);

    await waitFor(() => expect(view.getByText(/2 attempts left/)).toBeTruthy());
  });

  it('should walk into the mfa step when the password answer continues the flow', async () => {
    queue.push({ status: 200, body: { flowId: 'flow_1', status: 'AWAITING_PASSWORD' } });
    const view = await typeIdentifier('jane@example.com');

    queue.push({ status: 200, body: { flowId: 'flow_1', status: 'AWAITING_TOTP', attemptsLeft: 3 } });
    const passwordInput = await waitFor(() => view.getByLabelText('Password'));
    fireEvent.input(passwordInput, { target: { value: 'correct-password' } });
    fireEvent.submit(passwordInput.closest('form') as HTMLFormElement);

    await waitFor(() => expect(view.getByText('Two-step verification')).toBeTruthy());
    expect(view.queryByText(/attempts left/)).toBeNull();
  });

  it('should offer a restart when the flow has expired', async () => {
    queue.push({ status: 200, body: { flowId: 'flow_1', status: 'AWAITING_PASSWORD' } });
    const view = await typeIdentifier('jane@example.com');

    queue.push({ status: 410, body: { code: 'AUTH_001', type: 'NOT_FOUND', message: 'flow expired' } });
    const passwordInput = await waitFor(() => view.getByLabelText('Password'));
    fireEvent.input(passwordInput, { target: { value: 'anything' } });
    fireEvent.submit(passwordInput.closest('form') as HTMLFormElement);

    await waitFor(() => expect(view.getByText('Start over')).toBeTruthy());
  });

  it('should show the admin-forced reset hand-off', async () => {
    queue.push({ status: 200, body: { flowId: 'flow_1', status: 'AWAITING_PASSWORD' } });
    const view = await typeIdentifier('jane@example.com');

    queue.push({ status: 401, body: { flowId: 'flow_1', status: 'PASSWORD_RESET_REQUIRED', attemptsLeft: 0 } });
    const passwordInput = await waitFor(() => view.getByLabelText('Password'));
    fireEvent.input(passwordInput, { target: { value: 'correct-password' } });
    fireEvent.submit(passwordInput.closest('form') as HTMLFormElement);

    await waitFor(() => expect(view.getByText('Password reset required')).toBeTruthy());
    expect(view.getByText('Reset password')).toBeTruthy();
  });
});

describe('ConsentPage', () => {
  beforeEach(() => {
    globalThis.fetch = stubFetch;
    queue.length = 0;
    calls.length = 0;
    document.cookie = 'isLoggedIn=true';
    // location.assign in a previous test navigates the shared happy-dom window; reset the URL.
    (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM.setURL(`https://identity.shadow-apps.com/consent?return_to=${encodeURIComponent(AUTHORIZE_URL)}`);
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
  });

  it('should describe the requesting client and its scopes from the server', async () => {
    queue.push({
      status: 200,
      body: {
        clientName: 'Acme Analytics',
        isFirstParty: false,
        alreadyGranted: false,
        scopes: [
          { name: 'openid', description: 'Confirm your identity', isSensitive: false },
          { name: 'email', description: 'Read your primary email address', isSensitive: true },
        ],
      },
    });
    const view = render(createElement(ConsentPage));

    await waitFor(() => expect(view.getByText('Acme Analytics wants to access your account')).toBeTruthy());
    expect(calls[0]?.path).toContain('/api/v1/auth/consent?clientId=11111111-2222-3333-4444-555555555555');
    expect(view.getByText('Read your primary email address')).toBeTruthy();
    expect(view.getByText('Sensitive')).toBeTruthy();
  });

  it('should post the approval with every requested scope', async () => {
    queue.push({
      status: 200,
      body: {
        clientName: 'Acme Analytics',
        isFirstParty: false,
        alreadyGranted: false,
        scopes: [
          { name: 'openid', isSensitive: false },
          { name: 'email', isSensitive: false },
        ],
      },
    });
    const view = render(createElement(ConsentPage));
    await waitFor(() => expect(view.getByText('Allow access')).toBeTruthy());

    queue.push({ status: 200, body: { decision: 'APPROVE' } });
    fireEvent.click(view.getByText('Allow access'));

    await waitFor(() => expect(calls.length).toBe(2));
    const decision = calls[1]?.body as { decision: string; scopeNames: string[]; state?: string };
    expect(decision.decision).toBe('APPROVE');
    expect(decision.scopeNames).toEqual(['openid', 'email']);
  });

  it('should send denials with the redirect details for server-side validation', async () => {
    queue.push({
      status: 200,
      body: { clientName: 'Acme Analytics', isFirstParty: false, alreadyGranted: false, scopes: [{ name: 'openid', isSensitive: false }] },
    });
    const view = render(createElement(ConsentPage));
    await waitFor(() => expect(view.getByText('Deny')).toBeTruthy());

    queue.push({ status: 200, body: { decision: 'DENY', redirectTo: 'https://app.example.com/cb?error=access_denied&state=xyz' } });
    fireEvent.click(view.getByText('Deny'));

    await waitFor(() => expect(calls.length).toBe(2));
    const decision = calls[1]?.body as { decision: string; redirectUri?: string; state?: string };
    expect(decision.decision).toBe('DENY');
    expect(decision.redirectUri).toBe('https://app.example.com/cb');
    expect(decision.state).toBe('xyz');
  });
});
