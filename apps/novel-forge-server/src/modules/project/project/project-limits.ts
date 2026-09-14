import { Config } from '@shadow-library/common';

import { AppErrorCode } from '@server/classes';
import { ownedBy, type OwnerRef } from '@server/common';
import { type PrimaryDatabase, schema } from '@server/database';

const DEFAULT_PROJECT_CAP = 100;

export function isProjectCapReached(currentCount: number, cap: number): boolean {
  return cap > 0 && currentCount >= cap;
}

// Shared by every project-creation path (create, clone, import, reforge promote, curated ingest) so the
// per-owner cap holds regardless of which surface mints the project. Counts against the owner the new
// project is attributed to, and is a pre-check outside any enclosing transaction — a small race is
// acceptable for a ceiling, and `projects.max-per-owner` raises it for legitimate bulk owners.
export async function assertUnderProjectCap(db: PrimaryDatabase, owner: OwnerRef): Promise<void> {
  const cap = Config.get('projects.max-per-owner') ?? DEFAULT_PROJECT_CAP;
  if (cap <= 0) return;
  const count = await db.$count(schema.projects, ownedBy(schema.projects, owner));
  if (isProjectCapReached(count, cap)) throw AppErrorCode.PRJ_004.create();
}
