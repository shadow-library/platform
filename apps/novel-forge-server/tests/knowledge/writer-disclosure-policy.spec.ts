import { describe, expect, it } from 'bun:test';

import { type FactLike } from '@modules/bible/fact/knowledge-view';
import { cluesNamingTerms } from '@server/common';
import { type WriterDisclosureInput, WriterDisclosurePolicy } from '@modules/bible/fact/writer-disclosure-policy';

const ledgerFact: FactLike = {
  factKey: 'ledger_forgery',
  text: 'The ledger in the study is a forgery planted by Elias.',
  constraintNote: 'Protects the forged-ledger reveal in the study.',
  writerNote: 'Elias steers conversation away from the study.',
  terms: ['forgery', 'planted'],
};
const debtFact: FactLike = { factKey: 'motive_debt', text: 'Marlow owed Elias a ruinous gambling debt.', writerNote: 'Elias flinches when gambling is mentioned.', terms: [] };

function policy(overrides: Partial<WriterDisclosureInput> = {}): WriterDisclosurePolicy {
  return new WriterDisclosurePolicy({ chapter: 5, lockedFacts: [], plannerOnly: [], plannerPages: [], volumeOrdinals: new Map(), currentVolumeOrdinal: null, ...overrides });
}

const locked = (...lockedFacts: FactLike[]): WriterDisclosurePolicy => policy({ lockedFacts });

describe('WriterDisclosurePolicy.scrub — locked facts', () => {
  it('should replace leak findings with writer-safe lines and withhold the truth, author note and key', () => {
    const note = [
      '[soft] knowledge leak: "forgery" exposes [ledger_forgery] — …a forgery…',
      '[soft] brief: the study scene is skipped',
      'Keep ledger_forgery quiet: The ledger in the study is a forgery planted by Elias. (Protects the forged-ledger reveal in the study.)',
    ].join('\n');

    expect(locked(ledgerFact).scrub(note, 'note')).toBe(
      [
        '[soft] brief: the study scene is skipped',
        'Keep [withheld] quiet: [withheld]. ([withheld].)',
        '- remove or avoid "forgery" — Elias steers conversation away from the study.',
      ].join('\n'),
    );
  });

  it('should withhold a bare key only when it has an underscore, and a fact: ref always', () => {
    const heir: FactLike = { factKey: 'heir', text: 'Mara is the lost heir of the tide court.', writerNote: null };
    const lostHeir: FactLike = { factKey: 'lost_heir', text: 'Mara is the lost heir of the tide court.', writerNote: null };

    expect(locked(heir).scrub('Never name the heir or fact:heir. Bring the Heir back.', 'summary')).toBe('Never name the heir or [withheld]. Bring the Heir back.');
    expect(locked(lostHeir).scrub('Guard lost_heir, not lost_heirloom.', 'summary')).toBe('Guard [withheld], not lost_heirloom.');
  });

  it('should withhold every give-away term as a whole word, longest first, in any field', () => {
    const text = 'Expose the Forgery; the planted ledger was planted early. The ledger in the study is a forgery planted by Elias. Forgeryless nights.';

    expect(locked(ledgerFact).scrub(text, 'prose')).toBe('Expose the [withheld]; the [withheld] ledger was [withheld] early. [withheld]. Forgeryless nights.');
  });

  it('should match a capitalised term case-sensitively and a lowercase term with Unicode word boundaries', () => {
    const will: FactLike = { factKey: 'will_lives', text: 'Will survived the flood.', writerNote: null, terms: ['Will'] };
    const court: FactLike = { factKey: 'tide_court', text: 'The court is drowned.', writerNote: null, terms: ['tide court', 'ox'] };

    expect(locked(will).scrub('Will returns, and she will not forgive him.', 'bible_page')).toBe('[withheld] returns, and she will not forgive him.');
    expect(locked(court).scrub('The Tide Court waits; the tide courtiers do not; Ñtide court stays; the ox sleeps.', 'entity')).toBe(
      'The [withheld] waits; the tide courtiers do not; Ñtide court stays; the ox sleeps.',
    );
  });

  it('should withhold a copied truth whose lines were re-wrapped and one of its sentences copied alone', () => {
    const twoSentences: FactLike = { factKey: 'bell_price', text: 'The bell rings only for the drowned. Each ring costs the ringer a year.', writerNote: null };
    const scrubbed = locked(twoSentences).scrub('Harbour lore:\nThe bell rings only\n  for the drowned. Later: each ring costs the ringer a year!', 'bible_page');

    expect(scrubbed).toBe('Harbour lore:\n[withheld]. Later: [withheld]!');
  });

  it('should leave text alone when nothing is withheld, and be stable when run twice', () => {
    expect(policy().scrub('knowledge leak: anything', 'note')).toBe('knowledge leak: anything');
    const disclosure = locked(ledgerFact, debtFact);
    const once = disclosure.scrub('[soft] knowledge leak: [motive_debt] acts on the debt', 'note');

    expect(disclosure.scrub(once, 'note')).toBe(once);
  });

  it('should count what it withheld per field', () => {
    const disclosure = locked(ledgerFact);
    disclosure.scrub('A forgery.', 'summary');
    disclosure.scrub('Nothing here.', 'heading');
    disclosure.scrub('planted and planted', 'summary');

    expect(Object.fromEntries(disclosure.withheld)).toEqual({ summary: 3 });
  });
});

