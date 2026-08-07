import { InferEnum, InferSelectModel, relations } from 'drizzle-orm';
import { bigint, bigserial, boolean, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, unique, varchar } from 'drizzle-orm/pg-core';

import { notificationChannel, priority as priorityEnum } from './notification-jobs';

export namespace Template {
  export type Template = InferSelectModel<typeof templates>;
  export type Version = InferSelectModel<typeof templateVersions>;
  export type Content = InferSelectModel<typeof templateContents>;
  export type ChannelSetting = InferSelectModel<typeof templateChannelSettings>;
  export type Layout = InferSelectModel<typeof layouts>;
  export type LayoutVersion = InferSelectModel<typeof layoutVersions>;
  export type Partial = InferSelectModel<typeof partials>;
  export type PartialVersion = InferSelectModel<typeof partialVersions>;

  export type MessageType = InferEnum<typeof messageTypes>;
  export type VersionStatus = InferEnum<typeof versionStatus>;

  /** Declared per template — the producer↔template contract; validated at send and author time. */
  export interface VariableSchema {
    variables: Record<string, VariableDefinition>;
  }
  export interface VariableDefinition {
    type: 'string' | 'number' | 'boolean';
    required: boolean;
    description?: string;
    example?: string;
  }
}

export const messageTypes = pgEnum('message_types', ['OTP', 'TRANSACTIONAL', 'PROMOTIONAL']);

/** The CMS publishing lifecycle. Exactly one PUBLISHED version per entity is used for live sends. */
export const versionStatus = pgEnum('version_status', ['DRAFT', 'PUBLISHED', 'ARCHIVED']);

/**
 * A template — the logical message addressed by `templateKey`. This is the stable aggregate root that
 * `notification_jobs` references; its metadata + variable contract live here, while the renderable
 * content lives in immutable {@link templateVersions}. Channel enablement (which channels fan out) is a
 * per-template setting in {@link templateChannelSettings}.
 */
export const templates = pgTable('templates', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  templateKey: varchar('template_key', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  description: varchar('description', { length: 500 }),
  messageType: messageTypes('message_type').notNull().default('TRANSACTIONAL'),
  /** Delivery priority — an axis independent of messageType; sets the job's retry backoff aggressiveness. */
  priority: priorityEnum('priority').notNull().default('MEDIUM'),
  category: varchar('category', { length: 100 }),
  /** The declared variable contract (see {@link Template.VariableSchema}); `{}` means "no declared variables". */
  variableSchema: jsonb('variable_schema').$type<Template.VariableSchema>().notNull().default({ variables: {} }),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const templateChannelSettings = pgTable(
  'template_channel_settings',
  {
    templateId: bigint('template_id', { mode: 'bigint' })
      .notNull()
      .references(() => templates.id, { onDelete: 'cascade' }),
    channel: notificationChannel('channel').notNull(),

    isEnabled: boolean('is_enabled').notNull().default(true),

    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [primaryKey({ columns: [t.templateId, t.channel] })],
);

/**
 * An immutable snapshot of a template's renderable content. Editing opens/updates a DRAFT; publishing
 * stamps a monotonic version, marks it PUBLISHED, and demotes the previous PUBLISHED to ARCHIVED
 * (retained for history + rollback). A partial unique index enforces at most one PUBLISHED and one
 * DRAFT per template; live sends resolve the PUBLISHED version.
 */
export const templateVersions = pgTable(
  'template_versions',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    templateId: bigint('template_id', { mode: 'bigint' })
      .notNull()
      .references(() => templates.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    status: versionStatus('status').notNull().default('DRAFT'),
    notes: varchar('notes', { length: 1000 }),
    editedBy: varchar('edited_by', { length: 255 }),
    publishedAt: timestamp('published_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [unique('template_versions_template_id_version_unique').on(t.templateId, t.version)],
);

/** Per (version, channel, locale) renderable content. `body` is unbounded text (real templates exceed any varchar cap). */
export const templateContents = pgTable(
  'template_contents',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    templateVersionId: bigint('template_version_id', { mode: 'bigint' })
      .notNull()
      .references(() => templateVersions.id, { onDelete: 'cascade' }),
    channel: notificationChannel('channel').notNull(),
    locale: varchar('locale', { length: 10 }).notNull().default('en-ZZ'),

    subject: varchar('subject', { length: 255 }),
    body: text('body').notNull(),
    /** Which layout wraps this content (EMAIL only); references {@link layouts.layoutKey}. Null → no layout. */
    layoutKey: varchar('layout_key', { length: 255 }),

    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [unique('template_contents_version_channel_locale_unique').on(t.templateVersionId, t.channel, t.locale)],
);

/**
 * A layout — the branded shell / design-system theme that wraps EMAIL content. The renderable body,
 * with a `{{ content }}` slot and CSS, lives in immutable {@link layoutVersions}; live sends resolve
 * the PUBLISHED version. Layouts are edited under a higher permission than template content.
 */
export const layouts = pgTable('layouts', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  layoutKey: varchar('layout_key', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  description: varchar('description', { length: 500 }),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const layoutVersions = pgTable(
  'layout_versions',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    layoutId: bigint('layout_id', { mode: 'bigint' })
      .notNull()
      .references(() => layouts.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    status: versionStatus('status').notNull().default('DRAFT'),
    body: text('body').notNull(),
    notes: varchar('notes', { length: 1000 }),
    editedBy: varchar('edited_by', { length: 255 }),
    publishedAt: timestamp('published_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [unique('layout_versions_layout_id_version_unique').on(t.layoutId, t.version)],
);

/** A reusable content block (button, OTP block, alert panel, footer), rendered from templates/layouts via Liquid `{% render %}`. */
export const partials = pgTable('partials', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  partialKey: varchar('partial_key', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  description: varchar('description', { length: 500 }),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const partialVersions = pgTable(
  'partial_versions',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    partialId: bigint('partial_id', { mode: 'bigint' })
      .notNull()
      .references(() => partials.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    status: versionStatus('status').notNull().default('DRAFT'),
    body: text('body').notNull(),
    notes: varchar('notes', { length: 1000 }),
    editedBy: varchar('edited_by', { length: 255 }),
    publishedAt: timestamp('published_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [unique('partial_versions_partial_id_version_unique').on(t.partialId, t.version)],
);

export const templateRelations = relations(templates, ({ many }) => ({
  versions: many(templateVersions),
  channelSettings: many(templateChannelSettings),
}));

export const templateChannelSettingRelations = relations(templateChannelSettings, ({ one }) => ({
  template: one(templates, { fields: [templateChannelSettings.templateId], references: [templates.id] }),
}));

export const templateVersionRelations = relations(templateVersions, ({ one, many }) => ({
  template: one(templates, { fields: [templateVersions.templateId], references: [templates.id] }),
  contents: many(templateContents),
}));

export const templateContentRelations = relations(templateContents, ({ one }) => ({
  version: one(templateVersions, { fields: [templateContents.templateVersionId], references: [templateVersions.id] }),
}));

export const layoutRelations = relations(layouts, ({ many }) => ({ versions: many(layoutVersions) }));
export const layoutVersionRelations = relations(layoutVersions, ({ one }) => ({
  layout: one(layouts, { fields: [layoutVersions.layoutId], references: [layouts.id] }),
}));

export const partialRelations = relations(partials, ({ many }) => ({ versions: many(partialVersions) }));
export const partialVersionRelations = relations(partialVersions, ({ one }) => ({
  partial: one(partials, { fields: [partialVersions.partialId], references: [partials.id] }),
}));
