/**
 * Importing npm packages
 */
import { randomUUID } from 'node:crypto';

import { type APIRequestContext, type APIResponse, request } from '@playwright/test';

/**
 * Importing user defined packages
 */
import {
  apiContext,
  authorizeCode,
  exchangeCode,
  findResourceScopeId,
  grantClientScope,
  introspect,
  memoirDb,
  type OAuthTestClient,
  pollUntil,
  type ProductKey,
  registerOAuthClient,
  relyingPartyClient,
  requireProductUrl,
  sleep,
} from '../../lib';
import { cookieFromStorageState } from '../cross-app/helpers';
import { clearClientRateLimits, expect, type MemoirPersona, test } from './fixtures';
import { type CommandOutcome, dailyQuestDraft, type DeltaPage, errorCodeOf, getAccount, memoirMutate, pullFullDelta, submitCommand, todayLocal, waitersBlockedBy } from './helpers';

/**
 * Defining types
 */

type DeletionState = 'none' | 'pending' | 'blobs_deleted' | 'data_deleted' | 'identity_closed' | 'done';

interface ForeignApp {
  readonly product: ProductKey;
  readonly label: string;
}

/**
 * Declaring the constants
 *
 * Memoir's cross-cutting isolation guarantees: who a credential may speak for, that a mid-deletion account is locked out of
 * every surface, and that no account ever reads or writes another's rows. Every test that mutates state does so on fresh
 * personas (see `fixtures.ts`); `user1` appears only as the read-only owner of the foreign session handles.
 */

const MEMOIR_AUDIENCE = 'api://memoir';
const ACCOUNT_SCOPE = 'memoir:account';
const SESSION_COOKIE = '__Host-shadow-session';
const FOREIGN_APPS: readonly ForeignApp[] = [
  { product: 'novelForge', label: 'Novel Forge' },
  { product: 'webNovel', label: 'Web Novel' },
];
const LOCKED_STATES: readonly Exclude<DeletionState, 'none'>[] = ['pending', 'blobs_deleted', 'data_deleted', 'identity_closed', 'done'];

/** Delta domains backed by a table whose primary key is a synthetic `id`, so the same id in two accounts' pulls is the same row. */
const GLOBAL_ID_DOMAINS: ReadonlySet<string> = new Set([
  'ai_results',
  'ai_tasks',
  'devices',
  'expense_audits',
  'expense_categories',
  'expenses',
  'hero_events',
  'journal_entries',
  'meal_presets',
  'meals',
  'metric_entries',
  'metrics',
  'quest_logs',
  'quests',
  'reschedule_events',
  'side_quests',
  'subscriptions',
]);

/**
 * Memoir-server's pool (Bun SQL, default 10 connections, not overridden in dev) is shared with every other concurrent memoir test, and
 * each blocked first-contact insert pins one connection until the blocker rolls back. Two copies of this test run at once under two
 * workers, so three waiters each prove the path while leaving room for everything else.
 */
const FIRST_CONTACT_BURST = 3;

/** Identity's admin API floors `accessTokenTtl` at 60s (admin-client.dto.ts:48) and the `auth.access_token.ttl` policy clamps to
 *  the same floor no matter how low a client's own value goes (policy.service.ts's `clamp`), so 60s is the shortest TTL reachable
 *  through the API. Memoir accepts an unexpired token up to a further 60s of clock skew (auth-client.ts:74), so the token is only
 *  provably expired once `TOKEN_TTL_SECONDS + CLOCK_SKEW_SECONDS` has passed — the wait below adds a margin on top of that. */
const TOKEN_TTL_SECONDS = 60;
const CLOCK_SKEW_SECONDS = 60;
const EXPIRY_MARGIN_SECONDS = 20;
const EXPIRY_WAIT_MS = (TOKEN_TTL_SECONDS + CLOCK_SKEW_SECONDS + EXPIRY_MARGIN_SECONDS) * 1000;

function bearer(token: string): { headers: Record<string, string> } {
  return { headers: { authorization: `Bearer ${token}` } };
}

function hostOf(product: ProductKey): string {
  return new URL(requireProductUrl(product)).hostname;
}

async function expectRefusal(response: APIResponse, status: number, code: string): Promise<void> {
  expect(response.status(), `${response.url()} answered ${await response.text()}`).toBe(status);
  expect(await errorCodeOf(response)).toBe(code);
}

