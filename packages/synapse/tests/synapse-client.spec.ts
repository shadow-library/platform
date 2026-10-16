import { afterEach, beforeEach, describe, expect, it, setSystemTime } from 'bun:test';

import { AppError, ErrorCode } from '@shadow-library/common';
import { isSynapseErrorCode, type SynapseChatRequest, SynapseClient, SynapseError } from '@shadow-library/synapse';

import { ConnectionRefusedError, failingBody, FakeAuthClient, FakeSynapse, json, text } from './fakes';
import { CHAT_COMPLETION } from './fixtures/synapse-responses';

const request = (overrides: Partial<SynapseChatRequest['synapse']> = {}): SynapseChatRequest => ({
  model: 'novel-forge.chat',
  messages: [{ role: 'user', content: 'Hi' }],
  synapse: { subject: { type: 'owner', id: '7' }, selectors: { tier: 'balanced' }, ...overrides },
});

const rejection = async (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    () => expect.unreachable(),
    (error: unknown) => error,
  );

describe('SynapseClient', () => {
  let auth: FakeAuthClient;
  let synapse: FakeSynapse;
  let client: SynapseClient;

  beforeEach(() => {
    auth = new FakeAuthClient();
    synapse = new FakeSynapse();
    client = new SynapseClient({ authClient: auth, fetch: synapse.fetch });
  });

  afterEach(() => {
    delete process.env.SERVICE_URL_SYNAPSE_SERVER;
    delete process.env.SERVICE_URL_SYNAPSE_STAGING;
  });

  it('should resolve the base url through service discovery, honouring an override set after construction', () => {
    expect(client.baseUrl).toBe('http://synapse-server/api/v1');
    process.env.SERVICE_URL_SYNAPSE_SERVER = 'http://synapse-server.synapse';
    expect(client.baseUrl).toBe('http://synapse-server.synapse/api/v1');
    process.env.SERVICE_URL_SYNAPSE_STAGING = 'https://synapse.test';
    expect(new SynapseClient({ authClient: auth, serviceName: 'synapse-staging' }).baseUrl).toBe('https://synapse.test/api/v1');
  });

  it('should post the chat body to the task route with stream off and the envelope intact', async () => {
    synapse.reply(json(CHAT_COMPLETION));
    const response = await client.chat(request());

    expect(response.synapse.alias).toBe('opus');
    expect(synapse.requests[0]).toMatchObject({ url: 'http://synapse-server/api/v1/chat/completions', method: 'POST' });
    expect(synapse.requests[0]?.body).toMatchObject({
      model: 'novel-forge.chat',
      stream: false,
      synapse: { subject: { type: 'owner', id: '7' }, selectors: { tier: 'balanced' } },
    });
  });

  it('should fill a fresh request_id on every call that omits one, and keep one the caller gave', async () => {
    synapse.reply(json(CHAT_COMPLETION), json(CHAT_COMPLETION), json(CHAT_COMPLETION));
    const body = request();
    await client.chat(body);
    await client.chat(body);
    await client.chat(request({ request_id: 'caller-chosen' }));

    const ids = synapse.requests.map(sent => (sent.body?.synapse as { request_id: string }).request_id);
    expect(ids[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(ids[1]).toMatch(/^[0-9a-f-]{36}$/);
    expect(ids[0]).not.toBe(ids[1]);
    expect(ids[2]).toBe('caller-chosen');
    expect(body.synapse.request_id).toBeUndefined();
  });

  it('should ask the token source for a synapse token on every request', async () => {
    synapse.reply(json(CHAT_COMPLETION), json({ data: [], synapse: {} }));
    await client.chat(request());
    await client.embed({ model: 'novel-forge.embedding', input: 'x', synapse: request().synapse });

    expect(auth.requests).toEqual([
      { resource: 'api://synapse', scopes: ['synapse:infer', 'synapse:catalog:read'] },
      { resource: 'api://synapse', scopes: ['synapse:infer', 'synapse:catalog:read'] },
    ]);
    expect(synapse.requests.map(sent => sent.headers.get('authorization'))).toEqual(['Bearer token-1', 'Bearer token-2']);
    expect(synapse.requests[1]?.url).toBe('http://synapse-server/api/v1/embeddings');
  });

  it('should retry a refused connection once with the same body', async () => {
    synapse.refuseConnection().reply(json(CHAT_COMPLETION));
    await client.chat(request());

    expect(synapse.requests).toHaveLength(2);
    expect(synapse.requests[1]?.body).toEqual(synapse.requests[0]?.body as Record<string, unknown>);
  });

  it('should give up after the one retry with the common network error', async () => {
    synapse.refuseConnection(2);
    const error = await rejection(client.chat(request()));

    expect(AppError.is(error, ErrorCode.API_REQUEST_NETWORK_ERROR)).toBe(true);
    expect((error as AppError).cause).toBeInstanceOf(ConnectionRefusedError);
    expect(synapse.requests).toHaveLength(2);
  });

  it('should let an abort while reading an error body surface as the abort', async () => {
    synapse.reply(failingBody(503, '{"error":', new DOMException('aborted', 'AbortError')));
    const error = await rejection(client.chat(request()));

    expect((error as Error).name).toBe('AbortError');
  });

  it('should still raise the status when an error body cannot be read for another reason', async () => {
    synapse.reply(failingBody(503, '{"error":', new TypeError('terminated')));
    const error = await rejection(client.chat(request()));

    expect(error).toMatchObject({ status: 503, code: ErrorCode.API_REQUEST_FAILED.code });
  });

  it('should never retry an answered request, whatever its status', async () => {
    synapse.reply(json({ error: { message: 'Every provider deployment failed: 503', type: 'server_error', code: 'SYN_PROVIDERS_EXHAUSTED' } }, 503));
    const exhausted = await rejection(client.chat(request()));
    synapse.reply(json({ code: 'IAM_001', message: 'Unauthorized' }, 401));
    const unauthorised = await rejection(client.chat(request()));

    expect(exhausted).toBeInstanceOf(SynapseError);
    expect(exhausted).toMatchObject({ status: 503, code: 'SYN_PROVIDERS_EXHAUSTED', type: 'server_error' });
    expect(unauthorised).toMatchObject({ status: 401, code: 'IAM_001', message: 'Unauthorized' });
    expect(synapse.requests).toHaveLength(2);
  });

  it('should not retry a request its caller aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    synapse.reply(() => {
      throw new DOMException('aborted', 'AbortError');
    });
    const error = await rejection(client.chat(request(), { signal: controller.signal }));

    expect((error as Error).name).toBe('AbortError');
    expect(synapse.requests).toHaveLength(1);
  });

  it('should keep a code outside the contract as a plain string, with its param', async () => {
    synapse.reply(json({ error: { message: 'messages must not be empty', type: 'invalid_request_error', code: 'VALIDATION_ERROR', param: 'messages' } }, 400));
    const error = (await rejection(client.chat(request()))) as SynapseError;

    expect(error).toMatchObject({ status: 400, code: 'VALIDATION_ERROR', param: 'messages', message: 'messages must not be empty' });
    expect(isSynapseErrorCode(error.code)).toBe(false);
    expect(error.isInternal).toBe(true);
  });

  it('should narrow a contract code', async () => {
    synapse.reply(json({ error: { message: 'The request_id was already used', type: 'invalid_request_error', code: 'SYN_DUPLICATE_REQUEST' } }, 409));
    const error = (await rejection(client.chat(request()))) as SynapseError;

    expect(isSynapseErrorCode(error.code)).toBe(true);
  });

  it('should read a body that is not json as a failed request carrying the real status', async () => {
    synapse.reply(text('<html>bad gateway</html>', 502));
    const error = await rejection(client.chat(request()));

    expect(error).toMatchObject({ status: 502, code: ErrorCode.API_REQUEST_FAILED.code });
    expect(AppError.is(error, ErrorCode.API_REQUEST_FAILED)).toBe(true);
  });

  it('should refuse a successful body that is not a json object', async () => {
    synapse.reply(text('[]', 200));
    const error = await rejection(client.chat(request()));

    expect(AppError.is(error, ErrorCode.API_REQUEST_NETWORK_ERROR)).toBe(true);
  });

  it('should post images to the generations route', async () => {
    synapse.reply(json({ data: [{ b64_json: 'aGk=', media_type: 'image/png' }], usage: { cost: 0.04 }, synapse: {} }));
    const response = await client.images({ model: 'novel-forge.image', prompt: 'a lighthouse', n: 1, synapse: request().synapse });

    expect(response.data[0]?.media_type).toBe('image/png');
    expect(synapse.requests[0]?.url).toBe('http://synapse-server/api/v1/images/generations');
  });
});

