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
type SenderEndpointInsertModel = InferInsertModel<typeof schema.senderEndpoints>;

/**
 * Declaring the constants
 */
export const senderEndpoints: SenderEndpointInsertModel[] = [
  {
    id: 1n,
    senderProfileId: 1n,
    channel: 'EMAIL',
    provider: 'SENDGRID',
    identifier: 'marketing@shadow.test',
    weight: 1,
    isActive: true,
  },
  {
    id: 2n,
    senderProfileId: 1n,
    channel: 'EMAIL',
    provider: 'AWS_SES',
    identifier: 'marketing-ses@shadow.test',
    weight: 2,
    isActive: true,
  },
  {
    id: 3n,
    senderProfileId: 1n,
    channel: 'SMS',
    provider: 'TWILIO',
    identifier: '+15551230010',
    weight: 1,
    isActive: true,
  },
  {
    id: 4n,
    senderProfileId: 1n,
    channel: 'PUSH',
    provider: 'FIREBASE',
    identifier: 'firebase-marketing-app',
    weight: 1,
    isActive: false,
  },
  {
    id: 5n,
    senderProfileId: 2n,
    channel: 'EMAIL',
    provider: 'AWS_SES',
    identifier: 'noreply@shadow.test',
    weight: 1,
    isActive: true,
  },
  {
    id: 6n,
    senderProfileId: 3n,
    channel: 'SMS',
    provider: 'TWILIO',
    identifier: '+15551230001',
    weight: 1,
    isActive: true,
  },
  {
    id: 7n,
    senderProfileId: 4n,
    channel: 'SMS',
    provider: 'TWILIO',
    identifier: '+15551230002',
    weight: 1,
    isActive: true,
  },
  {
    id: 8n,
    senderProfileId: 5n,
    channel: 'PUSH',
    provider: 'FIREBASE',
    identifier: 'firebase-app-main',
    weight: 1,
    isActive: true,
  },
  {
    id: 9n,
    senderProfileId: 6n,
    channel: 'EMAIL',
    provider: 'DEV',
    identifier: 'Shadow Dev Apps <no-reply@dev.shadow-apps.com>',
  },
  {
    id: 10n,
    senderProfileId: 6n,
    channel: 'SMS',
    provider: 'DEV',
    identifier: '+919999999999',
  },
];