async function mintAccessToken(identityCtx: APIRequestContext, tokenCtx: APIRequestContext, client: OAuthTestClient, resource: string, scope: string): Promise<string> {
  const exchanged = await exchangeCode(tokenCtx, client, await authorizeCode(identityCtx, client, { resource, scope }));
  expect(exchanged.status(), await exchanged.text()).toBe(200);
  return ((await exchanged.json()) as { access_token: string }).access_token;
}

async function accountIdsFor(identitySub: string): Promise<string[]> {
  const rows = await memoirDb()<{ id: string }[]>`SELECT id::text FROM accounts WHERE identity_sub = ${identitySub}`;
  return rows.map(row => row.id);
}

/** Leaves `deletion_started_at` null: the resume sweep only re-drives rows started before its threshold, so a killed worker's row is never picked up. */
async function setDeletionState(accountId: string, state: DeletionState): Promise<void> {
  await memoirDb()`UPDATE accounts SET deletion_state = ${state}::deletion_state, deletion_started_at = NULL WHERE id = ${accountId}`;
}

async function accountSequenceValue(): Promise<bigint> {
  const [row] = await memoirDb()<{ value: string }[]>`SELECT last_value::text AS value FROM accounts_id_seq`;
  if (!row) throw new Error('accounts_id_seq returned no row');
  return BigInt(row.value);
}

/** A context presenting `handle` as the app-session cookie of `product`'s origin, and nothing else. */
function handleContext(product: ProductKey, handle: string): Promise<APIRequestContext> {
  return request.newContext({
    baseURL: requireProductUrl(product),
    ignoreHTTPSErrors: true,
    storageState: {
      cookies: [{ name: SESSION_COOKIE, value: handle, domain: hostOf(product), path: '/', httpOnly: true, secure: true, sameSite: 'Lax', expires: -1 }],
      origins: [],
    },
  });
}

function questEnvelope(commandId: string, name: string): Record<string, unknown> {
  return { commandId, type: 'quest.create', payload: dailyQuestDraft(name), localDate: todayLocal() };
}

function expectFailed(outcome: CommandOutcome, code: string): void {
  expect(outcome.status, JSON.stringify(outcome)).toBe('failed');
  expect(outcome.error?.code).toBe(code);
}

function globalIdsByDomain(delta: DeltaPage): Map<string, Set<string>> {
  const ids = new Map<string, Set<string>>();
  for (const [domain, rows] of Object.entries(delta.domains)) {
    if (!GLOBAL_ID_DOMAINS.has(domain)) continue;
    const keyed = rows.filter(row => row['id'] !== undefined && row['id'] !== null).map(row => String(row['id']));
    if (keyed.length > 0) ids.set(domain, new Set(keyed));
  }
  return ids;
}

function rowsOf(delta: DeltaPage, domain: string): Record<string, unknown>[] {
  return delta.domains[domain] ?? [];
}

function findRow(delta: DeltaPage, domain: string, id: string): Record<string, unknown> | undefined {
  return rowsOf(delta, domain)
    .filter(row => String(row['id']) === id)
    .at(-1);
}

async function registerDevice(persona: MemoirPersona, deviceId: string, userAgent: string): Promise<APIResponse> {
  return memoirMutate(persona.ctx, 'put', `/api/v1/account/devices/${deviceId}`, { data: { userAgent, pushOptIn: false } });
}

