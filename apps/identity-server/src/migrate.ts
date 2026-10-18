import { drizzle } from 'drizzle-orm/bun-sql';
import { migrate } from 'drizzle-orm/bun-sql/migrator';
import { Config, Logger } from '@shadow-library/common';
import { parseKeyring, SecretBox } from '@shadow-library/common/crypto';
import { createMigrationClient } from '@shadow-library/modules/bootstrap';

import '@server/bootstrap';

import { APP_NAME } from '@server/constants';
import { LegacyKeyProvider } from '@server/modules/auth/keys/legacy-key-provider';
import { SealedSecretRepository } from '@server/modules/auth/keys/sealed-secret.repository';
import { backfillSealedSecrets } from '@server/modules/auth/keys/secret-backfill';
import { SecretSealer } from '@server/modules/auth/keys/secret-sealer.service';
import * as schema from '@server/modules/infrastructure/datastore/schemas';

import { runMigrateJob } from './migrate.job';

const logger = Logger.getLogger(APP_NAME, 'migrate-db');
Logger.attachTransport(Config.isProd() ? 'console:json' : 'console:pretty');

const url = process.env.DATABASE_POSTGRES_URL;
if (!url) {
  logger.error('DATABASE_POSTGRES_URL is not set; cannot run migrations');
  process.exit(1);
}

const client = createMigrationClient(url);
const db = drizzle({ client, schema });
const exitCode = await runMigrateJob(
  {
    prepareBackfill: () => {
      const sealer = new SecretSealer(new SecretBox(parseKeyring(Config.get('identity.crypto.keys'))), new LegacyKeyProvider(Config.get('identity.hmac-key')));
      return () => backfillSealedSecrets(new SealedSecretRepository(db), sealer);
    },
    migrate: () => migrate(db, { migrationsFolder: 'generated/drizzle' }),
  },
  logger,
);
await client.close();
process.exit(exitCode);
