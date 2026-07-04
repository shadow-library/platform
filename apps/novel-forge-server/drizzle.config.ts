/**
 * Importing packages with side effects
 */

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

const url = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';

export default defineConfig({
  out: './generated/drizzle',
  dialect: 'postgresql',
  schema: './src/database/schemas/index.ts',
  dbCredentials: { url },
});
