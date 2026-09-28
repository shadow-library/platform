import { afterEach, describe, expect, it } from 'bun:test';
import { ApiError } from '@shadow-library/web';

import { type Command } from '@/lib/data';
import { SyncClient, SyncTransportError } from '@/lib/sync';

import { applied, createTestEngine, failed, waitFor, waitForState } from './sync-harness';

const TODAY = '2026-08-24';
const RETRY_DELAYS_MS = [1, 1, 1];

function settle(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function complete(occurrenceId: string): Command {
  return { type: 'quest.complete', occurrenceId };
}

/** Answers `failures` requests with `status`, then everything normally. */
function failingFor(failures: number, status: number): { status: () => number; requests: () => number } {
  let requests = 0;
  return { status: () => (requests++ < failures ? status : 200), requests: () => requests };
}

describe('SyncEngine retry', () => {
  const engines: { stop: () => void }[] = [];

  afterEach(() => {
    for (const engine of engines.splice(0)) engine.stop();
  });

  it('should flush a command the server refused with S010 without the owner asking again', async () => {
    const server = failingFor(1, 403);
    const { engine } = createTestEngine({ today: TODAY, status: server.status, errorCode: 'S010', retryDelaysMs: RETRY_DELAYS_MS });
    engines.push(engine);

    await engine.enqueue(complete(`walk:${TODAY}`), TODAY);

    await waitForState(engine, snapshot => snapshot.state === 'online' && snapshot.queuedCount === 0);
  });

  it('should resend a queue held by a retryable command failure without the owner asking again', async () => {
    const { engine, server } = createTestEngine({
      today: TODAY,
      retryDelaysMs: RETRY_DELAYS_MS,
      outcomes: (batch, attempt) => batch.commandIds.map(commandId => (attempt === 0 ? failed(commandId) : applied(commandId))),
    });
    engines.push(engine);

    await engine.enqueue(complete(`walk:${TODAY}`), TODAY);

    await waitForState(engine, snapshot => snapshot.state === 'online' && snapshot.queuedCount === 0);
    expect(server.batches).toHaveLength(2);
  });

  it.each([500, 503, 429])('should retry a pass that failed with a %d', async (status: number) => {
    const server = failingFor(1, status);
    const { engine } = createTestEngine({ today: TODAY, status: server.status, retryDelaysMs: RETRY_DELAYS_MS });
    engines.push(engine);

    await engine.start();

    await waitForState(engine, snapshot => snapshot.state === 'online');
  });

  it('should retry a server that could not be reached while the browser reports a connection', async () => {
    let requests = 0;
    const { engine } = createTestEngine({
      today: TODAY,
      retryDelaysMs: RETRY_DELAYS_MS,
      fetchImpl: server => (input, init) => (requests++ === 0 ? Promise.reject(new TypeError('fetch failed')) : server.fetchImpl(input, init)),
    });
    engines.push(engine);

    await engine.start();

    await waitForState(engine, snapshot => snapshot.state === 'online');
  });

  it('should give up after its bounded attempts rather than retry forever', async () => {
    const server = failingFor(Number.POSITIVE_INFINITY, 503);
    const { engine } = createTestEngine({ today: TODAY, status: server.status, retryDelaysMs: RETRY_DELAYS_MS });
    engines.push(engine);

    await engine.start();
    await waitFor(() => server.requests() === RETRY_DELAYS_MS.length + 1);
    await settle(3);

    expect(server.requests()).toBe(RETRY_DELAYS_MS.length + 1);
    expect(engine.getSnapshot().state).toBe('failed');
  });

  it('should not retry a refusal a resend cannot fix', async () => {
    const server = failingFor(Number.POSITIVE_INFINITY, 400);
    const { engine } = createTestEngine({ today: TODAY, status: server.status, retryDelaysMs: RETRY_DELAYS_MS });
    engines.push(engine);

    await engine.start();
    await settle(3);

    expect(server.requests()).toBe(1);
  });

  it('should not retry an expired session', async () => {
    const server = failingFor(Number.POSITIVE_INFINITY, 401);
    const { engine } = createTestEngine({ today: TODAY, status: server.status, retryDelaysMs: RETRY_DELAYS_MS });
    engines.push(engine);

    await engine.start();
    await settle(3);

    expect(server.requests()).toBe(1);
    expect(engine.getSnapshot().state).toBe('signed-out');
  });

  it('should stop retrying once the engine stops', async () => {
    const server = failingFor(Number.POSITIVE_INFINITY, 503);
    const { engine } = createTestEngine({ today: TODAY, status: server.status, retryDelaysMs: [1] });

    await engine.start();
    engine.stop();
    await settle(3);

    expect(server.requests()).toBe(1);
  });

  it('should wait out a Retry-After longer than its own backoff before retrying a 429', async () => {
    const server = failingFor(1, 429);
    const { engine } = createTestEngine({ today: TODAY, status: server.status, retryAfter: '1', retryDelaysMs: RETRY_DELAYS_MS });
    engines.push(engine);

    await engine.start();
    await settle(3);

    expect(server.requests()).toBe(1);
  });
});

describe('SyncEngine retry of a failed session check', () => {
  const engines: { stop: () => void }[] = [];

  afterEach(() => {
    for (const engine of engines.splice(0)) engine.stop();
  });

  function principalFailingOnce(failure: ApiError): { principal: () => Promise<string>; calls: () => number } {
    let calls = 0;
    return {
      principal: async () => {
        calls += 1;
        if (calls === 1) throw failure;
        return 'account-1';
      },
      calls: () => calls,
    };
  }

  it.each([
    ['a 503', new ApiError(503, { code: 'S001', type: 'ServiceUnavailable', message: 'down' })],
    ['an unreachable server', new ApiError(-1, { code: 'NETWORK_ERROR', type: 'NetworkError', message: 'Unable to reach the server' })],
  ])('should retry a pass whose session check failed with %s', async (_label, failure) => {
    const session = principalFailingOnce(failure);
    const { engine } = createTestEngine({ today: TODAY, accountId: 'account-1', principal: session.principal, retryDelaysMs: RETRY_DELAYS_MS });
    engines.push(engine);

    await engine.start();

    await waitForState(engine, snapshot => snapshot.state === 'online');
  });

  it('should not retry a session check the server refused as signed out', async () => {
    const session = principalFailingOnce(new ApiError(401, { code: 'IAM_001', type: 'Unauthorized', message: 'expired' }));
    const { engine } = createTestEngine({ today: TODAY, accountId: 'account-1', principal: session.principal, retryDelaysMs: RETRY_DELAYS_MS });
    engines.push(engine);

    await engine.start();
    await settle(3);

    expect(session.calls()).toBe(1);
    expect(engine.getSnapshot().state).toBe('signed-out');
  });
});

describe('SyncTransportError retryAfterMs', () => {
  it.each([
    ['delay-seconds', () => '120', 120_000],
    ['zero', () => '0', 0],
    ['an HTTP date', () => new Date(Date.now() + 30_000).toUTCString(), 30_000],
  ])('should read Retry-After given as %s', async (_label, retryAfter, expected) => {
    const header = retryAfter();
    const client = new SyncClient({ fetchImpl: async () => new Response('{}', { status: 429, headers: { 'retry-after': header } }) });

    const failure = await client.pullDelta({ since: '0' }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(SyncTransportError);
    expect(Math.abs(((failure as SyncTransportError).retryAfterMs ?? -1) - expected)).toBeLessThan(1_500);
  });

  it('should carry no delay when the header is missing or unreadable', async () => {
    const answers: Record<string, string>[] = [{}, { 'retry-after': 'soon' }];
    for (const headers of answers) {
      const client = new SyncClient({ fetchImpl: async () => new Response('{}', { status: 503, headers }) });
      const failure = (await client.pullDelta({ since: '0' }).catch((error: unknown) => error)) as SyncTransportError;
      expect(failure.retryAfterMs).toBeNull();
    }
  });
});
