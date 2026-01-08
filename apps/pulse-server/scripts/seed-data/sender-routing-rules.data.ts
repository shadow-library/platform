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
type SenderRoutingRuleInsertModel = InferInsertModel<typeof schema.senderRoutingRules>;

/**
 * Declaring the constants
 */
export const senderRoutingRules: SenderRoutingRuleInsertModel[] = [
  {
    id: 1n,
    senderProfileId: 2n,
    service: 'auth',
    region: 'US',
    messageType: 'TRANSACTIONAL',
  },
  {
    id: 2n,
    senderProfileId: 1n,
    service: 'marketing',
  },
  {
    id: 3n,
    senderProfileId: 3n,
    service: 'alerts',
    region: 'EU',
    messageType: 'TRANSACTIONAL',
  },
  {
    id: 4n,
    senderProfileId: 4n,
    service: 'security',
    region: 'US',
    messageType: 'OTP',
  },
  {
    id: 5n,
    senderProfileId: 5n,
    service: 'ops',
    region: 'SG',
    messageType: 'TRANSACTIONAL',
  },
  {
    id: 6n,
    senderProfileId: 1n,
  },
];
