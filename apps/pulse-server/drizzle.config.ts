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

const url = process.env.PRIMARY_DATABASE_URL ?? 'postgresql://admin:password@localhost/shadow_pulse';

export default defineConfig({
  out: './generated/drizzle',
  dialect: 'postgresql',
  schema: './src/modules/datastore/schemas/index.ts',
  dbCredentials: { url },
});
