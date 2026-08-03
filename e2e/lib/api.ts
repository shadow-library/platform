/**
 * Importing npm packages
 */
import { existsSync } from 'node:fs';

import { type APIRequestContext, type APIResponse, request } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { type ProductKey, requireProductUrl } from './env';
import { type LoginPersona, storageStateFor } from './personas';

/**
 * Defining types
 */

/** A mutating HTTP method — the ones the CSRF double-submit guard applies to. */
type MutationMethod = 'post' | 'put' | 'patch' | 'delete';

export interface MutateOptions {
  /** JSON body sent with the request. */
  data?: unknown;
  /** Extra headers merged over the CSRF header. */
  headers?: Record<string, string>;
  /** The GET path used to mint the `csrf-token` cookie before the mutation. Defaults to the session endpoint. */
  csrfSeedPath?: string;
}

export interface PollOptions {
  /** Total time to keep polling before giving up. Defaults to 5 minutes — the per-call AI budget in dev. */
  timeoutMs?: number;
  /** Delay between polls. */
  intervalMs?: number;
  /** Statuses (case-insensitive) that end the poll. Defaults cover both the job and run vocabularies. */
  terminalStatuses?: string[];
}

/**
 * Declaring the constants
 *
 * Helpers for driving the platform's JSON APIs directly from a spec, without a browser page. `apiContext` hands
 * back a Playwright `APIRequestContext` already pointed at a product and (optionally) carrying a persona's saved
 * session; `mutate` performs the double-submit CSRF dance every mutating request needs once a session cookie is
 * present; the pollers wait out novel-forge's job/run-based async work.
 */

/** The default terminal statuses a poll stops on — the union of the job vocabulary (`done`/`failed`) and the run one. */
const DEFAULT_TERMINAL_STATUSES = ['done', 'failed', 'succeeded', 'completed', 'error', 'cancelled', 'canceled'];

/**
 * An `APIRequestContext` for `product`, optionally authenticated as `persona`. The self-signed local CA is
 * tolerated the same way the browser projects tolerate it. When `persona` is given but its storage state has not
 * been produced yet (setup skipped), the context is created without it rather than throwing — the caller's own
 * auth assertion then fails meaningfully instead of a file-not-found surfacing here.
 */
export async function apiContext(product: ProductKey, persona?: LoginPersona): Promise<APIRequestContext> {
  const baseURL = requireProductUrl(product);
  const statePath = persona ? storageStateFor(persona) : undefined;
  const storageState = statePath && existsSync(statePath) ? statePath : undefined;
  return request.newContext({ baseURL, ignoreHTTPSErrors: true, storageState });
}

/**
 * Reads the `csrf-token` cookie's token half out of `ctx`'s jar. The cookie value is `expiry(radix36):hex`; the
 * server compares the `x-csrf-token` header against the `hex` half alone (`CSRFTokenService.validateToken`), so
 * that is what we echo back. Returns `undefined` when no session cookie has caused a token to be issued yet.
 */
async function readCsrfToken(ctx: APIRequestContext): Promise<string | undefined> {
  const { cookies } = await ctx.storageState();
  const cookie = cookies.find(c => c.name === 'csrf-token');
  return cookie?.value.split(':')[1];
}

/**
 * Performs a mutating request with the double-submit CSRF token attached. It first GETs `csrfSeedPath` so the
 * server can set the `csrf-token` cookie — the CSRF middleware only issues (and only enforces) a token once the
 * request already carries a cookie, so this step is a no-op for an unauthenticated context, where CSRF is not
 * enforced anyway. The token half of the resulting cookie is then echoed in the `x-csrf-token` header.
 */
export async function mutate(ctx: APIRequestContext, method: MutationMethod, url: string, options: MutateOptions = {}): Promise<APIResponse> {
  await ctx.get(options.csrfSeedPath ?? '/api/auth/session');
  const token = await readCsrfToken(ctx);
  const headers = { ...(token ? { 'x-csrf-token': token } : {}), ...options.headers };
  return ctx[method](url, { headers, ...(options.data === undefined ? {} : { data: options.data }) });
}

/** Polls `poll` until its returned status is terminal (or the timeout elapses), returning the final parsed body. */
async function pollUntil<T>(poll: () => Promise<{ status: string; body: T }>, options: PollOptions): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 300_000;
  const intervalMs = options.intervalMs ?? 2_000;
  const terminal = (options.terminalStatuses ?? DEFAULT_TERMINAL_STATUSES).map(s => s.toLowerCase());
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const { status, body } = await poll();
    if (terminal.includes(status.toLowerCase())) return body;
    if (Date.now() >= deadline) throw new Error(`Poll timed out after ${timeoutMs}ms; last status was "${status}"`);
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
}

/** Polls `GET /api/v1/jobs/:jobId` until the job reaches a terminal status, returning its final body. */
export async function pollJob<T = Record<string, unknown>>(ctx: APIRequestContext, jobId: string, options: PollOptions = {}): Promise<T> {
  return pollUntil<T>(async () => {
    const response = await ctx.get(`/api/v1/jobs/${jobId}`);
    const body = (await response.json()) as T & { status: string };
    return { status: body.status, body };
  }, options);
}

/** Polls `GET /api/v1/projects/:projectId/runs/:runId` until the run reaches a terminal status, returning its final body. */
export async function pollRun<T = Record<string, unknown>>(ctx: APIRequestContext, projectId: string, runId: string, options: PollOptions = {}): Promise<T> {
  return pollUntil<T>(async () => {
    const response = await ctx.get(`/api/v1/projects/${projectId}/runs/${runId}`);
    const body = (await response.json()) as T & { status: string };
    return { status: body.status, body };
  }, options);
}