describe('SynapseClient.catalog', () => {
  const view = (version: number): Record<string, unknown> => ({ catalog_version: version, task: 'novel-forge.chat', aliases: [], native_web_search: true });
  let synapse: FakeSynapse;
  let client: SynapseClient;

  beforeEach(() => {
    setSystemTime(new Date('2026-10-16T00:00:00Z'));
    synapse = new FakeSynapse();
    client = new SynapseClient({ authClient: new FakeAuthClient(), fetch: synapse.fetch });
  });

  afterEach(() => setSystemTime());

  const advance = (ms: number): void => void setSystemTime(new Date(Date.now() + ms));

  it('should serve from memory for 60 s, then revalidate with the etag and keep the body on a 304', async () => {
    synapse.reply(json(view(12), 200, { etag: '"v12"' }), () => new Response(null, { status: 304, headers: { etag: '"v12"' } }));
    const first = await client.catalog({ task: 'novel-forge.chat' });
    advance(59_999);
    const cached = await client.catalog({ task: 'novel-forge.chat' });
    advance(1);
    const revalidated = await client.catalog({ task: 'novel-forge.chat' });
    advance(59_999);
    await client.catalog({ task: 'novel-forge.chat' });

    expect(first.catalog_version).toBe(12);
    expect(cached).toBe(first);
    expect(revalidated).toBe(first);
    expect(synapse.requests).toHaveLength(2);
    expect(synapse.requests[0]?.headers.get('if-none-match')).toBeNull();
    expect(synapse.requests[1]?.headers.get('if-none-match')).toBe('"v12"');
  });

  it('should replace the cached view when revalidation answers a new version', async () => {
    synapse.reply(json(view(12), 200, { etag: '"v12"' }), json(view(13), 200, { etag: '"v13"' }), () => new Response(null, { status: 304 }));
    await client.catalog({ task: 'novel-forge.chat' });
    advance(60_000);
    const replaced = await client.catalog({ task: 'novel-forge.chat' });
    advance(60_000);
    await client.catalog({ task: 'novel-forge.chat' });

    expect(replaced.catalog_version).toBe(13);
    expect(synapse.requests[2]?.headers.get('if-none-match')).toBe('"v13"');
  });

  it('should key the cache by task and selectors, sending selectors sorted as key:value pairs', async () => {
    synapse.reply(json(view(1)), json(view(1)), json({ catalog_version: 1, tasks: {} }));
    await client.catalog({ task: 'novel-forge.chat', selectors: { tier: 'balanced', content_mode: 'standard' } });
    await client.catalog({ task: 'novel-forge.chat', selectors: { content_mode: 'standard', tier: 'balanced' } });
    await client.catalog({ task: 'novel-forge.chat', selectors: { tier: 'economy' } });
    await client.catalog();

    const urls = synapse.requests.map(sent => new URL(sent.url));
    expect(urls).toHaveLength(3);
    expect(urls[0]?.pathname).toBe('/api/v1/catalog');
    expect(urls[0]?.searchParams.get('selectors')).toBe('content_mode:standard,tier:balanced');
    expect(urls[1]?.searchParams.get('selectors')).toBe('tier:economy');
    expect(urls[2]?.search).toBe('');
  });

  it('should share one request among concurrent callers', async () => {
    synapse.reply(json(view(12), 200, { etag: '"v12"' }));
    const [a, b] = await Promise.all([client.catalog({ task: 'novel-forge.chat' }), client.catalog({ task: 'novel-forge.chat' })]);

    expect(a).toBe(b);
    expect(synapse.requests).toHaveLength(1);
  });

  it('should keep the cached entry when a revalidation fails, and try again on the next call', async () => {
    synapse.reply(json(view(12), 200, { etag: '"v12"' }), json({ error: { message: 'down', type: 'server_error', code: 'SYN_NO_ACTIVE_CATALOG' } }, 503));
    await client.catalog({ task: 'novel-forge.chat' });
    advance(60_000);
    const error = await rejection(client.catalog({ task: 'novel-forge.chat' }));
    synapse.reply(() => new Response(null, { status: 304 }));
    await client.catalog({ task: 'novel-forge.chat' });

    expect(error).toMatchObject({ status: 503, code: 'SYN_NO_ACTIVE_CATALOG' });
    expect(synapse.requests[2]?.headers.get('if-none-match')).toBe('"v12"');
  });

  it('should hand out a frozen view, so one caller cannot change what the next one reads', async () => {
    synapse.reply(json(view(12)));
    const catalog = await client.catalog({ task: 'novel-forge.chat' });

    expect(Object.isFrozen(catalog)).toBe(true);
    expect(Object.isFrozen(catalog.aliases)).toBe(true);
  });

  it('should refuse a selector the key:value wire format cannot carry', async () => {
    const error = await rejection(client.catalog({ selectors: { tier: 'a,b' } }));

    expect(AppError.is(error, ErrorCode.INTERNAL)).toBe(true);
    expect(synapse.requests).toHaveLength(0);
  });
});
