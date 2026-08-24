/**
 * Importing npm packages
 */
import { type APIRequestContext, type APIResponse } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { getProductUrl } from '../../lib';

/**
 * Defining types
 */

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
 * Declaring the constants
 *
 * A memoir-scoped replacement for `lib/api.ts`'s `mutate` — see `tests/web-novel/helpers.ts`'s `webNovelMutate`
 * for why this is necessary rather than reusing the shared one directly: the seeded personas carry a
 * `csrf-token` cookie per app they hold a session for (novel-forge, web-novel, and now memoir too), and the
 * shared helper's cookie lookup has no origin filter, so it nondeterministically echoes a foreign-origin token.
 */
export async function memoirMutate(ctx: APIRequestContext, method: MutationMethod, url: string, options: MemoirMutateOptions = {}): Promise<APIResponse> {
  await ctx.get(options.csrfSeedPath ?? '/api/auth/session');

  const memoirOrigin = new URL(getProductUrl('memoir') ?? 'https://shadow-memoir.shadow-apps.test').hostname;
  const { cookies } = await ctx.storageState();
  const cookie = cookies.find(c => c.name === 'csrf-token' && c.domain.replace(/^\./, '') === memoirOrigin);
  const token = cookie?.value.split(':')[1];

  const headers = { ...(token ? { 'x-csrf-token': token } : {}), ...options.headers };
  return ctx[method](url, { headers, ...(options.data === undefined ? {} : { data: options.data }) });
}

/** Today's date in `YYYY-MM-DD`, in the runner's local timezone — good enough for a command's `localDate`/`recurrence.startDate` in dev, where the seeded accounts run UTC-adjacent timezones. */
export function todayLocal(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Submits a single sync command and returns its outcome, throwing if the batch response is not ok. */
export async function submitCommand(
  ctx: APIRequestContext,
  type: string,
  payload: Record<string, unknown>,
  overrides: Partial<CommandEnvelopeInput> = {},
): Promise<CommandOutcome> {
  const envelope: CommandEnvelopeInput = { commandId: crypto.randomUUID(), type, payload, localDate: todayLocal(), ...overrides };
  const response = await memoirMutate(ctx, 'post', '/api/v1/sync/commands', { data: { commands: [envelope] } });
  if (!response.ok()) throw new Error(`sync/commands failed: ${response.status()} ${await response.text()}`);
  const body = (await response.json()) as { outcomes: CommandOutcome[] };
  const outcome = body.outcomes[0];
  if (!outcome) throw new Error('sync/commands returned no outcome for the submitted command');
  return outcome;
}

/** Pulls one delta page starting from `since` (defaults to a full initial sync). */
export async function pullDelta(ctx: APIRequestContext, since = '0'): Promise<DeltaPage> {
  const response = await ctx.get(`/api/v1/sync/delta?since=${since}`);
  if (!response.ok()) throw new Error(`sync/delta failed: ${response.status()} ${await response.text()}`);
  return (await response.json()) as DeltaPage;
}

export interface AccountView {
  id: string;
  onboardingCompletedAt: string | null;
  defaultCurrency: string;
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

/**
 * Completes onboarding for the caller if it has not already run — the account is provisioned lazily on first
 * touch, and the onboarding e2e flow deliberately wipes only `user2`'s account (see `seed/seed.ts`), so a spec
 * driving `user1` (persistent across runs) needs this to guarantee an onboarded account without depending on
 * run order.
 */
export async function ensureOnboarded(ctx: APIRequestContext): Promise<AccountView> {
  const account = await getAccount(ctx);
  if (account.onboardingCompletedAt) return account;

  const response = await memoirMutate(ctx, 'post', '/api/v1/account/onboarding', {
    data: { defaultCurrency: 'USD', timezone: 'UTC', scheduleStartMin: 360, scheduleEndMin: 1380 },
  });
  if (!response.ok()) throw new Error(`onboarding failed: ${response.status()} ${await response.text()}`);
  return (await response.json()) as AccountView;
}

/** Creates a simple daily quest via `quest.create` and returns its id and the occurrence id for today. */
export async function createDailyQuest(ctx: APIRequestContext, name: string): Promise<{ questId: string; occurrenceId: string }> {
  const today = todayLocal();
  const outcome = await submitCommand(ctx, 'quest.create', {
    name,
    statAffinity: 'discipline',
    strictness: 'routine',
    recurrence: { frequency: 'daily', startDate: today, end: { kind: 'never' } },
  });
  if (outcome.status !== 'applied') throw new Error(`quest.create was not applied: ${JSON.stringify(outcome)}`);
  const questId = String(outcome.result['id']);
  return { questId, occurrenceId: `${questId}:${today}` };
}