describe('WriterDisclosurePolicy.scrub — planner-only material', () => {
  const opening = 'Mara arrives at the harbour at dusk';
  const timeline = `## Opening\n- ${opening}.\n## Later\n- The apprentice finds the ledger of lost names in the cellar.\n- Short beat.`;

  it("should leave the chapter's own plan, notes and prose quoting an opening timeline line intact", () => {
    const disclosure = policy({ plannerPages: [timeline] });
    const brief = `${opening} and meets Tobin.`;

    for (const field of ['plan', 'writer_line', 'note', 'style', 'prose', 'state', 'summary'] as const) expect(disclosure.scrub(brief, field)).toBe(brief);
  });

  it('should withhold a planner-only page line copied into a page, sheet, reference or plugin section, but not a short line on its own', () => {
    const disclosure = policy({ plannerPages: [timeline] });

    for (const field of ['bible_page', 'entity', 'reference', 'plugin'] as const) {
      expect(disclosure.scrub(`${opening} and meets Tobin. Short beat.`, field)).toBe('[withheld] and meets Tobin. Short beat.');
    }
    expect(disclosure.scrub('Cellar notes: the apprentice finds the ledger of lost names in the cellar.', 'bible_page')).toBe('Cellar notes: [withheld].');
  });

  it('should withhold the ending and later volumes from every field', () => {
    const disclosure = policy({ plannerOnly: ['The keeper lets the lamp go dark.'] });

    for (const field of ['plan', 'prose', 'bible_page'] as const) expect(disclosure.scrub('At last the keeper lets the lamp go dark.', field)).toBe('At last [withheld].');
  });

  it('should withhold a whole planner-only passage of three words or twelve characters, and no shorter one', () => {
    const disclosure = policy({ plannerOnly: ['He lives on.', 'Bittersweet', 'None'], lockedFacts: [{ ...debtFact, constraintNote: 'None' }] });

    expect(disclosure.scrub('In the end he lives on.', 'plan')).toBe('In the end [withheld].');
    expect(disclosure.scrub('None of it was bittersweet. Nobody said none.', 'summary')).toBe('None of it was bittersweet. Nobody said none.');
  });

  it('should match a copy whose quotes, apostrophes, dashes or emphasis differ', () => {
    const disclosure = policy({ plannerOnly: ['The keeper\'s "last" lamp — the only one — goes dark.'] });

    expect(disclosure.scrub('Then **the keeper’s** “last” lamp – the only one – goes dark!', 'bible_page')).toBe('Then [withheld]!');
  });
});

describe('WriterDisclosurePolicy.scrubState', () => {
  it('should scrub keys and values and drop an established fact carrying a give-away term', () => {
    const state = { 'forgery watch': 'Elias hid the forgery.', establishedFacts: ['The study was locked.', 'A forgery sits in the study.', 'The candles burned out.'], hp: 3 };

    expect(locked(ledgerFact).scrubState(state, 1)).toEqual({ '[withheld] watch': 'Elias hid the [withheld].', establishedFacts: ['The study was locked.'], hp: 3 });
  });

  it('should keep two keys apart when both scrub to the same text', () => {
    expect(locked(ledgerFact).scrubState({ forgery: 1, planted: 2 }, 5)).toEqual({ '[withheld]': 1, '[withheld] (2)': 2 });
  });
});

