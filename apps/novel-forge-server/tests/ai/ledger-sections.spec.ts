import { describe, expect, it } from 'bun:test';

import { type LedgerContextEntry, ledgerSection, renderLedger, renderWriterLines, WRITER_LINES_BUDGET, writerLinesSection } from '@modules/ai/context/ledger-sections';
import { applyBudget, countTokens } from '@modules/ai/context/token-budget';

function entry(overrides: Partial<LedgerContextEntry>): LedgerContextEntry {
  return {
    kind: 'decision',
    phase: 'idea',
    topic: 'premise',
    statement: 'A lighthouse keeper inherits a debt the sea collects.',
    why: null,
    rejectedAlternatives: [],
    writerLine: null,
    decidedBy: 'author',
    ...overrides,
  };
}

const ledger: LedgerContextEntry[] = [
  entry({ kind: 'decision', phase: 'core', topic: 'protagonist', statement: 'Ada believes she owes nothing to anyone.', writerLine: 'Ada never asks for help on the page.' }),
  entry({ rejectedAlternatives: ['A smuggler hides a map in a lighthouse.'], why: 'The debt drives every chapter.', writerLine: 'Keep the debt visible in each chapter.' }),
  entry({ kind: 'direction', topic: 'taste', statement: 'Quiet dread over spectacle' }),
  entry({ kind: 'rejected', topic: 'concepts', statement: 'A sea monster siege', why: 'Too loud for this book' }),
  entry({ kind: 'backlog', phase: 'volume_one', topic: 'places', statement: 'The drowned chapel', why: 'Not before chapter 20' }),
  entry({
    kind: 'system',
    decidedBy: 'system',
    phase: 'volume_one',
    topic: 'cast',
    statement: 'The harbour clerk is fifty-two.',
    writerLine: 'The clerk moves slowly and misses nothing.',
  }),
];

describe('renderLedger', () => {
  it('should group decisions by phase in Blueprint order with their why and writer line', () => {
    const rendered = renderLedger(ledger);

    expect(rendered.indexOf('**Idea**')).toBeLessThan(rendered.indexOf('**Core**'));
    expect(rendered.indexOf('**Core**')).toBeLessThan(rendered.indexOf('**Volume one**'));
    expect(rendered).toContain(
      '- premise: A lighthouse keeper inherits a debt the sea collects.\n  Why: The debt drives every chapter.\n  For the writer: Keep the debt visible in each chapter.',
    );
    expect(rendered).toContain('- cast (decided by the system): The harbour clerk is fifty-two.');
  });

  it('should render directions and backlog as tagged lists', () => {
    const rendered = renderLedger(ledger);

    expect(rendered).toContain('### Author directions\n\n- [Idea · taste] Quiet dread over spectacle');
    expect(rendered).toContain('### Backlog — not yet\n\n- [Volume one · places] The drowned chapel — Not before chapter 20');
  });

  it('should render rejected entries and passed-over alternatives only as a do-not-propose list', () => {
    const rendered = renderLedger(ledger);
    const doNotPropose = rendered.slice(rendered.indexOf('### Do not propose'));

    expect(doNotPropose).toContain("- A sea monster siege (the author's reason: Too loud for this book)");
    expect(doNotPropose).toContain('- A smuggler hides a map in a lighthouse. (passed over for premise)');
    expect(rendered.indexOf('A sea monster siege')).toBeGreaterThan(rendered.indexOf('### Do not propose'));
    expect(rendered.split('A smuggler hides a map')).toHaveLength(2);
  });

  it('should say so when nothing is decided yet', () => {
    expect(renderLedger([])).toBe('Nothing has been decided yet.');
  });
});

describe('ledgerSection', () => {
  it('should survive a budget too small for it', () => {
    const section = ledgerSection(ledger);
    const filler = { key: 'catalog', tokens: 50, required: false };

    const { fitting, omitted } = applyBudget([filler, section], 10);

    expect(section.rendered.startsWith('## DECISION LEDGER')).toBe(true);
    expect(fitting.map(s => s.key)).toContain('ledger');
    expect(omitted.map(o => o.key)).toEqual(['catalog']);
  });
});

describe('renderWriterLines', () => {
  it('should list the writer lines of active decisions and system details as bullets in phase order', () => {
    expect(renderWriterLines(ledger, [])).toBe(
      ['- Keep the debt visible in each chapter.', '- Ada never asks for help on the page.', '- The clerk moves slowly and misses nothing.'].join('\n'),
    );
  });

  it('should scrub a hidden fact out of a writer line', () => {
    const hidden = { factKey: 'clerk_is_heir', text: 'The clerk is the heir.', terms: ['misses nothing'] };

    expect(renderWriterLines(ledger, [hidden])).not.toContain('misses nothing');
  });

  it('should keep the newest line of every phase first when the lines exceed the cap', () => {
    const lines = (phase: 'idea' | 'core' | 'opening', count: number): LedgerContextEntry[] =>
      Array.from({ length: count }, (_, index) => entry({ phase, topic: `${phase}.${index}`, writerLine: `${phase} line ${index} keeps the harbour bells ringing at dusk.` }));
    const ledger = [...lines('idea', 4), ...lines('core', 4), ...lines('opening', 4)];
    const budget = countTokens('- idea line 0 keeps the harbour bells ringing at dusk.\n') * 4;

    const rendered = renderWriterLines(ledger, [], budget) ?? '';

    expect(rendered.split('\n').map(line => line.split(' keeps')[0])).toEqual(['- idea line 3', '- idea line 2', '- core line 3', '- opening line 3']);
    expect(countTokens(rendered)).toBeLessThanOrEqual(budget);
  });

  it('should mark the section truncated once the cap drops lines', () => {
    const many = Array.from({ length: 200 }, (_, index) => entry({ topic: `cast.${index}`, writerLine: `Character ${index} speaks in short, careful sentences about the tides.` }));

    const section = writerLinesSection(many, []);

    expect(section?.truncated).toBe(true);
    expect(section?.required).toBe(true);
    expect(countTokens(section?.rendered ?? '')).toBeLessThanOrEqual(WRITER_LINES_BUDGET + 20);
  });

  it('should render nothing when no decision carries a writer line', () => {
    expect(renderWriterLines([entry({ kind: 'direction', writerLine: 'ignored' })], [])).toBeNull();
    expect(writerLinesSection([], [])).toBeNull();
  });
});
