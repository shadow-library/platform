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
type SenderProfileInsertModel = InferInsertModel<typeof schema.senderProfiles>;

/**
 * Declaring the constants
 */
export const senderProfiles: SenderProfileInsertModel[] = [
  {
    id: 1n,
    key: 'marketing-default',
    displayName: 'Marketing Default',
    isActive: true,
  },
  {
    id: 2n,
    key: 'transactional-core',
    displayName: 'Transactional Core',
    isActive: true,
  },
  {
    id: 3n,
    key: 'alerts-high-priority',
    displayName: 'Alerts High Priority',
    isActive: true,
  },
  {
    id: 4n,
    key: 'otp-shortcodes',
    isActive: false,
  },
  {
    id: 5n,
    key: 'system-service',
    displayName: 'System Service',
    isActive: true,
  },
  {
    id: 6n,
    key: 'development-testing',
    displayName: 'Development Testing',
    isActive: true,
  },
];
