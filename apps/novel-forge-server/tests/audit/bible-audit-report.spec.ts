import { describe, expect, it } from 'bun:test';

import { type BibleAuditOutput, type BibleContradictionOutput } from '@modules/ai/schemas';
import { buildAuditReport, COLLISION_WITHHELD, EVIDENCE_WITHHELD, renderReportSummary, REVEAL_WITHHELD, SECRET_WITHHELD, secretRisk } from '@modules/audit/bible-audit-report';
import { type FactLike } from '@modules/bible/fact/knowledge-view';
import { type ChangeOp } from '@modules/refinement/change-set';
import { alwaysCardRule } from '@modules/refinement/write-policy';
import { selectedOpIndexes } from '@server/common';

const SOURCES = new Map([
  ['doc:world/geography', 'The harbour of Saltgate keeps ten lanterns lit every night.'],
  ['chapter:3', 'Mara counts nine lanterns on the quay and the harbour master calls it the usual count.'],
  ['entity:mara', 'name: Mara\ntype: character\nnotes: Mara was raised by the harbour master. She lost her mother in the great flood.'],
]);
const SECRET: FactLike = { factKey: 'lamp_heir', text: 'Mara is the lamp-keeper’s lost heir.', terms: ['lost heir'], source: 'manual' };
const LANTERN_FIX: ChangeOp = { op: 'bible_document.upsert', section: 'world', slug: 'geography', body: 'The harbour of Saltgate keeps nine lanterns lit every night.' };
const BOTH_SIDES = [
  { ref: 'doc:world/geography', quote: 'keeps ten lanterns lit every night' },
  { ref: 'chapter:3', quote: 'calls it the usual count' },
];
const SEEDED: BibleContradictionOutput = {
  contradictions: [{ finding: 'The geography page says ten lanterns; chapter 3 treats nine as the usual count.', evidence: BOTH_SIDES, changeSet: [LANTERN_FIX as never] }],
};

interface BuildOverrides {
  coverage?: BibleAuditOutput | null;
  contradictions?: BibleContradictionOutput | null;
  secrets?: FactLike[];
  existing?: string[];
  current?: Map<string, Record<string, unknown>>;
}

function build(overrides: BuildOverrides = {}) {
  return buildAuditReport({
    coverage: overrides.coverage ?? null,
    contradictions: overrides.contradictions ?? null,
    sources: SOURCES,
    existingRefs: new Set(overrides.existing ?? ['doc:world/geography', 'entity:mara']),
    current: overrides.current ?? new Map(),
    secrets: overrides.secrets ?? [SECRET],
  });
}

function contradictionWith(changeSet: ChangeOp[]): BibleContradictionOutput {
  return { contradictions: [{ finding: 'The lantern count disagrees.', evidence: BOTH_SIDES, changeSet: changeSet as never[] }] };
}

describe('buildAuditReport — contradictions', () => {
  it('should report a seeded contradiction with its verified evidence and stage its fix as a card op', () => {
    const { findings, changeSet } = build({ contradictions: SEEDED });

    expect(findings).toEqual([
      {
        id: 'f1',
        group: 'contradiction',
        ref: 'doc:world/geography',
        text: 'The geography page says ten lanterns; chapter 3 treats nine as the usual count.',
        evidence: BOTH_SIDES,
        opIndexes: [0],
        withheld: null,
      },
    ]);
    expect(changeSet).toEqual([LANTERN_FIX]);
  });

  it('should drop evidence citing something the audit did not read and blank a quote that is not in its source', () => {
    const evidence = [...BOTH_SIDES, { ref: 'doc:world/geography', quote: 'eleven lanterns burn' }, { ref: 'doc:plot/outline', quote: 'ten lanterns lit' }];

    expect(build({ contradictions: { contradictions: [{ finding: 'Count.', evidence, changeSet: [] }] } }).findings[0]?.evidence).toEqual([
      ...BOTH_SIDES,
      { ref: 'doc:world/geography', quote: null },
    ]);
  });

  it('should drop a contradiction with no quote of three words found where it points', () => {
    const output: BibleContradictionOutput = {
      contradictions: [
        { finding: 'Invented.', evidence: [{ ref: 'chapter:40', quote: 'anything at all here' }], changeSet: [] },
        { finding: 'Too short.', evidence: [{ ref: 'chapter:3', quote: 'nine lanterns' }], changeSet: [] },
      ],
    };

    expect(build({ contradictions: output }).findings).toEqual([]);
  });

  it('should keep a contradiction quoting one side only, with no card', () => {
    const output = { contradictions: [{ finding: 'One side.', evidence: [BOTH_SIDES[0] as { ref: string; quote: string }], changeSet: [LANTERN_FIX as never] }] };

    const { findings, changeSet } = build({ contradictions: output });

    expect(changeSet).toEqual([]);
    expect(findings[0]).toMatchObject({ opIndexes: [], withheld: EVIDENCE_WITHHELD });
  });

  it('should accept two quotes from one source as both sides when they do not overlap', () => {
    const evidence = [
      { ref: 'entity:mara', quote: 'raised by the harbour master' },
      { ref: 'entity:mara', quote: 'lost her mother in the great flood' },
    ];

    expect(build({ contradictions: { contradictions: [{ finding: 'Mara’s notes disagree.', evidence, changeSet: [LANTERN_FIX as never] }] } }).changeSet).toEqual([LANTERN_FIX]);
  });

  it('should not take two overlapping quotes of one source as both sides', () => {
    const evidence = [
      { ref: 'entity:mara', quote: 'raised by the harbour master' },
      { ref: 'entity:mara', quote: 'Mara was raised by the harbour' },
    ];

    const { findings, changeSet } = build({ contradictions: { contradictions: [{ finding: 'Mara’s notes disagree.', evidence, changeSet: [LANTERN_FIX as never] }] } });

    expect(changeSet).toEqual([]);
    expect(findings[0]?.withheld).toBe(EVIDENCE_WITHHELD);
  });

  it('should name a finding after its fix, or else the first source that is not a chapter', () => {
    const noFix = { contradictions: [{ finding: 'Count.', evidence: [...BOTH_SIDES].reverse(), changeSet: [] }] };

    expect(build({ contradictions: noFix }).findings[0]?.ref).toBe('doc:world/geography');
  });
});

