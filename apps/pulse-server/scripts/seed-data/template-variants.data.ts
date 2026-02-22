/**
 * Importing npm packages
 */
import { InferInsertModel } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import * as schema from '@server/database/schemas';

/**
 * Defining types
 */
type TemplateVariantInsertModel = InferInsertModel<typeof schema.templateVariants>;

/**
 * Declaring the constants
 */
export const templateVariants: TemplateVariantInsertModel[] = [
  {
    id: 1n,
    templateGroupId: 1n,
    channel: 'EMAIL',
    locale: 'en-US',
    subject: 'Welcome to Shadow',
    body: 'Hi {{name}}, thanks for signing up!',
    isActive: true,
  },
  {
    id: 2n,
    templateGroupId: 1n,
    channel: 'SMS',
    locale: 'en-US',
    body: 'Welcome {{name}}, your account is ready.',
    isActive: true,
  },
  {
    id: 3n,
    templateGroupId: 2n,
    channel: 'EMAIL',
    locale: 'en-US',
    subject: 'Reset your password',
    body: 'Click here to reset: {{resetLink}}',
    isActive: true,
  },
  {
    id: 4n,
    templateGroupId: 3n,
    channel: 'EMAIL',
    locale: 'en-US',
    subject: 'Your weekly newsletter',
    body: 'Latest updates and news.',
    isActive: true,
  },
  {
    id: 5n,
    templateGroupId: 4n,
    channel: 'PUSH',
    locale: 'en-US',
    subject: 'Account alert',
    body: 'Unusual activity detected on your account.',
    isActive: true,
  },
  {
    id: 6n,
    templateGroupId: 1n,
    channel: 'EMAIL',
    locale: 'en-ZZ',
    subject: 'Welcome to Shadow',
    body: 'Hi {{name}}, thanks for signing up!',
    isActive: true,
  },
  {
    id: 7n,
    templateGroupId: 1n,
    channel: 'SMS',
    locale: 'en-ZZ',
    body: 'Welcome {{name}}, your account is ready.',
    isActive: true,
  },
  {
    id: 8n,
    templateGroupId: 2n,
    channel: 'EMAIL',
    locale: 'en-ZZ',
    subject: 'Reset your password',
    body: 'Click here to reset: {{resetLink}}',
    isActive: true,
  },
  {
    id: 9n,
    templateGroupId: 3n,
    channel: 'EMAIL',
    locale: 'en-ZZ',
    subject: 'Your weekly newsletter',
    body: 'Latest updates and news.',
    isActive: true,
  },
  {
    id: 10n,
    templateGroupId: 4n,
    channel: 'PUSH',
    locale: 'en-ZZ',
    subject: 'Account alert',
    body: 'Unusual activity detected on your account.',
    isActive: true,
  },
];
