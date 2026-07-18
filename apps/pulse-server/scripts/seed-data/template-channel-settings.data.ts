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
type TemplateChannelSettingInsertModel = InferInsertModel<typeof schema.templateChannelSettings>;

/**
 * Declaring the constants
 */
export const templateChannelSettings: TemplateChannelSettingInsertModel[] = [
  {
    templateGroupId: 1n,
    channel: 'EMAIL',
    isEnabled: true,
  },
  {
    templateGroupId: 1n,
    channel: 'SMS',
    isEnabled: true,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  },
  {
    templateGroupId: 2n,
    channel: 'EMAIL',
    isEnabled: true,
  },
  {
    templateGroupId: 3n,
    channel: 'EMAIL',
    isEnabled: true,
  },
  {
    templateGroupId: 4n,
    channel: 'PUSH',
    isEnabled: true,
  },

  /** Identity-server notification catalog: OTP flows that can target a phone identifier enable SMS alongside EMAIL */
  {
    templateGroupId: 6n,
    channel: 'EMAIL',
    isEnabled: true,
  },
  {
    templateGroupId: 6n,
    channel: 'SMS',
    isEnabled: true,
  },
  {
    templateGroupId: 7n,
    channel: 'EMAIL',
    isEnabled: true,
  },
  {
    templateGroupId: 7n,
    channel: 'SMS',
    isEnabled: true,
  },
  {
    templateGroupId: 8n,
    channel: 'EMAIL',
    isEnabled: true,
  },
  {
    templateGroupId: 9n,
    channel: 'EMAIL',
    isEnabled: true,
  },
  {
    templateGroupId: 10n,
    channel: 'EMAIL',
    isEnabled: true,
  },
  {
    templateGroupId: 11n,
    channel: 'EMAIL',
    isEnabled: true,
  },
  {
    templateGroupId: 12n,
    channel: 'EMAIL',
    isEnabled: true,
  },
  {
    templateGroupId: 13n,
    channel: 'EMAIL',
    isEnabled: true,
  },
  {
    templateGroupId: 14n,
    channel: 'EMAIL',
    isEnabled: true,
  },
  {
    templateGroupId: 15n,
    channel: 'SMS',
    isEnabled: true,
  },
  {
    templateGroupId: 16n,
    channel: 'EMAIL',
    isEnabled: true,
  },
  {
    templateGroupId: 17n,
    channel: 'EMAIL',
    isEnabled: true,
  },
  {
    templateGroupId: 18n,
    channel: 'EMAIL',
    isEnabled: true,
  },
  {
    templateGroupId: 19n,
    channel: 'EMAIL',
    isEnabled: true,
  },
];
