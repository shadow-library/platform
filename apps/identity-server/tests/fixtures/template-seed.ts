import { ShadowApplication } from '@shadow-library/app';
import { Config, Logger } from '@shadow-library/common';

import { SeedModule } from '@server/seed.module';

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
