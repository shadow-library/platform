/**
 * Importing npm packages
 */
import { randomUUID } from 'node:crypto';

import { type APIResponse } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { decodeJwt, memoirDb, pollUntil } from '../../lib';
import {
  ACCOUNT_SCOPE,
  accountOwnedTables,
  bearer,
  createMemoirTokenIssuer,
  databaseNow,
  DELETION_PATH,
  deletionRowOf,
  type DeletionState,
  DESTRUCTIVE_SCOPE,
  fetchObject,
  MEMOIR_AUDIENCE,
  ownedRowCounts,
  RECEIPT_PNG,
  seedAccountActivity,
  stepUpThroughMemoir,
  waitForDeletionState,
  wipeAccount,
} from './deletion-helpers';
import { type DisposableAccount, expect, test } from './fixtures';
import { errorCodeOf, getAccount, memoirMutate } from './helpers';

/**
 * Defining types
 */

interface StaleSeed {
  readonly accountId: string;
  readonly state: DeletionState;
  readonly stale: boolean;
}

/**
 * Declaring the constants
 *
 * Account deletion (ARCHITECTURE §21): the step-up-gated start and status routes, the state machine the start drives in the
 * background, and the resume sweep that re-drives a stalled one. Every account here is a fresh persona or a disposable row; the
 * sweep runs in-process on the shared memoir pod for every account, so nothing is ever placed where it could reach another's.
 */

/** `deletion.resume-after-minutes`; dev keeps the default. */
const RESUME_AFTER_MINUTES = 15;
/** `deletion.sweep-interval-minutes` is 5 in dev; the budget covers one full cadence plus the sweeps sharing its tick. */
const SWEEP_WAIT_MS = 7.5 * 60_000;
const SEEDED_TABLES = ['command_log', 'devices', 'expense_audits', 'expense_categories', 'expenses', 'hero_events', 'quest_logs', 'quests', 'receipts'];

async function expectRefusal(response: APIResponse, status: number, code: string): Promise<void> {
  expect(response.status(), `${response.url()} answered ${await response.text()}`).toBe(status);
  expect(await errorCodeOf(response)).toBe(code);
}

async function expectDeletionState(response: APIResponse, status: number, state: DeletionState): Promise<void> {
  expect(response.status(), await response.text()).toBe(status);
  expect(await response.json()).toEqual({ deletionState: state });
}

function scopesOf(token: string): string[] {
  return String(decodeJwt(token).payload['scope'] ?? '')
    .split(' ')
    .filter(Boolean);
}

/** A null start keeps the resume sweep, which only re-drives rows started before its threshold, off a hand-placed state. */
async function placeDeletionState(accountId: string, state: DeletionState): Promise<void> {
  await memoirDb()`UPDATE accounts SET deletion_state = ${state}::deletion_state, deletion_started_at = NULL WHERE id = ${accountId}`;
}

async function seedOwnedRows(accountId: string): Promise<void> {
  const sql = memoirDb();
  await sql`INSERT INTO command_log (account_id, command_id, type, status) VALUES (${accountId}, ${randomUUID()}, 'quest.create', 'applied')`;
  await sql`INSERT INTO devices (id, account_id, user_agent) VALUES (${randomUUID()}, ${accountId}, 'e2e-deletion-sweep')`;
}

