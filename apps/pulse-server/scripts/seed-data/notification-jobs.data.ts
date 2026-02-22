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

type NotificationJobInsertModel = InferInsertModel<typeof schema.notificationJobs>;

/**
 * Declaring the constants
 */

export const notificationJobs: NotificationJobInsertModel[] = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    templateGroupId: 1n,
    channel: 'EMAIL',
    locale: 'en-US',
    priority: 'HIGH',
    recipient: 'alice@example.com',
    payload: { name: 'Alice' },
    status: 'PENDING',
    attempt: 0,
    nextAttemptAt: new Date('2025-12-10T10:00:00.000Z'),
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    templateGroupId: 2n,
    channel: 'EMAIL',
    locale: 'en-US',
    priority: 'MEDIUM',
    recipient: 'bob@example.com',
    payload: { resetLink: 'https://example.com/reset?token=abc' },
    status: 'PROCESSING',
    attempt: 1,
    lastAttemptedAt: new Date('2025-12-10T12:00:00.000Z'),
    nextAttemptAt: new Date('2025-12-10T12:10:00.000Z'),
  },
  {
    id: '33333333-3333-3333-3333-333333333333',
    templateGroupId: 3n,
    channel: 'EMAIL',
    locale: 'en-US',
    priority: 'LOW',
    recipient: 'carol@example.com',
    payload: { topics: ['product', 'news'] },
    status: 'SENT',
    attempt: 1,
    lastAttemptedAt: new Date('2025-12-09T09:00:00.000Z'),
  },
  {
    id: '44444444-4444-4444-4444-444444444444',
    templateGroupId: 4n,
    channel: 'PUSH',
    locale: 'en-US',
    priority: 'HIGH',
    recipient: 'device:abcd-1234',
    payload: { alert: 'Unusual login detected' },
    status: 'FAILED',
    attempt: 2,
    lastAttemptedAt: new Date('2025-12-10T14:00:00.000Z'),
    nextAttemptAt: new Date('2025-12-10T14:15:00.000Z'),
    lastError: 'Push token expired',
  },
  {
    id: '55555555-5555-5555-5555-555555555555',
    templateGroupId: 5n,
    channel: 'SMS',
    locale: 'en-US',
    priority: 'MEDIUM',
    recipient: '+15551230003',
    payload: { offer: 'SPRING50' },
    status: 'PENDING',
    attempt: 0,
    nextAttemptAt: new Date('2025-12-11T10:00:00.000Z'),
  },
];