describe('WriterDisclosurePolicy.canResolve', () => {
  const volumes = new Map([
    ['v1', 1],
    ['v2', 2],
    ['v3', 3],
  ]);

  it('should resolve the current and earlier volumes only', () => {
    const disclosure = policy({ volumeOrdinals: volumes, currentVolumeOrdinal: 2 });

    expect(['volume:v1', 'volume:v2', 'volume:v3', 'volume:missing'].map(ref => disclosure.canResolve(ref))).toEqual([true, true, false, true]);
  });

  it('should resolve no volume when the chapter belongs to none', () => {
    expect(policy({ volumeOrdinals: volumes }).canResolve('volume:v1')).toBe(false);
  });

  it('should resolve earlier chapters only, and never a planner-only page', () => {
    const disclosure = policy();

    expect(['chapter:4', 'chapter:5', 'chapter:9', 'chapter:x'].map(ref => disclosure.canResolve(ref))).toEqual([true, false, false, false]);
    expect(disclosure.canResolve('bible_doc:project/timeline')).toBe(false);
    expect(disclosure.canResolve('bible_doc:project/open-questions')).toBe(false);
    expect(disclosure.canResolve('bible_doc:story_state/volume-plan')).toBe(false);
    expect(disclosure.canResolve('bible_doc:story_state/volumes')).toBe(false);
    expect(disclosure.canResolve('bible_doc:plot/escalation-map')).toBe(false);
    expect(disclosure.canResolve('bible_doc:project/premise')).toBe(true);
    expect(disclosure.canResolve('entity:mira')).toBe(true);
  });
});

describe('WriterDisclosurePolicy.opensBy', () => {
  it('should admit a thread or mystery opened at or before the chapter only', () => {
    expect([3, 5, 6, null, undefined].map(opened => policy().opensBy(opened))).toEqual([true, true, false, false, false]);
    expect(WriterDisclosurePolicy.planner().opensBy(null)).toBe(true);
  });
});

describe('WriterDisclosurePolicy.leakLines', () => {
  it('should name each locked give-away term a body uses, with its writer note, and nothing for a clean body', () => {
    const disclosure = locked(ledgerFact);

    expect(disclosure.leakLines('She found the forgery.')).toEqual(['- remove or avoid "forgery" — Elias steers conversation away from the study.']);
    expect(disclosure.leakLines('She found the ledger.')).toEqual([]);
  });
});

describe('WriterDisclosurePolicy.planner', () => {
  it('should withhold nothing and resolve every reference', () => {
    const planner = WriterDisclosurePolicy.planner();

    expect(planner.scrub('A forgery planted by Elias.', 'plan')).toBe('A forgery planted by Elias.');
    expect(['volume:v9', 'chapter:900', 'bible_doc:project/timeline'].every(ref => planner.canResolve(ref))).toBe(true);
  });
});

describe('WriterDisclosurePolicy.allowedClues', () => {
  it("should list the locked facts' clues once each, unscrubbed", () => {
    const clued = { ...ledgerFact, allowedClues: ['Ink smudges on the forgery.', ' ', 'Elias avoids the study.'] };
    const disclosure = locked(clued, { ...debtFact, allowedClues: ['Elias avoids the study.'] });

    expect(disclosure.allowedClues()).toEqual(['Ink smudges on the forgery.', 'Elias avoids the study.']);
  });
});

describe('cluesNamingTerms', () => {
  it('should name each clue that uses a give-away term by the same rule the scrub uses', () => {
    expect(cluesNamingTerms(['Will waits by the door', 'she will wait', 'a cold draught'], ['Will', 'draught', 'ox'])).toEqual([
      '"Will waits by the door" names "Will"',
      '"a cold draught" names "draught"',
    ]);
    expect(cluesNamingTerms(null, ['Will'])).toEqual([]);
  });
});
