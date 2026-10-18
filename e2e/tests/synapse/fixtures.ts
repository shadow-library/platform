import { type APIRequestContext, test as base } from '@playwright/test';

import {
  clearIpState,
  createCredential,
  type CreatedCredential,
  createSynapseStaff,
  type CredentialOptions,
  deleteCredentialRecords,
  deleteSynapseStaff,
  freshClientIp,
  getSynapseUrl,
  readLatestCatalogVersion,
  restoreCatalogDraft,
  runAll,
  snapshotCatalogDraft,
  SynapseCatalogError,
  synapseGuest,
  type SynapseStaff,
  type SynapseStaffOptions,
} from '../../lib';

export interface SynapseHarness {
  readonly clientIp: string;
  staff(options?: Omit<SynapseStaffOptions, 'clientIp'>): Promise<SynapseStaff>;
  guest(): Promise<APIRequestContext>;
  credential(staff: SynapseStaff, options?: CredentialOptions): Promise<CreatedCredential>;
  trackCredential(id: string): void;
  preserveCatalogDraft(): Promise<void>;
}

/** Credentials are only ever revoked through the API, so the rows a test made are deleted after it; the shared catalog draft is put back as found. */
export const test = base.extend<{ synapse: SynapseHarness }>({
  // eslint-disable-next-line no-empty-pattern
  synapse: async ({}, use) => {
    base.skip(!getSynapseUrl(), 'E2E_SYNAPSE_URL is set to an empty value, so Synapse is opted out of this run');
    const clientIp = await freshClientIp();
    const contexts: APIRequestContext[] = [];
    const staffAccounts: SynapseStaff[] = [];
    const credentialIds: string[] = [];
    let draftPreserved = false;
    let versionBefore = 0;
    let draft: Awaited<ReturnType<typeof snapshotCatalogDraft>> = null;

    await use({
      clientIp,
      staff: async options => {
        const staff = await createSynapseStaff({ ...options, clientIp });
        staffAccounts.push(staff);
        return staff;
      },
      guest: async () => {
        const ctx = await synapseGuest(clientIp);
        contexts.push(ctx);
        return ctx;
      },
      credential: async (staff, options) => {
        const credential = await createCredential(staff.ctx, options);
        credentialIds.push(credential.id);
        return credential;
      },
      trackCredential: id => {
        credentialIds.push(id);
      },
      preserveCatalogDraft: async () => {
        if (draftPreserved) return;
        draft = await snapshotCatalogDraft();
        versionBefore = await readLatestCatalogVersion();
        draftPreserved = true;
      },
    });

    await runAll([
      async () => {
        if (draftPreserved) await restoreCatalogDraft(draft);
      },
      async () => {
        if (draftPreserved) {
          const versionAfter = await readLatestCatalogVersion();
          if (versionAfter > versionBefore)
            throw new SynapseCatalogError(`catalog v${versionAfter} was published during the run; its credentials were kept because the live catalog may reference them`);
        }
        await deleteCredentialRecords(credentialIds);
      },
      ...contexts.map(ctx => () => ctx.dispose()),
      ...staffAccounts.map(staff => () => deleteSynapseStaff(staff)),
      () => clearIpState(clientIp),
    ]);
  },
});

export { expect } from '@playwright/test';
