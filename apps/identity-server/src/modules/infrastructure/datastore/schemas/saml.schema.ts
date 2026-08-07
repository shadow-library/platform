import { InferEnum, InferSelectModel } from 'drizzle-orm';
import { boolean, integer, pgEnum, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { applications } from './applications.schema';

export type SamlServiceProvider = InferSelectModel<typeof samlServiceProviders>;

export namespace SamlServiceProvider {
  export type NameIdFormat = InferEnum<typeof samlNameIdFormat>;
}

/**
 * Registered SAML 2.0 relying parties (T-701). Service providers are platform-tier integrations,
 * managed by the same administrators as OAuth clients. The ACS URL is matched exactly against the
 * AuthnRequest (never taken from the request alone) so a compromised SP request can never redirect
 * assertions. `PERSISTENT` NameIDs are stable pairwise identifiers derived per (user, entity id);
 * the SP certificate is stored for future assertion encryption — request signature verification is
 * deliberately unsupported (hand-rolling XML signature verification invites XSW attacks).
 */

export const samlNameIdFormat = pgEnum('saml_name_id_format', ['EMAIL', 'PERSISTENT']);

export const samlServiceProviders = pgTable('saml_service_providers', {
  id: uuid('id').defaultRandom().primaryKey(),
  entityId: text('entity_id').notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  acsUrl: text('acs_url').notNull(),
  applicationId: integer('application_id').references(() => applications.id, { onDelete: 'set null' }),
  nameIdFormat: samlNameIdFormat('name_id_format').notNull().default('EMAIL'),
  releasedAttributes: text('released_attributes').array().notNull(),
  spCertificatePem: text('sp_certificate_pem'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
