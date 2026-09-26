import { AsyncLocalStorage } from 'node:async_hooks';

import { type Project } from '@server/database';

interface CostTierScope {
  costTier?: Project.CostTier;
}

// Carries the tier a chat turn ran at into the actions it starts: their call chains (generation, review, finalize) load the project row
// themselves and never see the turn. It carries the tier only — a chapter is written in its own content mode, never the chat's.
const storage = new AsyncLocalStorage<CostTierScope>();

/** `undefined` clears a tier inherited from the caller's scope. */
export function runWithCostTier<T>(costTier: Project.CostTier | undefined, fn: () => T): T {
  return storage.run({ costTier }, fn);
}

export function scopedCostTier(): Project.CostTier | undefined {
  return storage.getStore()?.costTier;
}
