import { InferInsertModel } from 'drizzle-orm';

import * as schema from '@server/database/schemas';

type SenderEndpointInsertModel = InferInsertModel<typeof schema.senderEndpoints>;

/** Ids start at `4` — `1`-`3` belong to the baseline `default` profile's endpoints `seedBaseline` creates. */
export const senderEndpoints: SenderEndpointInsertModel[] = [
  {
    id: 4n,
    senderProfileId: 2n,
    channel: 'EMAIL',
    provider: 'SENDGRID',
    identifier: 'marketing@shadow.test',
    weight: 1,
    isActive: true,
  },
  {
    id: 5n,
    senderProfileId: 2n,
    channel: 'EMAIL',
    provider: 'AWS_SES',
    identifier: 'marketing-ses@shadow.test',
    weight: 2,
    isActive: true,
  },
  {
    id: 6n,
    senderProfileId: 2n,
    channel: 'SMS',
    provider: 'TWILIO',
    identifier: '+15551230010',
    weight: 1,
    isActive: true,
  },
  {
    id: 7n,
    senderProfileId: 2n,
    channel: 'PUSH',
    provider: 'FIREBASE',
    identifier: 'firebase-marketing-app',
    weight: 1,
    isActive: false,
  },
  {
    id: 8n,
    senderProfileId: 3n,
    channel: 'EMAIL',
    provider: 'AWS_SES',
    identifier: 'noreply@shadow.test',
    weight: 1,
    isActive: true,
  },
  {
    id: 9n,
    senderProfileId: 4n,
    channel: 'SMS',
    provider: 'TWILIO',
    identifier: '+15551230001',
    weight: 1,
    isActive: true,
  },
  {
    id: 10n,
    senderProfileId: 5n,
    channel: 'SMS',
    provider: 'TWILIO',
    identifier: '+15551230002',
    weight: 1,
    isActive: true,
  },
  {
    id: 11n,
    senderProfileId: 6n,
    channel: 'PUSH',
    provider: 'FIREBASE',
    identifier: 'firebase-app-main',
    weight: 1,
    isActive: true,
  },
  {
    id: 12n,
    senderProfileId: 7n,
    channel: 'EMAIL',
    provider: 'DEV',
    identifier: 'Shadow Dev Apps <no-reply@dev.shadow-apps.com>',
  },
  {
    id: 13n,
    senderProfileId: 7n,
    channel: 'SMS',
    provider: 'DEV',
    identifier: '+919999999999',
  },
];
