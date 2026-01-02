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
type NotificationMessageInsertModel = InferInsertModel<typeof schema.notificationMessages>;

/**
 * Declaring the constants
 */
export const notificationMessages: NotificationMessageInsertModel[] = [
  {
    id: 1n,
    notificationJobId: '11111111-1111-1111-1111-111111111111',
    channel: 'EMAIL',
    renderedSubject: 'Welcome to Shadow',
    renderedBody: 'Hi Alice, welcome aboard!',
    payload: { name: 'Alice' },
  },
  {
    id: 2n,
    notificationJobId: '22222222-2222-2222-2222-222222222222',
    channel: 'EMAIL',
    renderedSubject: 'Reset your password',
    renderedBody: 'Click the link to reset your password.',
    payload: { resetLink: 'https://example.com/reset?token=abc' },
  },
  {
    id: 3n,
    notificationJobId: '33333333-3333-3333-3333-333333333333',
    channel: 'EMAIL',
    renderedSubject: 'Weekly newsletter',
    renderedBody: 'Here are the latest updates and news.',
    payload: { topics: ['product', 'news'] },
  },
  {
    id: 4n,
    notificationJobId: '44444444-4444-4444-4444-444444444444',
    channel: 'PUSH',
    renderedSubject: 'Account alert',
    renderedBody: 'Unusual login detected on your account.',
    payload: { alert: 'Unusual login detected' },
  },
  {
    id: 5n,
    notificationJobId: '55555555-5555-5555-5555-555555555555',
    channel: 'SMS',
    renderedSubject: 'Spring promo',
    renderedBody: 'Use code SPRING50 for 50% off.',
    payload: { offer: 'SPRING50' },
  },
];
