import { type APIRequestContext, type APIResponse } from '@playwright/test';

import { getProductUrl, memoirDb } from '../../lib';

type MutationMethod = 'post' | 'put' | 'patch' | 'delete';

export interface MemoirMutateOptions {
  data?: unknown;
  headers?: Record<string, string>;
  csrfSeedPath?: string;
}

export interface CommandEnvelopeInput {
  commandId: string;
  type: string;
  payload: Record<string, unknown>;
  localDate: string;
  performedAt?: string;
  deviceId?: string;
}

export interface CommandOutcome {
  commandId: string;
  status: string;
  result: Record<string, unknown>;
  replayed: boolean;
  error?: { code: string; message: string };
}

export interface DeltaPage {
  cursor: string;
  hasMore: boolean;
  domains: Record<string, Record<string, unknown>[]>;
  tombstones: { domain: string; recordId: string; syncSeq: string }[];
}

/**
 * A memoir-scoped replacement for `lib/api.ts`'s `mutate`: the shared helper's cookie lookup has no origin filter, so it can echo a foreign app's `csrf-token` (see
 * `webNovelMutate`).
 */
export async function memoirMutate(ctx: APIRequestContext, method: MutationMethod, url: string, options: MemoirMutateOptions = {}): Promise<APIResponse> {
  const headers = { ...(await memoirCsrfHeaders(ctx, options.csrfSeedPath)), ...options.headers };
  return ctx[method](url, { headers, ...(options.data === undefined ? {} : { data: options.data }) });
}

/**
 * Seeds memoir's CSRF cookie and returns the header. A seed may rotate the token, so concurrent requests on one context must share one seed taken beforehand, or a later seed
 * invalidates an earlier header (`S010`).
 */
export async function memoirCsrfHeaders(ctx: APIRequestContext, seedPath = '/api/auth/session'): Promise<Record<string, string>> {
  await ctx.get(seedPath);

  const memoirOrigin = new URL(getProductUrl('memoir') ?? 'https://memoir.shadow-apps.test').hostname;
  const { cookies } = await ctx.storageState();
  const cookie = cookies.find(c => c.name === 'csrf-token' && c.domain.replace(/^\./, '') === memoirOrigin);
  const token = cookie?.value.split(':')[1];
  return token ? { 'x-csrf-token': token } : {};
}

export function todayLocal(): string {
  return new Date().toISOString().slice(0, 10);
}

export function commandEnvelope(type: string, payload: Record<string, unknown>, overrides: Partial<CommandEnvelopeInput> = {}): CommandEnvelopeInput {
  return { commandId: crypto.randomUUID(), type, payload, localDate: todayLocal(), ...overrides };
}

/** Posts one sync batch and returns the raw response, for refusals or racing; pass `csrfHeaders` from {@link memoirCsrfHeaders} when firing several at once. */
export function postCommands(ctx: APIRequestContext, commands: CommandEnvelopeInput[], csrfHeaders?: Record<string, string>): Promise<APIResponse> {
  if (csrfHeaders) return ctx.post('/api/v1/sync/commands', { headers: csrfHeaders, data: { commands } });
  return memoirMutate(ctx, 'post', '/api/v1/sync/commands', { data: { commands } });
}

/** Reads the outcomes out of a sync batch response, throwing if the batch itself was refused. */
export async function commandOutcomesOf(response: APIResponse): Promise<CommandOutcome[]> {
  if (!response.ok()) throw new Error(`sync/commands failed: ${response.status()} ${await response.text()}`);
  return ((await response.json()) as { outcomes: CommandOutcome[] }).outcomes;
}

/** Submits `commands` as one batch; a command that fails is reported with status `failed` and the batch stops after it, so nothing later has an outcome. */
export async function submitCommands(ctx: APIRequestContext, commands: CommandEnvelopeInput[]): Promise<CommandOutcome[]> {
  return commandOutcomesOf(await postCommands(ctx, commands));
}

/** Submits a single sync command and returns its outcome, throwing if the batch response is not ok. */
export async function submitCommand(
  ctx: APIRequestContext,
  type: string,
  payload: Record<string, unknown>,
  overrides: Partial<CommandEnvelopeInput> = {},
): Promise<CommandOutcome> {
  const [outcome] = await submitCommands(ctx, [commandEnvelope(type, payload, overrides)]);
  if (!outcome) throw new Error('sync/commands returned no outcome for the submitted command');
  return outcome;
}

export async function waitersBlockedBy(pid: number): Promise<number> {
  const [row] = await memoirDb()<{ waiters: number }[]>`SELECT count(*)::int AS waiters FROM pg_stat_activity WHERE ${pid}::int = ANY(pg_blocking_pids(pid))`;
  return row?.waiters ?? 0;
}

/** Pulls one delta page starting from `since` (defaults to a full initial sync). */
export async function pullDelta(ctx: APIRequestContext, since = '0'): Promise<DeltaPage> {
  const response = await ctx.get(`/api/v1/sync/delta?since=${since}`);
  if (!response.ok()) throw new Error(`sync/delta failed: ${response.status()} ${await response.text()}`);
  return (await response.json()) as DeltaPage;
}

