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
type NotificationMessageInsertModel = InferInsertModel<typeof schema.notificationMessages>;

/**
 * Declaring the constants
 */
export const notificationMessages: NotificationMessageInsertModel[] = [
  {
    id: 1n,
    notificationJobId: '11111111-1111-1111-1111-111111111111',
    renderedSubject: 'Welcome to Shadow',
    renderedBody: 'Hi Alice, welcome aboard!',
  },
  {
    id: 2n,
    notificationJobId: '22222222-2222-2222-2222-222222222222',
    renderedSubject: 'Reset your password',
    renderedBody: 'Click the link to reset your password.',
  },
  {
    id: 3n,
    notificationJobId: '33333333-3333-3333-3333-333333333333',
    renderedSubject: 'Weekly newsletter',
    renderedBody: 'Here are the latest updates and news.',
  },
  {
    id: 4n,
    notificationJobId: '44444444-4444-4444-4444-444444444444',
    renderedSubject: 'Account alert',
    renderedBody: 'Unusual login detected on your account.',
  },
  {
    id: 5n,
    notificationJobId: '55555555-5555-5555-5555-555555555555',
    renderedSubject: 'Spring promo',
    renderedBody: 'Use code SPRING50 for 50% off.',
  },
];