describe('secretRisk', () => {
  it('should withhold a fix that writes a secret into a page the writer reads, and say why', () => {
    const leak: ChangeOp = { op: 'bible_document.upsert', section: 'world', slug: 'geography', body: 'Mara, the lost heir of the lamp-keeper, watches the harbour.' };

    const { findings, changeSet } = build({ contradictions: contradictionWith([leak]) });

    expect(changeSet).toEqual([]);
    expect(findings[0]).toMatchObject({ opIndexes: [], withheld: SECRET_WITHHELD });
  });

  it('should find a secret restated in an entity record or a fact’s notes to the writer', () => {
    const inNotes: ChangeOp = { op: 'entity.upsert', entityKey: 'mara', type: 'character', notes: 'Truth: Mara is the lamp-keeper’s lost heir.' };
    const inWriterNote: ChangeOp = { op: 'fact.upsert', factKey: 'harbour_rule', writerNote: 'Remember Mara is the lamp-keeper’s lost heir.' };

    expect(secretRisk(inNotes, [SECRET])).toBe(SECRET_WITHHELD);
    expect(secretRisk(inWriterNote, [{ ...SECRET, terms: [] }])).toBe(SECRET_WITHHELD);
  });

  it('should find a secret whose words are mostly there though never quoted', () => {
    const paraphrase: ChangeOp = { op: 'entity.upsert', entityKey: 'mara', type: 'character', notes: 'The keeper of the lamp lost an heir; Mara is that child.' };

    expect(secretRisk(paraphrase, [{ ...SECRET, terms: [] }])).toBe(SECRET_WITHHELD);
  });

  it('should count another fact’s body as writer-visible, since it can be revealed', () => {
    const other: ChangeOp = { op: 'fact.upsert', factKey: 'harbour_rule', body: 'Mara is the lamp-keeper’s lost heir.' };

    expect(secretRisk(other, [SECRET])).toBe(SECRET_WITHHELD);
  });

  it('should withhold any change to when a secret is revealed, what unlocks it or its give-away terms', () => {
    expect(secretRisk({ op: 'fact.upsert', factKey: 'lamp_heir', revealChapter: 2 }, [SECRET])).toBe(REVEAL_WITHHELD);
    expect(secretRisk({ op: 'fact.upsert', factKey: 'lamp_heir', unlock: null }, [SECRET])).toBe(REVEAL_WITHHELD);
    expect(secretRisk({ op: 'fact.upsert', factKey: 'lamp_heir', terms: ['heir'] }, [SECRET])).toBe(REVEAL_WITHHELD);
  });

  it('should not hold a fix against a page that already names a secret when the fix adds nothing of it', () => {
    const page = 'The lost heir of Saltgate is a harbour legend. The harbour keeps ten lanterns.';
    const fix: ChangeOp = {
      op: 'bible_document.upsert',
      section: 'world',
      slug: 'geography',
      body: 'The lost heir of Saltgate is a harbour legend. The harbour keeps nine lanterns.',
    };

    expect(secretRisk(fix, [SECRET], { body: page })).toBeNull();
  });

  it('should withhold a fix that adds a give-away term the page did not carry', () => {
    const page = 'The lost heir of Saltgate is a harbour legend. The harbour keeps ten lanterns.';
    const fix: ChangeOp = { op: 'bible_document.upsert', section: 'world', slug: 'geography', body: `${page} Mara may be the lost heir.` };

    expect(secretRisk(fix, [SECRET], { body: page })).toBe(SECRET_WITHHELD);
  });

  it('should read the truth’s words one sentence at a time, not across a whole page', () => {
    const scattered: ChangeOp = {
      op: 'entity.upsert',
      entityKey: 'mara',
      type: 'character',
      notes: 'Mara keeps the harbour lamp lit. The old keeper retired. She once lost a glove. An heir to the guild visits.',
    };

    expect(secretRisk(scattered, [{ ...SECRET, terms: [] }])).toBeNull();
  });

  it('should stage a change to a secret’s own truth, which the write policy always keeps a card', () => {
    const truth: ChangeOp = { op: 'fact.upsert', factKey: 'lamp_heir', body: 'Mara is the lamp-keeper’s lost heir, born in the flood year.' };

    expect(build({ contradictions: contradictionWith([truth]) }).changeSet).toEqual([truth]);
    expect(alwaysCardRule(truth, { current: new Map([['fact:lamp_heir', { body: SECRET.text }]]) })).toBe('secret_truth');
    expect(alwaysCardRule({ op: 'fact.upsert', factKey: 'lamp_heir', revealChapter: 9 }, { current: new Map([['fact:lamp_heir', {}]]) })).toBe('secret_gating');
  });
});

