import { InferSelectModel } from 'drizzle-orm';
import { bigint, bigserial, integer, pgTable, timestamp, unique, varchar } from 'drizzle-orm/pg-core';

import { jsonb } from './jsonb';
import { projects } from './projects';

export namespace Plugins {
  export type ProjectPlugin = InferSelectModel<typeof projectPlugins>;
  export type KvEntry = InferSelectModel<typeof pluginKv>;
}

/** No enum of plugin ids — the disk is the catalog, so a row can outlive the code it names. */
export const projectPlugins = pgTable(
  'project_plugins',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    projectId: bigint('project_id', { mode: 'bigint' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    pluginId: varchar('plugin_id', { length: 64 }).notNull(),
    pluginVersion: varchar('plugin_version', { length: 32 }).notNull(),
    config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
    ordinal: integer('ordinal').notNull().default(0),
    enabledAt: timestamp('enabled_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [unique().on(t.projectId, t.pluginId)],
);

/** A plugin's working state for one novel. Settings live on `project_plugins.config`; this is everything else. */
export const pluginKv = pgTable(
  'plugin_kv',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    projectId: bigint('project_id', { mode: 'bigint' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    pluginId: varchar('plugin_id', { length: 64 }).notNull(),
    key: varchar('key', { length: 128 }).notNull(),
    value: jsonb('value').notNull(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [unique().on(t.projectId, t.pluginId, t.key)],
);