test.describe('memoir credentials', () => {
  test('should refuse a validly-signed bearer token minted for another audience with 401 IAM_001, and admit the same flow minted for memoir', async ({ memoir }) => {
    const persona = await memoir.persona({ label: 'audience' });
    const application = await memoir.createOAuthApp('memoir-aud');
    const client = relyingPartyClient(application);
    const admin = (await memoir.identityAdmin()).ctx;
    await grantClientScope(admin, client.clientId, await findResourceScopeId(admin, MEMOIR_AUDIENCE, ACCOUNT_SCOPE));

    const identityCtx = await memoir.identityCaller(persona);
    const tokenCtx = await memoir.identityAnonymous();
    const foreign = await mintAccessToken(identityCtx, tokenCtx, client, application.audience, 'openid');
    const own = await mintAccessToken(identityCtx, tokenCtx, client, MEMOIR_AUDIENCE, `openid ${ACCOUNT_SCOPE}`);
    expect(await introspect(tokenCtx, client, foreign)).toMatchObject({ active: true, sub: persona.sub, aud: application.audience });
    expect(await introspect(tokenCtx, client, own)).toMatchObject({ active: true, sub: persona.sub, aud: MEMOIR_AUDIENCE });

    // A token memoir accepted but found short of `memoir:account` would be a 403; a 401 is the credential itself refused.
    const guest = await memoir.guest();
    await expectRefusal(await guest.get('/api/v1/account', bearer(foreign)), 401, 'IAM_001');
    expect(await accountIdsFor(persona.sub), 'a refused credential must not provision an account').toEqual([]);

    const admitted = await guest.get('/api/v1/account', bearer(own));
    expect(admitted.status(), await admitted.text()).toBe(200);
    expect(await accountIdsFor(persona.sub)).toEqual([((await admitted.json()) as { id: string }).id]);
  });

  for (const foreign of FOREIGN_APPS) {
    test(`should not authenticate on memoir with ${foreign.label}'s session handle`, async () => {
      const handle = cookieFromStorageState('user1', SESSION_COOKIE, hostOf(foreign.product));
      const home = await handleContext(foreign.product, handle);
      const smuggled = await handleContext('memoir', handle);
      const owner = await apiContext('memoir', 'user1');
      try {
        const live = await home.get('/api/auth/session');
        expect(live.status(), `the handle must be live on ${foreign.label} for its refusal on memoir to mean anything`).toBe(200);

        await expectRefusal(await smuggled.get('/api/v1/account'), 401, 'IAM_001');
        await expectRefusal(await smuggled.get('/api/v1/sync/delta?since=0'), 401, 'IAM_001');

        const admitted = await owner.get('/api/v1/account');
        expect(admitted.status(), "user1's own memoir handle still authenticates").toBe(200);
      } finally {
        await Promise.all([home.dispose(), smuggled.dispose(), owner.dispose()]);
      }
    });
  }
});

test.describe('memoir account provisioning', () => {
  /**
   * The race is forced rather than hoped for: an uncommitted row for the sub, held on a reserved connection, makes every request's
   * lookup miss and its insert wait on the unique key. Once all of them are waiting the row is rolled back, so one insert commits
   * and the rest take `ON CONFLICT DO NOTHING` and re-select. Each insert draws its id before it waits, which the sequence shows.
   */
  test('should converge concurrent first-contact requests for one sub on exactly one account', async ({ memoir }) => {
    const persona = await memoir.persona({ label: 'jit-race' });
    expect(await accountIdsFor(persona.sub), 'the race needs a sub memoir has never provisioned').toEqual([]);

    const blocker = await memoirDb().reserve();
    let burst: Promise<APIResponse[]> | undefined;
    let sequenceBefore: bigint;
    try {
      await blocker`BEGIN`;
      const [backend] = await blocker<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      if (!backend) throw new Error('pg_backend_pid() returned no row');
      await blocker`
        INSERT INTO accounts (identity_sub, auth_provider, default_currency, enabled_currencies, timezone)
        VALUES (${persona.sub}, 'google', 'USD', ARRAY['USD']::char(3)[], 'UTC')
      `;
      sequenceBefore = await accountSequenceValue();

      burst = Promise.all(Array.from({ length: FIRST_CONTACT_BURST }, (_, index) => persona.ctx.get(index === 0 ? '/api/v1/sync/delta?since=0' : '/api/v1/account')));
      const waiting = await pollUntil(
        () => waitersBlockedBy(backend.pid),
        waiters => waiters >= FIRST_CONTACT_BURST,
        { timeoutMs: 10_000, intervalMs: 50 },
      );
      expect(waiting, 'every first-contact insert must be queued behind the uncommitted row before it is released').toBe(FIRST_CONTACT_BURST);
    } finally {
      await blocker`ROLLBACK`.catch(() => undefined);
      blocker.release();
      await burst?.catch(() => undefined);
    }

    const responses = await burst;
    expect(await accountSequenceValue(), 'each request drew an id for its own insert').toBeGreaterThanOrEqual(sequenceBefore + BigInt(FIRST_CONTACT_BURST));
    for (const response of responses) expect(response.status(), `${response.url()} answered ${await response.text()}`).toBe(200);

    const accountResponses = responses.filter(response => new URL(response.url()).pathname === '/api/v1/account');
    const reportedIds = new Set(await Promise.all(accountResponses.map(async response => ((await response.json()) as { id: string }).id)));
    const rows = await accountIdsFor(persona.sub);
    expect(rows).toHaveLength(1);
    expect([...reportedIds]).toEqual(rows);
  });
});

