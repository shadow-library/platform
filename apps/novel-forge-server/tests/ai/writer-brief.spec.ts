import { describe, expect, it, mock } from 'bun:test';

import { loadWriterBrief } from '@modules/ai/context/writer-brief';

const HIDDEN_TEXT = 'The ferryman is the drowned heir of the tide court';
const TERM = 'tide court';
const hiddenFact = {
  id: 21n,
  factKey: 'ferryman_heir',
  text: HIDDEN_TEXT,
  constraintNote: null,
  writerNote: 'The ferryman deflects any talk of family.',
  revealChapter: 12,
  source: 'bible',
  terms: [TERM],
};

const brief = {
  body: `The ferryman rows toward the ${TERM}.\nHint that ${HIDDEN_TEXT}.`,
  chapterPurpose: `Tease the ${TERM}.`,
  guidance: null,
  endingContract: {
    hookType: 'turn',
    emotionalBeat: `Dread of the ${TERM}`,
    openQuestion: 'Who lit the lamp?',
    handoffState: `The barge drifts past the ${TERM}.`,
    mustNotResolve: ['fact:ferryman_heir'],
  },
};

function stubDb(endingContract: unknown = brief.endingContract) {
  return {
    query: {
      canonFacts: { findMany: mock(async () => [hiddenFact]) },
      briefs: { findFirst: mock(async () => ({ knowledgeContract: null, endingContract })) },
      characterKnowledge: { findMany: mock(async () => []) },
    },
  } as never;
}

describe('loadWriterBrief', () => {
  it('should withhold the fact text and its terms from the brief and ending contract before the reveal chapter', async () => {
    const { chapterBrief, endingContract } = await loadWriterBrief(stubDb(), 1n, 5, brief);

    expect(chapterBrief).toContain('The ferryman rows toward the [withheld].');
    expect(chapterBrief).toContain('Hint that [withheld].');
    expect(chapterBrief).toContain('Chapter purpose: Tease the [withheld].');
    expect(endingContract).toContain('Emotional beat: Dread of the [withheld]');
    expect(endingContract).toContain('Handoff state: The barge drifts past the [withheld].');
    expect(endingContract).toContain('Must NOT resolve: The ferryman deflects any talk of family.');
    expect(`${chapterBrief}\n${endingContract}`).not.toContain(TERM);
    expect(`${chapterBrief}\n${endingContract}`).not.toContain(HIDDEN_TEXT);
    expect(endingContract).not.toContain('ferryman_heir');
  });

  it('should give the reveal chapter the brief in full', async () => {
    const revealBrief = { ...brief, endingContract: { ...brief.endingContract, mustNotResolve: [] } };
    const { chapterBrief, endingContract } = await loadWriterBrief(stubDb(revealBrief.endingContract), 1n, 12, revealBrief);

    expect(chapterBrief).toContain(`Hint that ${HIDDEN_TEXT}.`);
    expect(chapterBrief).toContain(`Chapter purpose: Tease the ${TERM}.`);
    expect(endingContract).toContain(`Handoff state: The barge drifts past the ${TERM}.`);
  });
});