export interface PullDeltaOptions {
  since?: string;
  /** Comma-separated domain names, sent verbatim as the `domains` query param. */
  domains?: string;
  limit?: number;
}

/** Like {@link pullDelta} but exposes `domains`/`limit` and the raw response, for cursor-paging and header assertions. */
export async function pullDeltaWith(ctx: APIRequestContext, options: PullDeltaOptions = {}): Promise<{ response: APIResponse; page: DeltaPage }> {
  const params = new URLSearchParams({ since: options.since ?? '0' });
  if (options.domains) params.set('domains', options.domains);
  if (options.limit !== undefined) params.set('limit', String(options.limit));
  const response = await ctx.get(`/api/v1/sync/delta?${params.toString()}`);
  if (!response.ok()) throw new Error(`sync/delta failed: ${response.status()} ${await response.text()}`);
  return { response, page: (await response.json()) as DeltaPage };
}

/** Pulls every delta page from `since=0` until `hasMore` clears, merging each domain's rows and the tombstones in arrival order. */
export async function pullFullDelta(ctx: APIRequestContext, maxPages = 50): Promise<DeltaPage> {
  const merged: DeltaPage = { cursor: '0', hasMore: true, domains: {}, tombstones: [] };
  for (let page = 0; page < maxPages && merged.hasMore; page++) {
    const delta = await pullDelta(ctx, merged.cursor);
    for (const [domain, rows] of Object.entries(delta.domains)) merged.domains[domain] = [...(merged.domains[domain] ?? []), ...rows];
    merged.tombstones.push(...delta.tombstones);
    merged.cursor = delta.cursor;
    merged.hasMore = delta.hasMore;
  }
  if (merged.hasMore) throw new Error(`sync/delta still had more after ${maxPages} pages`);
  return merged;
}

/** The `code` of an error response body, or `undefined` when the body carries none. */
export async function errorCodeOf(response: APIResponse): Promise<string | undefined> {
  const body = (await response.json().catch(() => ({}))) as { code?: unknown };
  return typeof body.code === 'string' ? body.code : undefined;
}

/** `quest_logs` delta rows carry `questId` and `date` but no `occurrenceId`, so an occurrence is looked up by reassembling the id the client sends. */
export function hasQuestLogFor(delta: DeltaPage, occurrenceId: string): boolean {
  const logs = delta.domains['quest_logs'] ?? [];
  return logs.some(log => `${String(log['questId'])}:${String(log['date'])}` === occurrenceId);
}

export interface AccountView {
  id: string;
  onboardingCompletedAt: string | null;
  defaultCurrency: string;
  enabledCurrencies: string[];
  timezone: string;
  pendingTimezone?: string | null;
  intensityMode: string;
  pendingIntensityMode?: string | null;
  weekStart: number;
  returnerThresholdDays: number;
  monthlyBudgetMinor?: number | null;
  level: number;
  totalXp: string;
  coins: number;
  hpToday: number;
  notificationPrefs: { weeklyDigest: boolean; aiReadiness: boolean; billingReminders: boolean };
  [key: string]: unknown;
}

/** Reads the caller's account. */
export async function getAccount(ctx: APIRequestContext): Promise<AccountView> {
  const response = await ctx.get('/api/v1/account');
  if (!response.ok()) throw new Error(`GET /account failed: ${response.status()} ${await response.text()}`);
  return (await response.json()) as AccountView;
}

/** Completes onboarding if it has not run (the account is provisioned lazily), so a spec does not depend on run order. */
export async function ensureOnboarded(ctx: APIRequestContext): Promise<AccountView> {
  const account = await getAccount(ctx);
  if (account.onboardingCompletedAt) return account;

  const response = await memoirMutate(ctx, 'post', '/api/v1/account/onboarding', {
    data: { defaultCurrency: 'USD', timezone: 'UTC', scheduleStartMin: 360, scheduleEndMin: 1380 },
  });
  if (!response.ok()) throw new Error(`onboarding failed: ${response.status()} ${await response.text()}`);
  return (await response.json()) as AccountView;
}

/** A `quest.create` payload for an open-ended daily routine quest starting on `startDate`. */
export function dailyQuestDraft(name: string, startDate = todayLocal()): Record<string, unknown> {
  return { name, statAffinity: 'discipline', strictness: 'routine', recurrence: { frequency: 'daily', startDate, end: { kind: 'never' } } };
}

/** Creates a simple daily quest via `quest.create` and returns its id and the occurrence id for today. */
export async function createDailyQuest(ctx: APIRequestContext, name: string): Promise<{ questId: string; occurrenceId: string }> {
  const today = todayLocal();
  const outcome = await submitCommand(ctx, 'quest.create', dailyQuestDraft(name, today));
  if (outcome.status !== 'applied') throw new Error(`quest.create was not applied: ${JSON.stringify(outcome)}`);
  const questId = String(outcome.result['id']);
  return { questId, occurrenceId: `${questId}:${today}` };
}