test.describe('memoir deletion lockout', () => {
  test('should refuse every account surface with 403 ACC_002 once deletion leaves none, and serve it again once restored', async ({ memoir }) => {
    const persona = await memoir.persona({ label: 'deletion-lock', onboard: true });
    const { ctx } = persona;
    const account = await getAccount(ctx);
    const commandId = randomUUID();
    const deviceId = randomUUID();

    await setDeletionState(account.id, 'pending');
    await expectRefusal(await ctx.get('/api/v1/account'), 403, 'ACC_002');
    await expectRefusal(await ctx.get('/api/v1/sync/delta?since=0'), 403, 'ACC_002');
    await expectRefusal(await memoirMutate(ctx, 'post', '/api/v1/sync/commands', { data: { commands: [questEnvelope(commandId, 'E2E locked out')] } }), 403, 'ACC_002');
    await expectRefusal(await memoirMutate(ctx, 'patch', '/api/v1/account', { data: { weekStart: account.weekStart === 3 ? 4 : 3 } }), 403, 'ACC_002');
    await expectRefusal(await memoirMutate(ctx, 'put', `/api/v1/account/devices/${deviceId}`, { data: { pushOptIn: false } }), 403, 'ACC_002');

    for (const state of LOCKED_STATES.slice(1)) {
      await setDeletionState(account.id, state);
      await test.step(`${state} is locked out too`, async () => expectRefusal(await ctx.get('/api/v1/account'), 403, 'ACC_002'));
    }

    const sql = memoirDb();
    const [leaked] = await sql<{ commands: number; devices: number; weekStart: number }[]>`
      SELECT
        (SELECT count(*)::int FROM command_log WHERE account_id = ${account.id}) AS commands,
        (SELECT count(*)::int FROM devices WHERE account_id = ${account.id}) AS devices,
        (SELECT week_start FROM accounts WHERE id = ${account.id}) AS "weekStart"
    `;
    expect(leaked, 'a refused request must leave nothing behind').toEqual({ commands: 0, devices: 0, weekStart: account.weekStart });

    await setDeletionState(account.id, 'none');
    expect((await getAccount(ctx)).id).toBe(account.id);
    const outcome = await submitCommand(ctx, 'quest.create', dailyQuestDraft('E2E unlocked'), { commandId });
    expect(outcome, 'the refused command id was never claimed, so it applies afresh').toMatchObject({ status: 'applied', replayed: false });
    expect((await registerDevice(persona, deviceId, 'e2e-unlocked')).status()).toBe(200);
  });
});

test.describe('memoir command log', () => {
  test('should reject a duplicate (account_id, command_id) at the primary key while the same id stays free for another account', async ({ memoir }) => {
    const [owner, other] = await Promise.all([memoir.disposableAccount('cmdlog-owner'), memoir.disposableAccount('cmdlog-other')]);
    const sql = memoirDb();
    const commandId = randomUUID();
    const original = { id: '1' };

    await sql`INSERT INTO command_log (account_id, command_id, type, status, result) VALUES (${owner.id}, ${commandId}, 'quest.create', 'applied', ${sql.json(original)})`;
    const duplicate = await sql`INSERT INTO command_log (account_id, command_id, type, status) VALUES (${owner.id}, ${commandId}, 'quest.delete', 'rejected')`.then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(duplicate, 'a second row for the same (account, command) pair must violate the primary key').toMatchObject({
      code: '23505',
      constraint_name: 'command_log_account_id_command_id_pk',
    });

    const claimed = await sql`
      INSERT INTO command_log (account_id, command_id, type, status) VALUES (${owner.id}, ${commandId}, 'quest.delete', 'rejected')
      ON CONFLICT (account_id, command_id) DO NOTHING RETURNING command_id
    `;
    expect(claimed).toHaveLength(0);
    expect(await sql`SELECT type, status::text, result FROM command_log WHERE account_id = ${owner.id} AND command_id = ${commandId}`).toEqual([
      { type: 'quest.create', status: 'applied', result: original },
    ]);

    await sql`INSERT INTO command_log (account_id, command_id, type, status) VALUES (${other.id}, ${commandId}, 'quest.create', 'applied')`;
    const owners = await sql<{ accountId: string }[]>`SELECT account_id::text AS "accountId" FROM command_log WHERE command_id = ${commandId} ORDER BY account_id`;
    expect(owners.map(row => row.accountId).sort()).toEqual([owner.id, other.id].sort());
  });

  test('should scope a command id per account, so two accounts reusing one id each apply it once', async ({ memoir }) => {
    const [alice, bob] = await Promise.all([memoir.persona({ label: 'cmdid-a', onboard: true }), memoir.persona({ label: 'cmdid-b', onboard: true })]);
    const commandId = randomUUID();
    const aliceDraft = dailyQuestDraft(`E2E shared id A ${commandId}`);
    const bobDraft = dailyQuestDraft(`E2E shared id B ${commandId}`);

    const aliceOutcome = await submitCommand(alice.ctx, 'quest.create', aliceDraft, { commandId });
    const bobOutcome = await submitCommand(bob.ctx, 'quest.create', bobDraft, { commandId });
    expect(aliceOutcome).toMatchObject({ commandId, status: 'applied', replayed: false });
    expect(bobOutcome, "another account's use of the id is not a replay").toMatchObject({ commandId, status: 'applied', replayed: false });
    const aliceQuestId = String(aliceOutcome.result['id']);
    const bobQuestId = String(bobOutcome.result['id']);
    expect(bobQuestId).not.toBe(aliceQuestId);

    const replay = await submitCommand(alice.ctx, 'quest.create', aliceDraft, { commandId });
    expect(replay, 'within one account the id still deduplicates').toMatchObject({ status: 'applied', replayed: true, result: { id: aliceQuestId } });

    const [aliceDelta, bobDelta] = await Promise.all([pullFullDelta(alice.ctx), pullFullDelta(bob.ctx)]);
    expect(rowsOf(aliceDelta, 'quests').map(row => String(row['id']))).toEqual([aliceQuestId]);
    expect(rowsOf(bobDelta, 'quests').map(row => String(row['id']))).toEqual([bobQuestId]);

    const logged = await memoirDb()<{ accountId: string }[]>`SELECT account_id::text AS "accountId" FROM command_log WHERE command_id = ${commandId}`;
    const accountIds = await Promise.all([alice, bob].map(async persona => (await getAccount(persona.ctx)).id));
    expect(logged.map(row => row.accountId).sort()).toEqual(accountIds.sort());
  });
});

