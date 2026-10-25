import { randomUUID } from 'node:crypto';

import {
  applyCatalogChange,
  type CatalogIssue,
  listCatalogVersionSummaries,
  openAiCompatibleProvider,
  readActiveCatalog,
  revokeCredential,
  rollbackCatalog,
  uniqueProviderKey,
  unreachableOrigin,
  withProviders,
} from '../../lib';
import { expect, test } from './fixtures';
import { expectError, jsonOf } from './helpers';

const STAFF_ROLES = ['SynapseAdmin', 'SynapseCredentialsAdmin'] as const;

function issuesUnder(issues: readonly CatalogIssue[], providerKeys: readonly string[]): { path: string; code: string }[] {
  return issues.filter(issue => providerKeys.some(key => issue.path.startsWith(`providers.${key}`))).map(({ path, code }) => ({ path, code }));
}

test.describe('synapse catalog changes', () => {
  test('should refuse a change naming an unknown, revoked or origin-mismatched credential with its issues and publish nothing', async ({ synapse }) => {
    await synapse.guardCatalog();
    const staff = await synapse.staff({ label: 'change-issues', roles: STAFF_ROLES });
    const live = await synapse.credential(staff, { label: 'live' });
    const doomed = await synapse.credential(staff, { label: 'doomed' });
    await jsonOf(await revokeCredential(staff.ctx, doomed.id));
    const keys = { revoked: uniqueProviderKey('revoked'), unknown: uniqueProviderKey('unknown'), mismatch: uniqueProviderKey('mismatch'), bound: uniqueProviderKey('bound') };
    const active = await readActiveCatalog(staff.ctx);
    const versionsBefore = await listCatalogVersionSummaries(staff.ctx);

    const refused = await applyCatalogChange(
      staff.ctx,
      withProviders(active.document, {
        [keys.revoked]: openAiCompatibleProvider(doomed.id, `${doomed.allowedOrigin}/v1`),
        [keys.unknown]: openAiCompatibleProvider(randomUUID(), `${live.allowedOrigin}/v1`),
        [keys.mismatch]: openAiCompatibleProvider(live.id, `${unreachableOrigin()}/v1`),
        [keys.bound]: openAiCompatibleProvider(live.id, `${live.allowedOrigin}/v1`),
      }),
      active.version,
    );

    await expectError(refused, 422, 'SYN_CATALOG_INVALID');
    const { issues } = (await refused.json()) as { issues: CatalogIssue[] };
    const expected = [
      { path: `providers.${keys.revoked}.credential`, code: 'credential_revoked' },
      { path: `providers.${keys.unknown}.credential`, code: 'unknown_credential' },
      { path: `providers.${keys.mismatch}.url`, code: 'credential_origin_mismatch' },
    ];
    expect(issuesUnder(issues, Object.values(keys))).toEqual(expect.arrayContaining(expected));
    expect(issuesUnder(issues, Object.values(keys)), 'the provider bound to its credential origin raises nothing').toHaveLength(expected.length);
    expect(await listCatalogVersionSummaries(staff.ctx), 'a refused change leaves every version as it was').toEqual(versionsBefore);
  });

  test('should answer the active version and publish nothing for a change equal to it', async ({ synapse }) => {
    await synapse.guardCatalog();
    const staff = await synapse.staff({ label: 'change-noop', roles: STAFF_ROLES });
    const active = await readActiveCatalog(staff.ctx);
    test.skip(active.version === null, 'no catalog has been published in this environment');
    const versionsBefore = await listCatalogVersionSummaries(staff.ctx);

    const answered = await jsonOf<{ version: number; state: string }>(await applyCatalogChange(staff.ctx, active.document, active.version));

    expect(answered).toMatchObject({ version: active.version, state: 'PUBLISHED' });
    expect(await listCatalogVersionSummaries(staff.ctx)).toEqual(versionsBefore);
  });

  test('should refuse a change or a rollback made against a version that is no longer active', async ({ synapse }) => {
    await synapse.guardCatalog();
    const staff = await synapse.staff({ label: 'change-stale', roles: STAFF_ROLES });
    const active = await readActiveCatalog(staff.ctx);
    test.skip(active.version === null, 'no catalog has been published in this environment');
    const stale = (active.version ?? 0) + 1;

    await expectError(await applyCatalogChange(staff.ctx, active.document, stale), 409, 'SYN_CATALOG_CONFLICT');
    await expectError(await rollbackCatalog(staff.ctx, active.version ?? 1, stale), 409, 'SYN_CATALOG_CONFLICT');
  });

  test('should refuse an operator a change to providers, which needs provider writes', async ({ synapse }) => {
    await synapse.guardCatalog();
    const admin = await synapse.staff({ label: 'change-admin', roles: STAFF_ROLES });
    const operator = await synapse.staff({ label: 'change-operator', roles: ['SynapseOperator'] });
    const credential = await synapse.credential(admin, { label: 'operator-refused' });
    const active = await readActiveCatalog(operator.ctx);
    const providerKey = uniqueProviderKey('operator');

    const refused = await applyCatalogChange(
      operator.ctx,
      withProviders(active.document, { [providerKey]: openAiCompatibleProvider(credential.id, `${credential.allowedOrigin}/v1`) }),
      active.version,
    );

    await expectError(refused, 403, 'IAM_002');
  });
});
