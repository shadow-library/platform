import { describe, expect, it } from 'bun:test';

import { loadArtDisclosurePolicy } from '@modules/bible/fact/writer-disclosure-policy';

const ENDING = 'The keeper floods the valley to save the town.';
const ENDING_QUESTION = 'Will the harbour outlast the flood season?';

/** Relational reads only, answered per table and counted: the chapter is planned as the ending, so its writer may read the ending. */
function endingChapterDb() {
  const reads = new Map<string, number>();
  const answers: Record<string, { findFirst?: unknown; findMany?: unknown[] }> = {
    projects: { findFirst: { ending: ENDING, endingQuestion: ENDING_QUESTION } },
    briefs: { findFirst: { chapter: 9, volumeKey: null, isEnding: true } },
  };
  const query = new Proxy({} as Record<string, unknown>, {
    get: (_, table: string) => {
      const count = (): void => void reads.set(table, (reads.get(table) ?? 0) + 1);
      return {
        findFirst: async () => (count(), answers[table]?.findFirst),
        findMany: async () => (count(), answers[table]?.findMany ?? []),
      };
    },
  });
  return { db: { query }, reads };
}

describe('loadArtDisclosurePolicy', () => {
  it('should withhold the ending from art drawn at the ending chapter, reading the project once', async () => {
    const { db, reads } = endingChapterDb();

    const policy = await loadArtDisclosurePolicy(db as never, 1n, 9);

    expect(policy.scrub(`${ENDING} ${ENDING_QUESTION}`, 'prose')).toBe('[withheld]. [withheld]?');
    expect(reads.get('projects')).toBe(1);
  });
});
