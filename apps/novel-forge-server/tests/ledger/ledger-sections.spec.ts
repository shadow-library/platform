import { describe, expect, it } from 'bun:test';

import { applyBudget, countTokens } from '@modules/ai/context/token-budget';
import {
  AUTHOR_BRIEF_TOPIC,
  type LedgerContextEntry,
  ledgerSection,
  renderLedger,
  renderWriterLines,
  WRITER_LINES_BUDGET,
  writerLinesSection,
} from '@modules/ledger/ledger-sections';

function entry(overrides: Partial<LedgerContextEntry>): LedgerContextEntry {
  return {
    kind: 'decision',
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
  entry({ kind: 'decision', topic: 'protagonist', statement: 'Ada believes she owes nothing to anyone.', writerLine: 'Ada never asks for help on the page.' }),
  entry({ rejectedAlternatives: ['A smuggler hides a map in a lighthouse.'], why: 'The debt drives every chapter.', writerLine: 'Keep the debt visible in each chapter.' }),
  entry({ kind: 'direction', topic: 'taste', statement: 'Quiet dread over spectacle' }),
  entry({ kind: 'rejected', topic: 'concepts', statement: 'A sea monster siege', why: 'Too loud for this book' }),
  entry({ kind: 'backlog', topic: 'places', statement: 'The drowned chapel', why: 'Not before chapter 20' }),
  entry({ kind: 'system', decidedBy: 'system', topic: 'cast', statement: 'The harbour clerk is fifty-two.', writerLine: 'The clerk moves slowly and misses nothing.' }),
];

describe('the author’s notes', () => {
  it('should stay out of the rendered ledger', () => {
    const notes = entry({ kind: 'direction', topic: AUTHOR_BRIEF_TOPIC, statement: 'The keeper has kept the tide clock for forty years and never once wound it.' });
    const section = ledgerSection([...ledger, notes]);

    expect(renderLedger([...ledger, notes])).not.toContain('never once wound it');
    expect(section.sourceRefs).not.toContain(`ledger:${AUTHOR_BRIEF_TOPIC}`);
  });
});

describe('renderLedger', () => {
  it('should list decisions in ledger order with their why and writer line', () => {
    const rendered = renderLedger(ledger);

    expect(rendered.startsWith('### Decisions\n\n- protagonist: Ada believes she owes nothing to anyone.')).toBe(true);
    expect(rendered).toContain(
      '- premise: A lighthouse keeper inherits a debt the sea collects.\n  Why: The debt drives every chapter.\n  For the writer: Keep the debt visible in each chapter.',
    );
    expect(rendered).toContain('- cast (decided by the system): The harbour clerk is fifty-two.');
  });

  it('should render directions and backlog as lists tagged with their topic', () => {
    const rendered = renderLedger(ledger);

    expect(rendered).toContain('### Author directions\n\n- [taste] Quiet dread over spectacle');
    expect(rendered).toContain('### Backlog — not yet\n\n- [places] The drowned chapel — Not before chapter 20');
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
  it('should list the writer lines of active decisions and system details as bullets in ledger order', () => {
    expect(renderWriterLines(ledger, [])).toBe(
      ['- Ada never asks for help on the page.', '- Keep the debt visible in each chapter.', '- The clerk moves slowly and misses nothing.'].join('\n'),
    );
  });

  it('should scrub a hidden fact out of a writer line', () => {
    const hidden = { factKey: 'clerk_is_heir', text: 'The clerk is the heir.', terms: ['misses nothing'] };

    expect(renderWriterLines(ledger, [hidden])).not.toContain('misses nothing');
  });

  it('should drop the oldest lines first when the lines exceed the cap, keeping the rest in ledger order', () => {
    const ledger = Array.from({ length: 8 }, (_, index) => entry({ topic: `cast.${index}`, writerLine: `line ${index} keeps the harbour bells ringing at dusk.` }));
    const budget = countTokens('- line 0 keeps the harbour bells ringing at dusk.\n') * 3;

    const rendered = renderWriterLines(ledger, [], budget) ?? '';

    expect(rendered.split('\n').map(line => line.split(' keeps')[0])).toEqual(['- line 5', '- line 6', '- line 7']);
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