test.describe('memoir account deletion — step-up gate', () => {
  test('should refuse a memoir session that has not stepped up with 403 IAM_003 on both deletion routes, and start nothing', async ({ memoir }) => {
    test.setTimeout(60_000);
    const persona = await memoir.persona({ label: 'del-aal1', onboard: true });
    const accountId = (await getAccount(persona.ctx)).id;
    const issuer = await createMemoirTokenIssuer(memoir);
    const guest = await memoir.guest();

    const navigation = await persona.ctx.get(DELETION_PATH, { headers: { accept: 'text/html' }, maxRedirects: 0 });
    expect(navigation.status(), 'a browser navigation is bounced to step-up rather than refused').toBe(302);
    expect(navigation.headers().location).toBe(`/api/auth/step-up?return_to=${encodeURIComponent(DELETION_PATH)}`);
    await expectRefusal(await memoirMutate(persona.ctx, 'post', DELETION_PATH), 403, 'IAM_003');
    await expectRefusal(await persona.ctx.get(DELETION_PATH), 403, 'IAM_003');

    expect(await deletionRowOf(accountId)).toEqual({ state: 'none', startedAt: null });
    await expectDeletionState(await guest.get(DELETION_PATH, bearer(await issuer.elevated(persona))), 200, 'none');
  });

  test('should refuse a bearer token carrying memoir:destructive without a step-up with 403 IAM_003, and start nothing', async ({ memoir }) => {
    test.setTimeout(60_000);
    const persona = await memoir.persona({ label: 'del-aal1-bearer', onboard: true });
    const accountId = (await getAccount(persona.ctx)).id;
    const issuer = await createMemoirTokenIssuer(memoir);
    const guest = await memoir.guest();

    const unelevated = await issuer.unelevated(persona);
    expect(decodeJwt(unelevated).payload, 'the refusal must be for the missing step-up alone').toMatchObject({ aud: MEMOIR_AUDIENCE, sub: persona.sub });
    expect(decodeJwt(unelevated).payload['aal']).not.toBe('AAL2');
    test.skip(!scopesOf(unelevated).includes(DESTRUCTIVE_SCOPE), 'identity withholds a sensitive scope from a code grant without a step-up, so no such token exists to refuse');
    await expectRefusal(await guest.post(DELETION_PATH, bearer(unelevated)), 403, 'IAM_003');
    await expectRefusal(await guest.get(DELETION_PATH, bearer(unelevated)), 403, 'IAM_003');

    expect(await deletionRowOf(accountId)).toEqual({ state: 'none', startedAt: null });
    await expectDeletionState(await guest.get(DELETION_PATH, bearer(await issuer.elevated(persona))), 200, 'none');
  });

  // App bug: the code grant filters scopes by client and principal alone (identity-server oauth.service.ts:298-313, reached from :511), never by the
  // session's assurance level, unlike the app-session mint (app-session.service.ts:161) and token exchange (oauth.service.ts:468).
  test.fixme('should withhold memoir:destructive from a code grant until the session steps up', async ({ memoir }) => {
    const persona = await memoir.persona({ label: 'del-aal1-scope' });
    const issuer = await createMemoirTokenIssuer(memoir);

    expect(scopesOf(await issuer.unelevated(persona))).not.toContain(DESTRUCTIVE_SCOPE);
    expect(scopesOf(await issuer.elevated(persona))).toContain(DESTRUCTIVE_SCOPE);
  });

  test('should refuse an elevated token without memoir:destructive with 403 IAM_002, and one elevated for another audience with 401 IAM_001', async ({ memoir }) => {
    test.setTimeout(60_000);
    const persona = await memoir.persona({ label: 'del-aal2', onboard: true });
    const accountId = (await getAccount(persona.ctx)).id;
    const issuer = await createMemoirTokenIssuer(memoir);
    const guest = await memoir.guest();

    const scopeless = await issuer.elevated(persona, { scope: ACCOUNT_SCOPE });
    expect(decodeJwt(scopeless).payload).toMatchObject({ aal: 'AAL2', aud: MEMOIR_AUDIENCE });
    expect(scopesOf(scopeless)).not.toContain(DESTRUCTIVE_SCOPE);
    await expectRefusal(await guest.post(DELETION_PATH, bearer(scopeless)), 403, 'IAM_002');

    const foreign = await issuer.elevated(persona, { resource: issuer.audience });
    expect(decodeJwt(foreign).payload).toMatchObject({ aal: 'AAL2', aud: issuer.audience });
    await expectRefusal(await guest.post(DELETION_PATH, bearer(foreign)), 401, 'IAM_001');

    expect(await deletionRowOf(accountId)).toEqual({ state: 'none', startedAt: null });
    await expectDeletionState(await guest.get(DELETION_PATH, bearer(await issuer.elevated(persona))), 200, 'none');
  });

  // App bug: memoir logs in without sensitive scopes (packages/auth/src/module/app-session.service.ts:454), so a stepped-up start answers 403 IAM_002.
  test.fixme("should start deletion for a memoir session once it has stepped up through memoir's own step-up route", async ({ memoir }) => {
    const persona = await memoir.persona({ label: 'del-web', onboard: true });
    const accountId = (await getAccount(persona.ctx)).id;

    await stepUpThroughMemoir(persona, await memoir.identityCaller(persona), DELETION_PATH);
    await expectDeletionState(await memoirMutate(persona.ctx, 'post', DELETION_PATH), 202, 'pending');
    expect((await persona.ctx.get('/api/auth/session')).status(), 'the start revokes the app session that asked for it').toBe(401);
    expect((await waitForDeletionState(accountId, 'data_deleted'))?.state).toBe('data_deleted');
  });
});

