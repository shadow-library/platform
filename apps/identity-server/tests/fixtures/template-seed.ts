/**
 * Importing npm packages
 */
import { ShadowApplication } from '@shadow-library/app';
import { Config, Logger } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { SeedModule } from '@server/seed.module';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Boots the platform bootstrap module graph (no HTTP server) against `DATABASE_POSTGRES_URL`, so the
 * template database carries identity's baseline OIDC/SAML keys and the ecosystem seed records before
 * it is marked `IS_TEMPLATE`. Spawned as a subprocess by `scripts/db.ts create-template`, the same way
 * that command spawns the migrate entry — see `shadow.db.templateSeed` in this workspace's package.json.
 */
const logger = Logger.getLogger('Scripts', 'TemplateSeed');

async function seedTemplate(): Promise<void> {
  const url = process.env.DATABASE_POSTGRES_URL;
  if (!url) {
    logger.error('DATABASE_POSTGRES_URL is not set; cannot seed the template database');
    process.exit(1);
  }

  Config['cache'].set('database.postgres.url', url);
  const app = new ShadowApplication(SeedModule);
  await app.init();
  await app.stop();
}

if (import.meta.path === Bun.main) {
  Logger.attachTransport('console:pretty');
  await seedTemplate().catch(err => (logger.error('Template seed failed', err), process.exit(1)));
}
