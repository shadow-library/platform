import { describe, expect, it } from 'bun:test';

import { findMilestoneReferences, loadPlanState, nextWritableChapter, planFrontier, unsettledTeacher } from '@server/common';

import { loadWriterDisclosureSources } from '@modules/bible/fact/writer-disclosure-policy';
import { finalizeRefusals } from '@modules/generation/finalize-refusals';

import { serialProbe } from '../serial-executor';

const readers: [string, (db: never) => Promise<unknown>][] = [
  ['nextWritableChapter', db => nextWritableChapter(db, 7n)],
  ['planFrontier', db => planFrontier(db, 7n)],
  ['loadPlanState', db => loadPlanState(db, 7n)],
  ['findMilestoneReferences', db => findMilestoneReferences(db, 7n, 'first-rank')],
  ['unsettledTeacher', db => unsettledTeacher(db, 7n, 3)],
  ['loadWriterDisclosureSources', db => loadWriterDisclosureSources(db, 7n, 3)],
  ['finalizeRefusals', db => finalizeRefusals(db, { projectId: 7n, chapter: 3, status: 'draft', reviewStatus: 'approved', isolated: false } as never)],
];

for (const [name, read] of readers) {
  describe(name, () => {
    it('should never have two queries in flight on the handle it is given, which may be one transaction', async () => {
      const probe = serialProbe();

      await read(probe.db as never);

      expect(probe.peak()).toBe(1);
    });
  });
}