test.describe('memoir account deletion — start and status', () => {
  test('should mark the account pending with its start time and answer 202, then answer a repeated start with the state in flight without restarting', async ({ memoir }) => {
    test.setTimeout(60_000);
    const persona = await memoir.persona({ label: 'del-start', onboard: true });
    const accountId = (await getAccount(persona.ctx)).id;
    const token = await (await createMemoirTokenIssuer(memoir)).elevated(persona);
    const guest = await memoir.guest();

    const before = await databaseNow();
    await expectDeletionState(await guest.post(DELETION_PATH, bearer(token)), 202, 'pending');
    const after = await databaseNow();

    const settled = await waitForDeletionState(accountId, 'data_deleted');
    expect(settled?.state).toBe('data_deleted');
    const startedAt = settled?.startedAt?.getTime();
    expect(startedAt).toBeGreaterThanOrEqual(before.getTime());
    expect(startedAt).toBeLessThanOrEqual(after.getTime());
    await expectRefusal(await guest.get('/api/v1/account', bearer(token)), 403, 'ACC_002');

    await expectDeletionState(await guest.post(DELETION_PATH, bearer(token)), 202, 'data_deleted');
    expect(await deletionRowOf(accountId), 'a repeated start neither re-marks nor re-stamps the account').toEqual(settled);
  });

  test('should report the state the deletion machine holds at every step', async ({ memoir }) => {
    test.setTimeout(60_000);
    const persona = await memoir.persona({ label: 'del-status', onboard: true });
    const accountId = (await getAccount(persona.ctx)).id;
    const token = await (await createMemoirTokenIssuer(memoir)).elevated(persona);
    const guest = await memoir.guest();
    const status = async (): Promise<unknown> => (await (await guest.get(DELETION_PATH, bearer(token))).json()) as unknown;

    expect(await status()).toEqual({ deletionState: 'none' });
    await expectDeletionState(await guest.post(DELETION_PATH, bearer(token)), 202, 'pending');
    expect(await pollUntil(status, body => JSON.stringify(body) === JSON.stringify({ deletionState: 'data_deleted' }), { timeoutMs: 20_000, intervalMs: 250 })).toEqual({
      deletionState: 'data_deleted',
    });

    for (const state of ['pending', 'blobs_deleted', 'identity_closed'] as const) {
      await placeDeletionState(accountId, state);
      await test.step(`reports ${state}`, async () => expectDeletionState(await guest.get(DELETION_PATH, bearer(token)), 200, state));
    }
  });
});

test.describe('memoir account deletion — data removal', () => {
  test("should wipe the account's objects and every account-owned row as soon as it starts, keep its accounts row halted at data_deleted, and leave another account untouched", async ({
    memoir,
  }) => {
    test.setTimeout(90_000);
    const [target, bystander] = await Promise.all([memoir.persona({ label: 'del-purge', onboard: true }), memoir.persona({ label: 'del-bystander', onboard: true })]);
    const targetId = (await getAccount(target.ctx)).id;
    const bystanderId = (await getAccount(bystander.ctx)).id;
    const tables = await accountOwnedTables();
    const issuer = await createMemoirTokenIssuer(memoir);
    const guest = await memoir.guest();

    try {
      const targetReceipt = await seedAccountActivity(target, 'target');
      const bystanderReceipt = await seedAccountActivity(bystander, 'bystander');
      const targetBefore = await ownedRowCounts(targetId, tables);
      const bystanderBefore = await ownedRowCounts(bystanderId, tables);
      for (const table of SEEDED_TABLES) {
        expect(targetBefore[table], `the purge needs ${table} rows to remove`).toBeGreaterThan(0);
        expect(bystanderBefore[table], `the bystander needs ${table} rows to keep`).toBeGreaterThan(0);
      }
      expect(await fetchObject(targetReceipt.downloadUrl)).toEqual({ status: 200, body: RECEIPT_PNG });

      await expectDeletionState(await guest.post(DELETION_PATH, bearer(await issuer.elevated(target))), 202, 'pending');
      expect((await waitForDeletionState(targetId, 'data_deleted'))?.state, 'steps 3 and 4 run right after the start, not on the sweep').toBe('data_deleted');

      expect(await ownedRowCounts(targetId, tables)).toEqual(Object.fromEntries(tables.map(table => [table, 0])));
      expect((await fetchObject(targetReceipt.downloadUrl)).status, "the target's receipt object is gone from storage").toBe(404);

      expect(await ownedRowCounts(bystanderId, tables)).toEqual(bystanderBefore);
      expect(await fetchObject(bystanderReceipt.downloadUrl)).toEqual({ status: 200, body: RECEIPT_PNG });
      expect((await getAccount(bystander.ctx)).id).toBe(bystanderId);

      // Dev grants memoir no identity-close surface (`identity.close-path` unset), so §21.3 rests the machine here with the row intact.
      expect((await deletionRowOf(targetId))?.state).toBe('data_deleted');
      await expectDeletionState(await guest.get(DELETION_PATH, bearer(await issuer.elevated(target))), 200, 'data_deleted');
    } finally {
      await Promise.all([wipeAccount(issuer, guest, target, targetId), wipeAccount(issuer, guest, bystander, bystanderId)].map(wipe => wipe.catch(() => undefined)));
    }
  });
});

