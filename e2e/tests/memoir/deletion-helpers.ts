import { randomUUID } from 'node:crypto';

import { type APIRequestContext, request } from '@playwright/test';

import { authorizeCode, createAppSessionApi, exchangeCode, findResourceScopeId, grantClientScope, memoirDb, type OAuthTestClient, pollUntil, stepUp } from '../../lib';
import { type MemoirHarness, type MemoirPersona } from './fixtures';
import { createDailyQuest, memoirMutate, submitCommand, todayLocal } from './helpers';

export type DeletionState = 'none' | 'pending' | 'blobs_deleted' | 'data_deleted' | 'identity_closed' | 'done';

export interface ElevatedTokenOptions {
  resource?: string;
  scope?: string;
}

/**
 * Issues memoir-audience tokens through a throwaway first-party application holding `memoir:account` and `memoir:destructive` on `api://memoir`; the elevated path is identity's
 * real step-up (re-authenticate, claim in the app session, mint `AAL2`).
 */
export interface MemoirTokenIssuer {
  readonly client: OAuthTestClient;
  readonly audience: string;
  /** A plain authorization-code token: no `aal` claim and no `memoir:destructive`, which identity withholds without a step-up. */
  unelevated(persona: MemoirPersona, scope?: string): Promise<string>;
  elevated(persona: MemoirPersona, options?: ElevatedTokenOptions): Promise<string>;
}

export interface DeletionRow {
  readonly state: DeletionState;
  readonly startedAt: Date | null;
}

export interface StoredReceipt {
  readonly ref: string;
  readonly downloadUrl: string;
}

export interface ObjectFetch {
  readonly status: number;
  readonly body: Buffer;
}

export const MEMOIR_AUDIENCE = 'api://memoir';
export const ACCOUNT_SCOPE = 'memoir:account';
export const DESTRUCTIVE_SCOPE = 'memoir:destructive';
export const DELETION_PATH = '/api/v1/account/deletion';

export const RECEIPT_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

export class MemoirDeletionError extends Error {
  override readonly name = 'MemoirDeletionError';
}

export function bearer(token: string): { headers: Record<string, string> } {
  return { headers: { authorization: `Bearer ${token}` } };
}

export async function createMemoirTokenIssuer(memoir: MemoirHarness, label = 'memoir-deletion'): Promise<MemoirTokenIssuer> {
  const application = await memoir.createOAuthApp(label);
  const admin = (await memoir.identityAdmin()).ctx;
  const tokenCtx = await memoir.identityAnonymous();
  const api = await createAppSessionApi(admin, tokenCtx, application);
  for (const scope of [ACCOUNT_SCOPE, DESTRUCTIVE_SCOPE]) await grantClientScope(admin, api.client.clientId, await findResourceScopeId(admin, MEMOIR_AUDIENCE, scope));
  const consented = `openid ${ACCOUNT_SCOPE} ${DESTRUCTIVE_SCOPE}`;

  return {
    client: api.client,
    audience: application.audience,
    unelevated: async (persona, scope = consented) => {
      const identityCtx = await memoir.identityCaller(persona);
      const exchanged = await exchangeCode(tokenCtx, api.client, await authorizeCode(identityCtx, api.client, { resource: MEMOIR_AUDIENCE, scope }));
      const body = (await exchanged.json()) as { access_token?: string };
      if (exchanged.status() !== 200 || !body.access_token) throw new MemoirDeletionError(`code exchange answered ${exchanged.status()}: ${JSON.stringify(body)}`);
      return body.access_token;
    },
    elevated: async (persona, options = {}) => {
      const resource = options.resource ?? MEMOIR_AUDIENCE;
      const identityCtx = await memoir.identityCaller(persona);
      const { handle } = await api.open(identityCtx, { resource: MEMOIR_AUDIENCE, scope: consented });

      const steppedUp = await stepUp(identityCtx, { password: persona.user.password, clientId: api.client.clientId, resource });
      if (steppedUp.status() !== 200) throw new MemoirDeletionError(`step-up answered ${steppedUp.status()}: ${await steppedUp.text()}`);
      const claimed = await api.claimElevation(handle, resource);
      if (claimed.status() !== 200) throw new MemoirDeletionError(`elevation claim answered ${claimed.status()}: ${await claimed.text()}`);

      const minted = await api.mint({ sessionHandle: handle, resource, scope: options.scope ?? `${ACCOUNT_SCOPE} ${DESTRUCTIVE_SCOPE}`, elevated: true });
      const body = (await minted.json()) as { accessToken?: string; aal?: string };
      if (minted.status() !== 200 || body.aal !== 'AAL2' || !body.accessToken) throw new MemoirDeletionError(`elevated mint answered ${minted.status()}: aal ${body.aal}`);
      return body.accessToken;
    },
  };
}

export async function deletionRowOf(accountId: string): Promise<DeletionRow | undefined> {
  const [row] = await memoirDb()<DeletionRow[]>`SELECT deletion_state::text AS state, deletion_started_at AS "startedAt" FROM accounts WHERE id = ${accountId}`;
  return row;
}

export function waitForDeletionState(accountId: string, state: DeletionState, timeoutMs = 20_000): Promise<DeletionRow | undefined> {
  return pollUntil(
    () => deletionRowOf(accountId),
    row => row?.state === state,
    { timeoutMs, intervalMs: 250 },
  );
}

