import { ownedBy, type OwnerRef } from '@server/common';
import { type PrimaryDatabase, type PrimaryTransaction, type Project, schema } from '@server/database';

import { DEFAULT_COST_TIER } from '../../ai/defaults';

export async function ownerDefaultCostTier(db: PrimaryDatabase | PrimaryTransaction, owner: OwnerRef): Promise<Project.CostTier> {
  if (owner.kind === 'bot') return DEFAULT_COST_TIER;
  const [row] = await db.select({ defaultCostTier: schema.accountSettings.defaultCostTier }).from(schema.accountSettings).where(ownedBy(schema.accountSettings, owner));
  return row?.defaultCostTier ?? DEFAULT_COST_TIER;
}