test.describe('memoir account deletion — resume sweep', () => {
  /**
   * The states are placed in one transaction, so the sweep reads either none or all of them in a single pass: once the stale rows
   * have moved, the same pass has also judged the fresh and never-started controls. Every row is a disposable account with a
   * synthetic identity subject, so anything the sweep does to them touches only their own ids and prefixes.
   */
  test('should drive a stale deletion on from every state it stalls in, remove the row only from identity_closed, and leave fresh or never-started accounts alone', async ({
    memoir,
  }) => {
    test.setTimeout(SWEEP_WAIT_MS + 90_000);
    // A killed run's rows would otherwise sit in the sweep's 50-row page for good; an hour is far past any live run of this test.
    await memoirDb()`DELETE FROM accounts WHERE identity_sub LIKE 'e2e-del-sweep-%' AND created_at < now() - interval '1 hour'`;
    const sweepAccount = (label: string): Promise<DisposableAccount> => memoir.disposableAccount(`del-sweep-${label}`);
    const [closed, pending, blobs, halted, fresh, never] = await Promise.all([
      sweepAccount('closed'),
      sweepAccount('pending'),
      sweepAccount('blobs'),
      sweepAccount('halted'),
      sweepAccount('fresh'),
      sweepAccount('never'),
    ]);
    const seeds: readonly StaleSeed[] = [
      { accountId: closed.id, state: 'identity_closed', stale: true },
      { accountId: pending.id, state: 'pending', stale: true },
      { accountId: blobs.id, state: 'blobs_deleted', stale: true },
      { accountId: halted.id, state: 'data_deleted', stale: true },
      { accountId: fresh.id, state: 'pending', stale: false },
      { accountId: never.id, state: 'none', stale: true },
    ];
    for (const seed of seeds) await seedOwnedRows(seed.accountId);
    const tables = await accountOwnedTables();
    const seeded = await ownedRowCounts(fresh.id, tables);

    await memoirDb().begin(async tx => {
      for (const seed of seeds) {
        const age = seed.stale ? 2 * RESUME_AFTER_MINUTES : 0;
        await tx`
          UPDATE accounts SET deletion_state = ${seed.state}::deletion_state, deletion_started_at = now() - make_interval(mins => ${age}::int)
          WHERE id = ${seed.accountId}
        `;
      }
    });

    const swept = await pollUntil(
      async () => Promise.all([deletionRowOf(closed.id), deletionRowOf(pending.id), deletionRowOf(blobs.id)]),
      ([closedRow, pendingRow, blobsRow]) => closedRow === undefined && pendingRow?.state === 'data_deleted' && blobsRow?.state === 'data_deleted',
      { timeoutMs: SWEEP_WAIT_MS, intervalMs: 5_000 },
    );
    expect(swept.map(row => row?.state)).toEqual([undefined, 'data_deleted', 'data_deleted']);

    const emptied = Object.fromEntries(tables.map(table => [table, 0]));
    expect(await ownedRowCounts(closed.id, tables)).toEqual(emptied);
    expect(await ownedRowCounts(pending.id, tables)).toEqual(emptied);
    expect(await ownedRowCounts(blobs.id, tables)).toEqual(emptied);

    expect((await deletionRowOf(halted.id))?.state, 'identity close stays unavailable, and the row is only ever removed from identity_closed').toBe('data_deleted');
    expect((await deletionRowOf(fresh.id))?.state, 'a deletion younger than the resume threshold still has its own driver').toBe('pending');
    expect(await ownedRowCounts(fresh.id, tables)).toEqual(seeded);
    expect((await deletionRowOf(never.id))?.state).toBe('none');
    expect(await ownedRowCounts(never.id, tables)).toEqual(seeded);
  });
});