describe('buildAuditReport — coverage and shared records', () => {
  it('should group coverage findings by what they ask, leave out keeps and give an op no finding claimed its own finding', () => {
    const coverage: BibleAuditOutput = {
      findings: [
        { ref: 'doc:world/geography', action: 'keep', finding: 'Fine as is.' },
        { ref: 'doc:power/system-and-limits', action: 'add', finding: 'No power page.' },
        { ref: 'doc:project/tone', action: 'remove', finding: 'Says nothing.' },
      ],
      changeSet: [
        { op: 'bible_document.upsert', section: 'power', slug: 'system-and-limits', body: 'Lamps answer to blood.' },
        { op: 'bible_document.remove', section: 'project', slug: 'tone' },
        { op: 'entity.upsert', entityKey: 'kael', type: 'character', name: 'Kael', rationale: 'The cast page names Kael but no record exists.' },
      ],
    };

    const { findings } = build({ coverage, existing: ['doc:world/geography', 'doc:project/tone'] });

    expect(findings.map(finding => [finding.group, finding.ref, finding.opIndexes])).toEqual([
      ['add', 'doc:power/system-and-limits', [0]],
      ['add', 'entity:kael', [2]],
      ['remove', 'doc:project/tone', [1]],
    ]);
    expect(findings[1]?.text).toBe('The cast page names Kael but no record exists.');
    expect(findings[2]?.evidence).toEqual([{ ref: 'doc:project/tone', quote: null }]);
  });

  it('should keep a second, different change to a record off the card and say another finding changes it', () => {
    const coverage: BibleAuditOutput = {
      findings: [{ ref: 'doc:world/geography', action: 'revise', finding: 'Thin.' }],
      changeSet: [{ op: 'bible_document.upsert', section: 'world', slug: 'geography', body: 'A longer page.' }],
    };

    const { findings, changeSet } = build({ coverage, contradictions: SEEDED });

    expect(changeSet).toEqual([LANTERN_FIX]);
    expect(findings.map(finding => [finding.group, finding.opIndexes, finding.withheld])).toEqual([
      ['contradiction', [0], null],
      ['revise', [], COLLISION_WITHHELD],
    ]);
  });

  it('should share one op between findings that propose the same change', () => {
    const coverage: BibleAuditOutput = { findings: [{ ref: 'doc:world/geography', action: 'revise', finding: 'Wrong count.' }], changeSet: [{ ...LANTERN_FIX }] };

    const { findings, changeSet } = build({ coverage, contradictions: SEEDED });

    expect(changeSet).toHaveLength(1);
    expect(findings.map(finding => finding.opIndexes)).toEqual([[0], [0]]);
  });
});

describe('selectedOpIndexes', () => {
  const findings = build({
    contradictions: SEEDED,
    coverage: { findings: [{ ref: 'entity:kael', action: 'add', finding: 'Missing.' }], changeSet: [{ op: 'entity.upsert', entityKey: 'kael', type: 'character', name: 'Kael' }] },
  }).findings;

  it('should select every op while nothing is skipped', () => {
    expect(selectedOpIndexes(findings, [])).toEqual([0, 1]);
  });

  it('should leave out the ops only a skipped finding proposes', () => {
    expect(selectedOpIndexes(findings, [{ findingId: 'f1', decision: 'skipped' }])).toEqual([1]);
    expect(selectedOpIndexes(findings, [{ findingId: 'f1', decision: 'kept' }])).toEqual([0, 1]);
  });
});

describe('renderReportSummary', () => {
  it('should say nothing was found and list what was checked', () => {
    expect(renderReportSummary([], 'Checked: 2 pages.')).toBe('Nothing found. Checked: 2 pages.');
  });

  it('should count findings by group, contradictions first', () => {
    const { findings } = build({ contradictions: SEEDED, coverage: { findings: [{ ref: 'entity:kael', action: 'add', finding: 'Missing.' }], changeSet: [] }, existing: [] });

    expect(renderReportSummary(findings, 'Checked: 2 pages.')).toBe('2 findings: 1 contradiction, 1 to add. Checked: 2 pages.');
  });
});
