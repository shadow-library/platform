import { InferInsertModel } from 'drizzle-orm';

import * as schema from '@server/database/schemas';

type SenderRoutingRuleInsertModel = InferInsertModel<typeof schema.senderRoutingRules>;

/** Ids start at `2` — `1` is the baseline global fallback rule `seedBaseline` creates on a from-scratch table. */
export const senderRoutingRules: SenderRoutingRuleInsertModel[] = [
  {
    id: 2n,
    senderProfileId: 3n,
    service: 'auth',
    region: 'US',
    messageType: 'TRANSACTIONAL',
  },
  {
    id: 3n,
    senderProfileId: 2n,
    service: 'marketing',
  },
  {
    id: 4n,
    senderProfileId: 4n,
    service: 'alerts',
    region: 'EU',
    messageType: 'TRANSACTIONAL',
  },
  {
    id: 5n,
    senderProfileId: 5n,
    service: 'security',
    region: 'US',
    messageType: 'OTP',
  },
  {
    id: 6n,
    senderProfileId: 6n,
    service: 'ops',
    region: 'SG',
    messageType: 'TRANSACTIONAL',
  },
  {
    id: 7n,
    senderProfileId: 7n,
  },
];
