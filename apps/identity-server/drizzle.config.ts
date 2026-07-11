/**
 * Importing npm packages
 */
import { defineConfig } from 'drizzle-kit';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

const url = process.env.PRIMARY_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/shadow_identity';

export default defineConfig({
  out: './generated/drizzle',
  dialect: 'postgresql',
  schema: './src/modules/infrastructure/datastore/schemas/index.ts',
  dbCredentials: { url },
});