test.describe('memoir cross-account isolation', () => {
  test("should never serve or let one account touch another account's quests, progression, devices or tombstones", async ({ memoir }) => {
    const [alice, bob] = await Promise.all([memoir.persona({ label: 'isolation-a', onboard: true }), memoir.persona({ label: 'isolation-b', onboard: true })]);
    const today = todayLocal();
    const aliceQuestName = `E2E isolation A ${randomUUID()}`;
    const aliceDevice = randomUUID();
    const aliceRetiredDevice = randomUUID();
    const bobDevice = randomUUID();

    const aliceQuestId = String((await submitCommand(alice.ctx, 'quest.create', dailyQuestDraft(aliceQuestName, today))).result['id']);
    expect(await submitCommand(alice.ctx, 'quest.complete', { occurrenceId: `${aliceQuestId}:${today}` })).toMatchObject({ status: 'applied' });
    expect((await registerDevice(alice, aliceDevice, 'e2e-alice')).status()).toBe(200);
    expect((await registerDevice(alice, aliceRetiredDevice, 'e2e-alice-retired')).status()).toBe(200);
    expect((await memoirMutate(alice.ctx, 'delete', `/api/v1/account/devices/${aliceRetiredDevice}`)).status()).toBe(204);

    const bobQuestId = String((await submitCommand(bob.ctx, 'quest.create', dailyQuestDraft(`E2E isolation B ${randomUUID()}`, today))).result['id']);
    expect((await registerDevice(bob, bobDevice, 'e2e-bob')).status()).toBe(200);

    const [aliceDelta, bobDelta] = await Promise.all([pullFullDelta(alice.ctx), pullFullDelta(bob.ctx)]);
    const aliceIds = globalIdsByDomain(aliceDelta);
    const bobIds = globalIdsByDomain(bobDelta);
    expect(aliceIds.get('quests')).toContain(aliceQuestId);
    expect(aliceIds.get('hero_events')?.size, "alice's completion must have produced progression rows to leak").toBeGreaterThan(0);
    expect(aliceDelta.tombstones).toContainEqual(expect.objectContaining({ domain: 'devices', recordId: aliceRetiredDevice }));

    for (const [domain, ids] of aliceIds) {
      const leaked = [...(bobIds.get(domain) ?? [])].filter(id => ids.has(id));
      expect(leaked, `bob's ${domain} must hold none of alice's rows`).toEqual([]);
    }
    expect(bobIds.get('quests')).toEqual(new Set([bobQuestId]));
    expect(bobIds.get('devices')).toEqual(new Set([bobDevice]));
    expect(rowsOf(bobDelta, 'quest_logs').filter(log => String(log['questId']) === aliceQuestId)).toEqual([]);
    expect(bobDelta.tombstones.filter(tombstone => tombstone.recordId === aliceRetiredDevice)).toEqual([]);

    await expectRefusal(await registerDevice(bob, aliceDevice, 'e2e-adopted'), 404, 'DEV_001');
    await expectRefusal(await memoirMutate(bob.ctx, 'delete', `/api/v1/account/devices/${aliceDevice}`), 404, 'DEV_001');
    expectFailed(await submitCommand(bob.ctx, 'quest.update', { questId: aliceQuestId, patch: { name: 'E2E hijacked' } }), 'QST_002');
    expectFailed(await submitCommand(bob.ctx, 'quest.complete', { occurrenceId: `${aliceQuestId}:${today}` }), 'QST_002');
    expectFailed(await submitCommand(bob.ctx, 'quest.delete', { questId: aliceQuestId }), 'QST_002');

    const [aliceAfter, bobAfter] = await Promise.all([pullFullDelta(alice.ctx), pullFullDelta(bob.ctx)]);
    expect(
      rowsOf(bobAfter, 'quest_logs').filter(log => String(log['questId']) === aliceQuestId),
      "bob's refused completion left no log of his own",
    ).toEqual([]);
    expect(findRow(aliceAfter, 'devices', aliceDevice)).toMatchObject({ userAgent: 'e2e-alice' });
    expect(findRow(aliceAfter, 'quests', aliceQuestId)).toMatchObject({ name: aliceQuestName, active: true });
    expect(rowsOf(aliceAfter, 'quest_logs').filter(log => String(log['questId']) === aliceQuestId)).toHaveLength(1);

    expect(await submitCommand(alice.ctx, 'quest.update', { questId: aliceQuestId, patch: { name: `${aliceQuestName} renamed` } })).toMatchObject({ status: 'applied' });
    expect((await memoirMutate(bob.ctx, 'delete', `/api/v1/account/devices/${bobDevice}`)).status()).toBe(204);
  });
});

