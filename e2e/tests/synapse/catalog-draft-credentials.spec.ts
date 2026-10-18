import { randomUUID } from 'node:crypto';

import {
  type CatalogIssue,
  listCatalogVersionSummaries,
  openAiCompatibleProvider,
  publishCatalogDraft,
  readBaselineDocument,
  revokeCredential,
  saveCatalogDraft,
  uniqueProviderKey,
  unreachableOrigin,
  validateCatalogDraft,
  withProviders,
} from '../../lib';
import { expect, test } from './fixtures';
import { expectError, jsonOf } from './helpers';

const STAFF_ROLES = ['SynapseAdmin', 'SynapseCredentialsAdmin'] as const;

function issuesUnder(issues: readonly CatalogIssue[], providerKeys: readonly string[]): { path: string; code: string }[] {
  return issues.filter(issue => providerKeys.some(key => issue.path.startsWith(`providers.${key}`))).map(({ path, code }) => ({ path, code }));
}

test.describe('synapse catalog draft credentials', () => {
  test('should flag a draft provider naming an unknown, revoked or origin-mismatched credential and accept one bound to its origin', async ({ synapse }) => {
    await synapse.preserveCatalogDraft();
    const staff = await synapse.staff({ label: 'draft-issues', roles: STAFF_ROLES });
    const live = await synapse.credential(staff, { label: 'live' });
    const doomed = await synapse.credential(staff, { label: 'doomed' });
    await jsonOf(await revokeCredential(staff.ctx, doomed.id));
    const keys = { revoked: uniqueProviderKey('revoked'), unknown: uniqueProviderKey('unknown'), mismatch: uniqueProviderKey('mismatch'), bound: uniqueProviderKey('bound') };
    const baseline = await readBaselineDocument(staff.ctx);

    const saved = await saveCatalogDraft(
      staff.ctx,
      withProviders(baseline, {
        [keys.revoked]: openAiCompatibleProvider(doomed.id, `${doomed.allowedOrigin}/v1`),
        [keys.unknown]: openAiCompatibleProvider(randomUUID(), `${live.allowedOrigin}/v1`),
        [keys.mismatch]: openAiCompatibleProvider(live.id, `${unreachableOrigin()}/v1`),
        [keys.bound]: openAiCompatibleProvider(live.id, `${live.allowedOrigin}/v1`),
      }),
    );

    const expected = [
      { path: `providers.${keys.revoked}.credential`, code: 'credential_revoked' },
      { path: `providers.${keys.unknown}.credential`, code: 'unknown_credential' },
      { path: `providers.${keys.mismatch}.url`, code: 'credential_origin_mismatch' },
    ];
    const allKeys = Object.values(keys);
    expect(issuesUnder(saved.issues, allKeys)).toEqual(expect.arrayContaining(expected));
    expect(issuesUnder(saved.issues, allKeys), 'the provider bound to its credential origin raises nothing').toHaveLength(expected.length);

    const validation = await jsonOf<{ valid: boolean; issues: CatalogIssue[] }>(await validateCatalogDraft(staff.ctx));
    expect(validation.valid).toBe(false);
    expect(issuesUnder(validation.issues, allKeys)).toEqual(expect.arrayContaining(expected));

    const repaired = await saveCatalogDraft(staff.ctx, withProviders(baseline, { [keys.bound]: openAiCompatibleProvider(live.id, `${live.allowedOrigin}/v1`) }));
    expect(issuesUnder(repaired.issues, allKeys)).toEqual([]);
  });

  test('should refuse to publish a draft naming a credential revoked after it was drafted and publish nothing', async ({ synapse }) => {
    await synapse.preserveCatalogDraft();
    const staff = await synapse.staff({ label: 'draft-publish', roles: STAFF_ROLES });
    const credential = await synapse.credential(staff, { label: 'revoked-later' });
    const providerKey = uniqueProviderKey('later');
    const baseline = await readBaselineDocument(staff.ctx);

    const saved = await saveCatalogDraft(staff.ctx, withProviders(baseline, { [providerKey]: openAiCompatibleProvider(credential.id, `${credential.allowedOrigin}/v1`) }));
    expect(issuesUnder(saved.issues, [providerKey]), 'a live credential on its own origin is publishable').toEqual([]);
    const versionsBefore = await listCatalogVersionSummaries(staff.ctx);

    const revoked = await jsonOf<{ revokedAt?: string; referencedBy: string[] }>(await revokeCredential(staff.ctx, credential.id));
    expect(revoked.revokedAt, 'only the published catalog blocks a revoke, so a draft reference does not').toBeDefined();
    expect(revoked.referencedBy).toEqual([]);

    const refused = await publishCatalogDraft(staff.ctx, saved.fingerprint);
    await expectError(refused, 422, 'SYN_CATALOG_INVALID');
    const { issues } = (await refused.json()) as { issues: CatalogIssue[] };
    expect(issuesUnder(issues, [providerKey])).toEqual([{ path: `providers.${providerKey}.credential`, code: 'credential_revoked' }]);
    expect(await listCatalogVersionSummaries(staff.ctx), 'a refused publish leaves every version as it was').toEqual(versionsBefore);
  });
});
