import { describe, expect, it } from 'bun:test';

import { gateHeadline, gateSummary, stopTest } from '../src/features/blueprint/gate';
import { importCoverageSummary } from '../src/features/blueprint/import-coverage';
import { type BlueprintPhase, type BlueprintPhaseProgressResponse, type BlueprintPhaseStatus, type ImportCoverageResponse, type LedgerEntryResponse } from '../src/lib/apis';

const LABELS: Record<BlueprintPhase, string> = {
  idea: 'Idea',
  heart: 'Heart',
  core: 'Core',
  world: 'World',
  spine: 'Spine',
  volume_one: 'Volume one',
  opening: 'Opening',
};

const EVERY_PHASE: BlueprintPhase[] = ['idea', 'heart', 'core', 'world', 'spine', 'volume_one', 'opening'];

function phase(name: BlueprintPhase, status: BlueprintPhaseStatus = 'done', steps: string[] = []): BlueprintPhaseProgressResponse {
  return { phase: name, label: LABELS[name], status, steps: steps.map(key => ({ key, required: true, applies: true, done: true })) };
}

let nextId = 0;

function entry(topic: string, statement: string, overrides: Partial<LedgerEntryResponse> = {}): LedgerEntryResponse {
  nextId += 1;
  return {
    id: `e${nextId}`,
    projectId: 'p1',
    kind: 'decision',
    phase: null,
    topic,
    statement,
    why: null,
    rejectedAlternatives: [],
    writerLine: null,
    decidedBy: 'author',
    stepKey: topic,
    payload: null,
    links: {},
    supersedesId: null,
    supersededAt: null,
    withdrawnReason: null,
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const DESIGN: LedgerEntryResponse[] = [
  entry('premise', 'An apprentice tithe-collector finds tithes paid with stolen memories.'),
  entry('theme', 'If memories can be sold, what makes you you?'),
  entry('promise', 'Mystery and progression, ~800 chapters, wry'),
  entry('ending', 'His past, or who he became.'),
  entry('protagonist', 'Kaen — "if I stay useful, no one will leave me"'),
  entry('opposition', 'Magistra Dace'),
  entry('world.cost', 'Every spell costs a named memory'),
  entry('world.power', 'Ward → Taker → Keeper'),
  entry('spine', 'Discovery → Complicity → Reckoning'),
  entry('cast', 'Lise, Dace, Oram', { payload: { members: [{ name: 'Lise' }, { name: 'Dace' }, { name: 'Oram' }] } }),
  entry('places', 'The vaults, the pier', { payload: { places: [{ name: 'The vaults' }, { name: 'The pier' }] } }),
  entry('arcs', 'The unpaid tithe', { payload: { arcs: [{ arcKey: 'v1_a1', turn: 'He pays a tithe he cannot afford', chapterStart: 1, chapterEnd: 3 }] } }),
  entry('briefs', 'The unpaid tithe: 3 chapter briefs (ch 1–3)', {
    payload: {
      arcKey: 'v1_a1',
      briefs: [
        { chapter: 2, title: 'The ledger', purpose: 'Kaen reads a name he knows' },
        { chapter: 1, title: 'The round', purpose: 'Kaen finds a jar holding a memory he recognises' },
        { chapter: 3, title: 'The debt', purpose: 'He pays' },
      ],
    },
  }),
  entry('voice', 'Close and dry'),
  entry('check', '9 checks passed · 2 fixed · 0 open', { payload: { passed: 9, resolved: 2, dismissed: 0, open: 0 } }),
  entry('spine.reveals', 'The tithe he collected was his own', {
    payload: { reveals: [{ when: 'Whose memory it is', truth: 'It is his mother’s', pinned: true }] },
  }),
];

describe('gateSummary', () => {
  const summary = gateSummary(
    EVERY_PHASE.map(name => phase(name, 'done', [`${name}_step`])),
    DESIGN,
  );

  const parts = (name: BlueprintPhase): string[] => summary.find(cell => cell.phase === name)?.parts ?? [];

  it('should read each phase back out of the decisions themselves', () => {
    expect(parts('idea')).toEqual(['An apprentice tithe-collector finds tithes paid with stolen memories.']);
    expect(parts('heart')).toEqual(['If memories can be sold, what makes you you?', 'Mystery and progression, ~800 chapters, wry']);
    expect(parts('core')).toEqual(['Kaen — "if I stay useful, no one will leave me"', 'Opposed by Magistra Dace']);
    expect(parts('world')).toEqual(['Every spell costs a named memory', 'Ward → Taker → Keeper']);
    expect(parts('spine')).toEqual(['Discovery → Complicity → Reckoning']);
  });

  it('should count what volume one and the opening produced', () => {
    expect(parts('volume_one')).toEqual(['3 cast cards', '2 places', '1 arc']);
    expect(parts('opening')).toEqual(['3 briefs', 'voice chosen', '0 open findings']);
  });

  it('should say nothing rather than guess for a phase with no decisions', () => {
    expect(gateSummary([phase('core', 'current', ['protagonist'])], []).map(cell => cell.parts)).toEqual([[]]);
  });

  it('should leave the voice out when none was chosen, because it is a recommendation and never a blocker', () => {
    const withoutVoice = DESIGN.filter(item => item.topic !== 'voice');

    expect(gateSummary([phase('opening')], withoutVoice)[0]?.parts).toEqual(['3 briefs', '0 open findings']);
  });

  it('should carry each phase’s first applicable step so revisiting it has somewhere to go', () => {
    expect(summary[0]).toMatchObject({ phase: 'idea', done: true, step: 'idea_step' });
  });

  it('should read the newest decision on a topic when it was locked twice', () => {
    const relocked = [...DESIGN, entry('premise', 'A tithe-collector finds his own memory in a jar.')];

    expect(gateSummary([phase('idea')], relocked)[0]?.parts).toEqual(['A tithe-collector finds his own memory in a jar.']);
  });
});

describe('stopTest', () => {
  it('should answer all three questions from the author’s own decisions', () => {
    expect(stopTest(DESIGN)).toEqual([
      { id: 'chapter-one', question: 'What happens in chapter 1?', answer: 'Kaen finds a jar holding a memory he recognises' },
      { id: 'waiting-for', question: 'What is the reader waiting for at chapter 3?', answer: 'Whose memory it is' },
      { id: 'terminal', question: 'What is the terminal question?', answer: 'His past, or who he became.' },
    ]);
  });

  it('should never put the reveal’s truth on the page — only when it lands', () => {
    const answer = stopTest(DESIGN)[1]?.answer ?? '';

    expect(answer).not.toContain('mother');
  });

  it('should fall back to arc one’s turn when the spine schedules no reveal', () => {
    const withoutReveals = DESIGN.filter(item => item.topic !== 'spine.reveals');

    expect(stopTest(withoutReveals)[1]?.answer).toBe('He pays a tithe he cannot afford');
  });

  it('should say an answer is missing rather than inventing one', () => {
    expect(stopTest([]).map(question => question.answer)).toEqual([null, null, null]);
  });
});

describe('gateHeadline', () => {
  it('should count the phases that are done', () => {
    expect(gateHeadline([phase('idea', 'done'), phase('heart', 'current')])).toBe('Blueprint · 1 of 2');
  });
});

function coverage(overrides: Partial<ImportCoverageResponse> = {}): ImportCoverageResponse {
  return {
    phases: EVERY_PHASE.map(name => ({ phase: name, label: LABELS[name], covered: true, evidence: `${LABELS[name]} evidence`, blocking: false })),
    voice: { covered: false, evidence: 'No voice or pacing and tone page' },
    blocking: false,
    ...overrides,
  };
}

describe('importCoverageSummary', () => {
  it('should count only the phases, with the voice sample listed beside them', () => {
    const summary = importCoverageSummary(coverage());

    expect(summary.headline).toBe('7 of 7');
    expect(summary.lines).toHaveLength(8);
    expect(summary.lines.at(-1)).toMatchObject({ id: 'voice', intent: 'recommended' });
  });

  it('should show a gap as a recommendation and only a missing brief as a blocker', () => {
    const phases = coverage().phases.map(item =>
      item.phase === 'opening'
        ? { ...item, covered: false, evidence: 'No chapter briefs, so no chapter can be generated', blocking: true }
        : item.phase === 'heart'
          ? { ...item, covered: false, evidence: 'No reader promise page' }
          : item,
    );
    const summary = importCoverageSummary(coverage({ phases, blocking: true }));

    expect(summary.headline).toBe('5 of 7');
    expect(summary.blocking).toBe(true);
    expect(summary.lines.find(line => line.id === 'heart')?.intent).toBe('recommended');
    expect(summary.lines.find(line => line.id === 'opening')?.intent).toBe('blocking');
  });

  it('should tick a voice page when the import brought one', () => {
    expect(importCoverageSummary(coverage({ voice: { covered: true, evidence: 'Voice or pacing and tone page' } })).lines.at(-1)?.intent).toBe('covered');
  });
});