test.describe('memoir credential expiry', () => {
  test('should accept a fresh api://memoir user access token and refuse the identical token once it has expired', async ({ memoir }) => {
    test.setTimeout(EXPIRY_WAIT_MS + 90_000);

    const persona = await memoir.persona({ label: 'token-expiry' });
    const application = await memoir.createOAuthApp('memoir-expiry');
    const admin = (await memoir.identityAdmin()).ctx;
    const client = await registerOAuthClient(admin, application, { kind: 'WEB_CONFIDENTIAL', accessTokenTtl: TOKEN_TTL_SECONDS });
    try {
      await grantClientScope(admin, client.clientId, await findResourceScopeId(admin, MEMOIR_AUDIENCE, ACCOUNT_SCOPE));

      const identityCtx = await memoir.identityCaller(persona);
      const tokenCtx = await memoir.identityAnonymous();
      const mint = async (): Promise<string> => {
        const exchanged = await exchangeCode(tokenCtx, client, await authorizeCode(identityCtx, client, { resource: MEMOIR_AUDIENCE, scope: `openid ${ACCOUNT_SCOPE}` }));
        expect(exchanged.status(), await exchanged.text()).toBe(200);
        const body = (await exchanged.json()) as { access_token: string; expires_in: number };
        expect(body.expires_in, 'the requested 60s TTL must survive the policy floor unshortened').toBe(TOKEN_TTL_SECONDS);
        return body.access_token;
      };

      const token = await mint();
      const guest = await memoir.guest();
      const beforeExpiry = await guest.get('/api/v1/account', bearer(token));
      expect(beforeExpiry.status(), `a token still inside its TTL must be admitted — ${await beforeExpiry.text()}`).toBe(200);

      await sleep(EXPIRY_WAIT_MS);

      const afterExpiry = await guest.get('/api/v1/account', bearer(token));
      await expectRefusal(afterExpiry, 401, 'IAM_001');

      // Same client, same audience, same scope — only time moved, so a fresh token proves the refusal above was expiry, not audience/scope.
      const renewed = await guest.get('/api/v1/account', bearer(await mint()));
      expect(renewed.status(), `a fresh token from the same client must still be admitted — ${await renewed.text()}`).toBe(200);
    } finally {
      await clearClientRateLimits(client.clientId);
    }
  });
});
