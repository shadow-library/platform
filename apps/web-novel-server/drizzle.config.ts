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

const url = process.env.DATABASE_POSTGRES_URL ?? 'postgresql://postgres:postgres@localhost:5432/shadow_webnovel';

export default defineConfig({
  out: './generated/drizzle',
  dialect: 'postgresql',
  schema: './src/modules/datastore/schemas/index.ts',
  dbCredentials: { url },
});
