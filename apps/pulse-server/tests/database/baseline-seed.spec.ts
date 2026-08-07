import { describe, expect, it } from 'bun:test';

import { and, eq, inArray } from 'drizzle-orm';

import { type PrimaryDatabase, schema } from '@server/database';
import { seedBaseline } from '@server/database/seed';
import { TestEnvironment } from '@tests/test-environment';

/**
 * XA-1 regression: the production baseline seed (`seedBaseline`, run by `src/migrate.ts` after migrations) must
 * populate the template catalogue an empty deployment starts with, and must be safe to run again on every boot.
 */
const testEnv = new TestEnvironment('baseline_seed_test');

/** A representative slice of the identity catalogue; if these resolve, identity → pulse dispatch no longer 404s with TPL_001. */
const IDENTITY_TEMPLATE_KEYS = ['auth.register.otp', 'auth.login.otp', 'auth.password.changed', 'security.new-signin', 'user.email.verification'];

async function countBaseline(db: PrimaryDatabase): Promise<{ layouts: number; partials: number; templates: number; publishedVersions: number }> {
  const [layouts, partials, templates, publishedVersions] = await Promise.all([
    db.$count(schema.layouts),
    db.$count(schema.partials),
    db.$count(schema.templates),
    db.$count(schema.templateVersions, eq(schema.templateVersions.status, 'PUBLISHED')),
  ]);
  return { layouts, partials, templates, publishedVersions };
}

describe('Baseline Seed', () => {
  testEnv.init();

  it('should populate the baseline layouts, partials, and template catalogue', async () => {
    const db = testEnv.getPostgresClient();
    const counts = await countBaseline(db);

    expect(counts.layouts).toBeGreaterThanOrEqual(1);
    expect(counts.partials).toBeGreaterThanOrEqual(2);
    expect(counts.templates).toBeGreaterThanOrEqual(19);
  });

  it('should publish a resolvable version for every identity catalogue template', async () => {
    const db = testEnv.getPostgresClient();

    for (const templateKey of IDENTITY_TEMPLATE_KEYS) {
      const template = await db.query.templates.findFirst({
        where: eq(schema.templates.templateKey, templateKey),
        with: { versions: { where: eq(schema.templateVersions.status, 'PUBLISHED') } },
      });
      expect(template, `expected baseline template '${templateKey}' to exist`).toBeDefined();
      expect(template?.versions.length, `expected '${templateKey}' to have a published version`).toBeGreaterThanOrEqual(1);
    }
  });

  it('should be idempotent on a second run — no rows duplicated or clobbered', async () => {
    const db = testEnv.getPostgresClient();
    const before = await countBaseline(db);

    await seedBaseline(db);

    const after = await countBaseline(db);
    expect(after).toStrictEqual(before);
  });

  it('should re-establish the catalogue when run against an emptied datastore', async () => {
    const db = testEnv.getPostgresClient();

    await db.delete(schema.notificationMessages);
    await db.delete(schema.notificationJobs);
    await db.delete(schema.templates);
    await db.delete(schema.layouts);
    await db.delete(schema.partials);
    expect(await db.$count(schema.templates)).toBe(0);

    await seedBaseline(db);

    const counts = await countBaseline(db);
    expect(counts.layouts).toBeGreaterThanOrEqual(1);
    expect(counts.partials).toBeGreaterThanOrEqual(2);
    expect(counts.templates).toBeGreaterThanOrEqual(19);

    const identity = await db
      .select({ templateKey: schema.templates.templateKey })
      .from(schema.templates)
      .where(and(inArray(schema.templates.templateKey, IDENTITY_TEMPLATE_KEYS)));
    expect(identity.map(row => row.templateKey).sort()).toStrictEqual([...IDENTITY_TEMPLATE_KEYS].sort());
  });
});
