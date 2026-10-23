import { expect, test } from '@playwright/test';

import { apiContext, requireProductUrl } from '../../lib';

interface VersionSummary {
  status: string;
}

/**
 * `seedBaseline` runs at every boot and creates the branded design system (1 layout, 2 partials) plus the `BASELINE_TEMPLATES` catalog, each item only when absent so
 * operator customisation is never clobbered. Presence is asserted by the seeded keys, never a raw count: this shared dev database accumulates `e2e-*` residue.
 */
const IDENTITY_CATALOGUE_KEYS = ['auth.register.otp', 'auth.login.otp', 'auth.password.changed', 'security.new-signin', 'user.email.verification'] as const;

test.describe('baseline catalogue', () => {
  test.beforeEach(() => requireProductUrl('pulse'));

  test('should seed the default layout with a resolvable PUBLISHED version', async () => {
    const ctx = await apiContext('pulse', 'admin');

    const list = await ctx.get('/api/v1/layouts');
    expect(list.status(), await list.text()).toBe(200);
    const { items } = (await list.json()) as { items: { id: string; layoutKey: string }[] };
    const layout = items.find(item => item.layoutKey === 'default');
    expect(layout, 'expected the baseline "default" layout to exist').toBeTruthy();

    const detail = await ctx.get(`/api/v1/layouts/${layout?.id}`);
    expect(detail.status()).toBe(200);
    const { versions } = (await detail.json()) as { versions: VersionSummary[] };
    expect(versions.some(version => version.status === 'PUBLISHED')).toBe(true);
  });

  test('should seed the otp-code and button partials, each with a resolvable PUBLISHED version', async () => {
    const ctx = await apiContext('pulse', 'admin');

    const list = await ctx.get('/api/v1/partials');
    expect(list.status(), await list.text()).toBe(200);
    const { items } = (await list.json()) as { items: { id: string; partialKey: string }[] };

    for (const partialKey of ['otp-code', 'button']) {
      const partial = items.find(item => item.partialKey === partialKey);
      expect(partial, `expected the baseline "${partialKey}" partial to exist`).toBeTruthy();

      const detail = await ctx.get(`/api/v1/partials/${partial?.id}`);
      expect(detail.status()).toBe(200);
      const { versions } = (await detail.json()) as { versions: VersionSummary[] };
      expect(
        versions.some(version => version.status === 'PUBLISHED'),
        `expected ${partialKey} to have a PUBLISHED version`,
      ).toBe(true);
    }
  });

  test('should seed every identity-catalogue template key with a resolvable PUBLISHED version', async () => {
    const ctx = await apiContext('pulse', 'admin');

    for (const templateKey of IDENTITY_CATALOGUE_KEYS) {
      const list = await ctx.get(`/api/v1/templates?key=${templateKey}`);
      expect(list.status(), await list.text()).toBe(200);
      const { items } = (await list.json()) as { items: { id: string; templateKey: string }[] };
      const template = items.find(item => item.templateKey === templateKey);
      expect(template, `expected the baseline "${templateKey}" template to exist`).toBeTruthy();

      const versions = await ctx.get(`/api/v1/templates/${template?.id}/versions`);
      expect(versions.status()).toBe(200);
      const { items: versionItems } = (await versions.json()) as { items: VersionSummary[] };
      expect(
        versionItems.some(version => version.status === 'PUBLISHED'),
        `expected ${templateKey} to have a PUBLISHED version`,
      ).toBe(true);
    }
  });
});
