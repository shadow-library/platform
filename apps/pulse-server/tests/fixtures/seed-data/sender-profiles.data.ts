import { InferInsertModel } from 'drizzle-orm';

import * as schema from '@server/database/schemas';

type SenderProfileInsertModel = InferInsertModel<typeof schema.senderProfiles>;

/** Ids start at `2` — `1` is the baseline `default` catch-all profile `seedBaseline` creates on a from-scratch table. */
export const senderProfiles: SenderProfileInsertModel[] = [
  {
    id: 2n,
    key: 'marketing-default',
    displayName: 'Marketing Default',
    isActive: true,
  },
  {
    id: 3n,
    key: 'transactional-core',
    displayName: 'Transactional Core',
    isActive: true,
  },
  {
    id: 4n,
    key: 'alerts-high-priority',
    displayName: 'Alerts High Priority',
    isActive: true,
  },
  {
    id: 5n,
    key: 'otp-shortcodes',
    isActive: false,
  },
  {
    id: 6n,
    key: 'system-service',
    displayName: 'System Service',
    isActive: true,
  },
  {
    id: 7n,
    key: 'development-testing',
    displayName: 'Development Testing',
    isActive: true,
  },
];
