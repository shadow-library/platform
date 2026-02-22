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
type TemplateGroupInsertModel = InferInsertModel<typeof schema.templateGroups>;

/**
 * Declaring the constants
 */
export const templateGroups: TemplateGroupInsertModel[] = [
  {
    id: 1n,
    templateKey: 'sign-up',
    messageType: 'TRANSACTIONAL',
    description: 'Templates for user sign-up notifications',
    priority: 'MEDIUM',
    isActive: true,
  },
  {
    id: 2n,
    templateKey: 'password-reset',
    messageType: 'TRANSACTIONAL',
    description: 'Templates for password reset notifications',
    priority: 'HIGH',
    isActive: true,
  },
  {
    id: 3n,
    templateKey: 'weekly-newsletter',
    messageType: 'PROMOTIONAL',
    description: 'Templates for weekly marketing newsletters',
    priority: 'LOW',
    isActive: true,
  },
  {
    id: 4n,
    templateKey: 'account-alerts',
    messageType: 'TRANSACTIONAL',
    description: 'Templates for account activity alerts',
    priority: 'HIGH',
    isActive: true,
  },
  {
    id: 5n,
    templateKey: 'spring-promo',
    messageType: 'PROMOTIONAL',
    description: 'Templates for seasonal promotional campaigns',
    priority: 'MEDIUM',
    isActive: false,
  },
];
