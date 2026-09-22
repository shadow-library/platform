/**
 * Importing npm packages
 */
import { randomBytes } from 'node:crypto';

import { type APIRequestContext, type APIResponse } from '@playwright/test';

/**
 * Importing user defined packages
 */
import {
  type ApplicationVisibility,
  auditChain,
  auditChainTip,
  type AuditRow,
  countAuditChainRoots,
  csrfHeaders,
  IDENTITY_CSRF_SEED_PATH,
  identityMutate,
  type OAuthApplication,
  updateApplication,
} from '../../lib';
import { expect, type IdentityHarness, type IdentityTeam, test } from './fixtures';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * The audit log's chain, read where it is observable: the rows themselves. Identity writes an event inside the
 * transaction that performs the audited action, under an advisory lock keyed by the chain the event belongs to — the
 * organisation named on it, or the global chain of events carrying none. A spec can therefore assert linkage, the
 * independence of the two kinds of chain, and that concurrency does not break either. It cannot assert verification:
 * `AuditService.verifyChain` has no HTTP surface, and re-deriving a row's hash here would only re-implement the
 * verifier under test. Each test drives its own organisation, so its chain starts empty and every row in it is one the
 * test caused; the global chain is shared with every other spec, so it is asserted over whole contiguous segments.
 */

function domainPath(organisationId: string): string {
  return `/api/v1/organisations/${organisationId}/domains`;
}

function newDomain(): { domain: string } {
  return { domain: `e2e-${randomBytes(6).toString('hex')}.example.test` };
}

/** Registers a domain on the organisation — an org-scoped audited action with no DNS or worker behind it. */
function registerDomain(orgAdmin: APIRequestContext, organisationId: string): Promise<APIResponse> {
  return identityMutate(orgAdmin, 'post', domainPath(organisationId), newDomain());
}

/** Asserts `rows` form one unbroken run whose first link is `previousHash` (null when the chain starts here). */
function expectLinked(rows: AuditRow[], previousHash: string | null, message: string): void {
  expect(
    rows.map(row => row.prevHash),
    message,
  ).toEqual(rows.map((_, index) => (index === 0 ? previousHash : (rows[index - 1] as AuditRow).hash)));
}

async function auditedTeam(identity: IdentityHarness, label: string): Promise<IdentityTeam> {
  const team = await identity.createTeam({ label });
  expect(await auditChain(team.organisationId), 'a database-created organisation has no audit history').toEqual([]);
  return team;
}

/** Changing a platform application's visibility — an audited action identity records on the global chain. */
async function globalAction(identity: IdentityHarness, application: OAuthApplication, visibility: ApplicationVisibility): Promise<void> {
  await updateApplication((await identity.admin()).ctx, application.applicationId, { visibility });
}

test.describe('identity audit — chain integrity', () => {
  test('should chain consecutive global events, each one to the hash of the event before it', async ({ identity }) => {
    const application = await identity.createOAuthApp('audit-global');
    const tip = await auditChainTip(null);
    expect(tip, 'the deployment has a global audit history to extend').toBeDefined();

    for (const visibility of ['RESTRICTED', 'PUBLIC', 'RESTRICTED'] as ApplicationVisibility[]) await globalAction(identity, application, visibility);

    const appended = await auditChain(null, tip?.id);
    expect(appended.length, 'the actions appended to the global chain').toBeGreaterThanOrEqual(3);
    expectLinked(appended, tip?.hash ?? null, 'every global row chains to the one before it');
    expect(
      appended.every(row => row.organisationId === null),
      'the global chain holds only events carrying no organisation',
    ).toBe(true);
    expect(await countAuditChainRoots(null), 'the global chain starts exactly once').toBe(1);
  });

  test('should start an organisation chain at its own first event and keep it independent of the global one', async ({ identity }) => {
    const team = await auditedTeam(identity, 'audit-org');
    const application = await identity.createOAuthApp('audit-org');
    const globalTip = await auditChainTip(null);

    expect((await registerDomain(team.ownerCtx, team.organisationId)).status()).toBe(201);
    await globalAction(identity, application, 'RESTRICTED');
    expect((await registerDomain(team.ownerCtx, team.organisationId)).status()).toBe(201);
    expect((await registerDomain(team.ownerCtx, team.organisationId)).status()).toBe(201);

    const organisation = await auditChain(team.organisationId);
    expect(organisation.map(row => row.action)).toEqual(['org.domain_registered', 'org.domain_registered', 'org.domain_registered']);
    expectLinked(organisation, null, 'an organisation chain starts at null and links only to itself');
    expect(await countAuditChainRoots(team.organisationId)).toBe(1);

    const global = await auditChain(null, globalTip?.id);
    expectLinked(global, globalTip?.hash ?? null, 'the interleaved global events chain past the organisation’s');
    const organisationHashes = new Set(organisation.map(row => row.hash));
    expect(
      global.some(row => organisationHashes.has(row.prevHash ?? '')),
      'no global row links to an organisation row',
    ).toBe(false);
  });

  test('should keep an organisation chain unbroken across ten concurrent audited actions', async ({ identity }) => {
    const team = await auditedTeam(identity, 'audit-concurrent');

    const headers = await csrfHeaders(team.ownerCtx, IDENTITY_CSRF_SEED_PATH);
    const responses = await Promise.all(Array.from({ length: 10 }, () => team.ownerCtx.post(domainPath(team.organisationId), { headers, data: newDomain() })));
    expect(responses.map(response => response.status())).toEqual(Array.from({ length: 10 }, () => 201));

    const rows = await auditChain(team.organisationId);
    expect(rows).toHaveLength(10);
    expectLinked(rows, null, 'ten concurrent writes still form one chain');
    expect(new Set(rows.map(row => row.hash)).size, 'every row has its own hash').toBe(10);
  });

  test('should record an organisation event against its organisation and a platform one globally', async ({ identity }) => {
    const team = await auditedTeam(identity, 'audit-scope');
    const application = await identity.createOAuthApp('audit-scope');
    const globalTip = await auditChainTip(null);

    await updateApplication((await identity.admin()).ctx, application.applicationId, { visibility: 'RESTRICTED' });
    expect((await registerDomain(team.ownerCtx, team.organisationId)).status()).toBe(201);

    const platform = await auditChain(null, globalTip?.id);
    expect(
      platform.map(row => row.action),
      'a platform application change is a global event',
    ).toContain('application.visibility.changed');
    expect(
      (await auditChain(team.organisationId)).map(row => ({ action: row.action, organisationId: row.organisationId })),
      'the organisation sees only its own event',
    ).toEqual([{ action: 'org.domain_registered', organisationId: team.organisationId }]);
  });
});
