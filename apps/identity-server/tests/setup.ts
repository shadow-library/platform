/**
 * Importing npm packages
 */
import { Logger } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { createTemplateDatabase } from '@scripts/create-template-db';

/**
 * Preloaded once per test process: builds the migrated template database that every
 * suite clones from. Keeps `bun test` self-contained (no external setup step).
 */
Logger.attachTransport('file:json');
await createTemplateDatabase();