export async function databaseNow(): Promise<Date> {
  const [row] = await memoirDb()<{ now: Date }[]>`SELECT now() AS now`;
  if (!row) throw new MemoirDeletionError('SELECT now() returned no row');
  return row.now;
}

export async function accountOwnedTables(): Promise<string[]> {
  const rows = await memoirDb()<{ table: string }[]>`
    SELECT table_name AS table FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'account_id'
    ORDER BY table_name
  `;
  return rows.map(row => row.table);
}

export async function ownedRowCounts(accountId: string, tables: readonly string[]): Promise<Record<string, number>> {
  const union = tables.map(table => `SELECT '${table}' AS table, count(*)::int AS rows FROM "${table}" WHERE account_id = $1`).join(' UNION ALL ');
  const rows = await memoirDb().unsafe<{ table: string; rows: number }[]>(union, [accountId]);
  return Object.fromEntries(rows.map(row => [row.table, row.rows]));
}

async function withStorage<T>(use: (storage: APIRequestContext) => Promise<T>): Promise<T> {
  const storage = await request.newContext({ ignoreHTTPSErrors: true });
  try {
    return await use(storage);
  } finally {
    await storage.dispose();
  }
}

export async function storeReceipt(ctx: APIRequestContext): Promise<StoredReceipt> {
  const created = await memoirMutate(ctx, 'post', '/api/v1/receipts', { data: { contentType: 'image/png', sizeBytes: RECEIPT_PNG.length } });
  if (created.status() !== 201) throw new MemoirDeletionError(`receipt create answered ${created.status()}: ${await created.text()}`);
  const { ref, uploadUrl } = (await created.json()) as { ref: string; uploadUrl: string };

  const uploaded = await withStorage(storage => storage.put(uploadUrl, { headers: { 'content-type': 'image/png' }, data: RECEIPT_PNG }).then(response => response.status()));
  if (uploaded !== 200) throw new MemoirDeletionError(`presigned upload answered ${uploaded}`);

  const path = `/api/v1/receipts/${encodeURIComponent(ref)}`;
  const confirmed = await memoirMutate(ctx, 'post', `${path}/confirm`);
  if (confirmed.status() !== 200) throw new MemoirDeletionError(`receipt confirm answered ${confirmed.status()}: ${await confirmed.text()}`);
  const download = await ctx.get(`${path}/download`);
  if (download.status() !== 200) throw new MemoirDeletionError(`receipt download answered ${download.status()}: ${await download.text()}`);
  return { ref, downloadUrl: ((await download.json()) as { url: string }).url };
}

export function fetchObject(url: string): Promise<ObjectFetch> {
  return withStorage(async storage => {
    const response = await storage.get(url);
    return { status: response.status(), body: await response.body() };
  });
}

/**
 * Leaves rows across the quest, progression, device, command, finance and receipt tables: a completed daily quest, a device, and an expense with a stored receipt (two
 * `expense_audits` rows, seeded categories).
 */
export async function seedAccountActivity(persona: MemoirPersona, label: string): Promise<StoredReceipt> {
  const { occurrenceId } = await createDailyQuest(persona.ctx, `E2E deletion ${label} ${randomUUID()}`);
  const completed = await submitCommand(persona.ctx, 'quest.complete', { occurrenceId });
  if (completed.status !== 'applied') throw new MemoirDeletionError(`quest.complete was not applied: ${JSON.stringify(completed)}`);

  const device = await memoirMutate(persona.ctx, 'put', `/api/v1/account/devices/${randomUUID()}`, { data: { userAgent: `e2e-deletion-${label}`, pushOptIn: false } });
  if (device.status() !== 200) throw new MemoirDeletionError(`device registration answered ${device.status()}: ${await device.text()}`);

  const receipt = await storeReceipt(persona.ctx);
  const expense = await submitCommand(persona.ctx, 'expense.create', {
    id: randomUUID(),
    currency: 'USD',
    occurredOn: todayLocal(),
    categoryId: 'uncat',
    amountText: '4.20',
    amountMinor: 420,
    receiptRef: receipt.ref,
  });
  if (expense.status !== 'applied') throw new MemoirDeletionError(`expense.create was not applied: ${JSON.stringify(expense)}`);
  return receipt;
}

/**
 * Drives `persona`'s deletion to `data_deleted`, whose step 3 removes everything under `r/<id>/` and `exports/<id>/`: the one cleanup that reaches an object a half-finished
 * setup uploaded, since the orphan sweep only walks prefixes of existing accounts. A deletion already started is left alone.
 */
export async function wipeAccount(issuer: MemoirTokenIssuer, guest: APIRequestContext, persona: MemoirPersona, accountId: string): Promise<void> {
  if ((await deletionRowOf(accountId))?.state !== 'none') return;
  const started = await guest.post(DELETION_PATH, bearer(await issuer.elevated(persona)));
  if (started.status() !== 202) throw new MemoirDeletionError(`deletion start answered ${started.status()}: ${await started.text()}`);
  const settled = await waitForDeletionState(accountId, 'data_deleted');
  if (settled?.state !== 'data_deleted') throw new MemoirDeletionError(`account ${accountId} settled at ${settled?.state ?? 'no row'}, not data_deleted`);
}
