/**
 * Importing npm packages
 */
import { InferInsertModel } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import * as schema from '@modules/datastore/schemas';

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
];
