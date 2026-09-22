import { describe, expect, it } from 'bun:test';

import { type BlueprintCheckOutput } from '@modules/ai/schemas/blueprint-check.schema';
import { type MaterialiseContext } from '@modules/blueprint/engine/blueprint-step.types';
import { type CheckOptions, type CheckSelection, type CheckSlice, checkStep, findingTopic, mergeFindings, sliceOf, unrunSlices } from '@modules/blueprint/steps/check.step';
import { type Ledger } from '@server/database';

import { ledgerEntry } from './blueprint-fixtures';

const RULE_CLASH = 'Rule clash: cost rule vs chapter 3';
const AGES = 'Ages don’t add up: Brannoc';

const view: CheckOptions = {
  slices: [
    { slice: 'rules', run: true, passed: 8 },
    { slice: 'cast', run: true, passed: 4 },
    { slice: 'shape', run: true, passed: 2 },
  ],
  findings: [
    {
      id: 'f1',
      slice: 'rules',
      kind: 'story',
      title: RULE_CLASH,
      detail: 'Chapter 3 has him paying with a childhood memory he does not have.',
      choices: [
        { id: 'f1a', label: 'He pays with recent memories', detail: 'Keeps the rule. He forgets meeting Lise.', changeSet: [] },
        { id: 'f1b', label: 'Lost memories still owe', detail: 'A volume three twist; rewrites a locked rule.', changeSet: [] },
      ],
    },
    {
      id: 'f2',
      slice: 'cast',
      kind: 'arithmetic',
      title: AGES,
      detail: 'His card says 38 and the page says thirty years collecting from sixteen.',
      choices: [
        {
          id: 'f2a',
          label: 'Make him 45',
          detail: 'Matches thirty years from sixteen.',
          changeSet: [{ op: 'entity.upsert', entityKey: 'brannoc', type: 'character', notes: 'Brannoc is 45.' }],
        },
        { id: 'f2b', label: 'Say “twenty-six years”', detail: 'Keeps him 38 and rewrites the page.', changeSet: [] },
      ],
    },
  ],
};

function selection(overrides: Partial<CheckSelection> = {}): CheckSelection {
  return {
    resolutions: [
      { findingId: 'f1', choiceId: 'f1a', dismissed: false },
      { findingId: 'f2', choiceId: 'f2a', dismissed: false },
    ],
    ...overrides,
  };
}

function materialise(chosen: CheckSelection, ledger: Ledger.Entry[] = [], options: CheckOptions = view) {
  const context = { round: { round: 1, options }, ledger, project: { id: 7n }, tx: {} } as unknown as MaterialiseContext<CheckOptions>;
  return checkStep.materialise(chosen, context);
}

const summaryOf = (plan: Awaited<ReturnType<typeof materialise>>) => plan.entries.find(entry => entry.topic === 'check');

describe('checkStep.materialise', () => {
  it('should turn every resolution into a decision on the finding’s own topic, and carry the fix it took', async () => {
    const plan = await materialise(selection());

    expect(plan.entries.map(entry => entry.topic)).toEqual([findingTopic(RULE_CLASH), findingTopic(AGES), 'check']);
    expect(plan.entries[0]).toMatchObject({
      kind: 'decision',
      statement: 'He pays with recent memories',
      why: 'Keeps the rule. He forgets meeting Lise.',
      writerLine: 'He pays with recent memories',
      rejectedAlternatives: ['Lost memories still owe'],
      payload: { slice: 'rules', kind: 'story', resolution: 'chosen' },
    });
    expect(plan.changeSet).toEqual([{ op: 'entity.upsert', entityKey: 'brannoc', type: 'character', notes: 'Brannoc is 45.' }]);
  });

  it('should record a dismissal as a decision carrying the author’s reason, and change nothing', async () => {
    const plan = await materialise(
      selection({
        resolutions: [
          { findingId: 'f1', text: 'Chapter 3 is a flashback; the rule holds.', dismissed: true },
          { findingId: 'f2', choiceId: 'f2b', dismissed: false },
        ],
      }),
    );

    expect(plan.entries[0]).toMatchObject({
      kind: 'decision',
      statement: `Left as it is: ${RULE_CLASH}`,
      why: 'Chapter 3 is a flashback; the rule holds.',
      payload: { resolution: 'dismissed' },
    });
    expect(plan.entries[0]).not.toHaveProperty('writerLine');
    expect(plan.changeSet).toEqual([]);
  });

  it('should take a fix the author wrote themselves over both ways out', async () => {
    const plan = await materialise(selection({ resolutions: [{ findingId: 'f1', text: 'He pays with the memory of the jar itself.', dismissed: false }] }));

    expect(plan.entries[0]).toMatchObject({ statement: 'He pays with the memory of the jar itself.', payload: { resolution: 'own' } });
    expect(plan.entries[0]?.rejectedAlternatives).toEqual(['He pays with recent memories', 'Lost memories still owe']);
  });

  it('should summarise the pass so the gate can read it, counting what is still open', async () => {
    const plan = await materialise(selection({ resolutions: [{ findingId: 'f2', choiceId: 'f2a', dismissed: false }] }));

    expect(summaryOf(plan)).toMatchObject({ statement: '14 checks passed · 1 fixed · 0 left as they are · 1 open' });
    expect(summaryOf(plan)?.payload).toMatchObject({ passed: 14, resolved: 1, dismissed: 0, open: 1, openFindings: [RULE_CLASH] });
  });

  it('should count a finding answered by an earlier lock as no longer open', async () => {
    const before = ledgerEntry({ id: 9n, kind: 'decision', phase: 'opening', topic: findingTopic(RULE_CLASH), stepKey: 'check', statement: 'He pays with recent memories' });
    const plan = await materialise(selection({ resolutions: [{ findingId: 'f2', choiceId: 'f2a', dismissed: false }] }), [before]);

    expect(summaryOf(plan)?.payload).toMatchObject({ open: 0 });
  });

  it('should refuse a dismissal with no reason, and a finding left without any answer at all', async () => {
    await expect(materialise(selection({ resolutions: [{ findingId: 'f1', dismissed: true }] }))).rejects.toMatchObject({ code: 'BPR_004' });
    await expect(materialise(selection({ resolutions: [{ findingId: 'f1', dismissed: false }] }))).rejects.toMatchObject({ code: 'BPR_004' });
  });

  it('should refuse to finish while a slice has never been checked', async () => {
    const half = { ...view, slices: [{ slice: 'rules' as const, run: true, passed: 8 }, ...view.slices.slice(1).map(state => ({ ...state, run: false }))] };
    await expect(materialise(selection(), [], half)).rejects.toMatchObject({ code: 'BPR_004' });
  });

  it('should refuse a lock with no ready round rather than finishing the Blueprint on nothing', async () => {
    const context = { round: null, ledger: [], project: { id: 7n }, tx: {} } as unknown as MaterialiseContext<CheckOptions>;
    await expect(checkStep.materialise({ resolutions: [] }, context)).rejects.toMatchObject({ code: 'BPR_004' });
    expect(unrunSlices([])).toEqual(['rules', 'cast', 'shape']);
  });

  it('should write a writer line only where the fix changes what the writer must do', async () => {
    const plan = await materialise(selection());

    expect(plan.entries[0]).toMatchObject({ writerLine: 'He pays with recent memories' });
    expect(plan.entries[1]).not.toHaveProperty('writerLine');
  });

  it('should refuse a resolution whose wording states a truth the design still withholds', async () => {
    const reveals = ledgerEntry({
      id: 8n,
      kind: 'decision',
      phase: 'spine',
      topic: 'spine.reveals',
      stepKey: 'spine',
      statement: 'the audit',
      payload: {
        reveals: [{ factKey: 'reveal_1', revealChapter: 60, movement: 1, when: 'the audit', truth: 'He pays with recent memories', writerNote: 'x', terms: [], pinned: true }],
      },
    });
    await expect(materialise(selection(), [reveals])).rejects.toMatchObject({ code: 'BPR_004' });
  });

  it('should refuse a staged fix whose ops are not ones a check may apply', async () => {
    const bad = {
      ...view,
      findings: [
        {
          ...(view.findings[1] as (typeof view.findings)[number]),
          choices: [{ id: 'f2a', label: 'Drop him', detail: 'x', changeSet: [{ op: 'volume.remove', volumeKey: 'volume_1' }] }],
        },
      ],
    };
    await expect(materialise(selection({ resolutions: [{ findingId: 'f2', choiceId: 'f2a', dismissed: false }] }), [], bad)).rejects.toMatchObject({ code: 'BPR_004' });
  });

  it('should refuse a resolution naming a finding or a way out the round never offered', async () => {
    await expect(materialise(selection({ resolutions: [{ findingId: 'f9', dismissed: false, text: 'x' }] }))).rejects.toMatchObject({ code: 'BPR_005' });
    await expect(materialise(selection({ resolutions: [{ findingId: 'f1', choiceId: 'f2a', dismissed: false }] }))).rejects.toMatchObject({ code: 'BPR_005' });
  });
});

describe('checkStep slicing', () => {
  const output = (findings: BlueprintCheckOutput['findings'], passed = 3): BlueprintCheckOutput => ({ passed, findings, coachMessage: 'ok' });

  it('should run the first unchecked slice by default and the one the author asked for otherwise', () => {
    expect(sliceOf(null, null)).toBe('rules');
    expect(sliceOf(null, { slices: [{ slice: 'rules', run: true, passed: 1 }], findings: [] })).toBe('cast');
    expect(sliceOf({ slice: 'shape' }, null)).toBe('shape');
  });

  it('should replace the checked slice’s findings and leave every other slice’s alone', () => {
    const fresh = output([{ kind: 'arithmetic', title: 'New cast problem', detail: 'x', choices: [{ label: 'A', detail: 'a', changeSet: [] }] }]).findings;
    const merged = mergeFindings(view, 'cast', fresh);

    expect(merged.map(finding => finding.title)).toEqual([RULE_CLASH, 'New cast problem']);
    expect(merged.map(finding => finding.id)).toEqual(['f1', 'f2']);
    expect(merged[1]?.choices[0]?.id).toBe('f2a');
  });

  it('should drop every finding of a slice that now comes back clean', () => {
    expect(mergeFindings(view, 'rules', []).map(finding => finding.title)).toEqual([AGES]);
  });

  it('should give a finding a topic made from what it is about, so re-answering it supersedes the first answer', () => {
    expect(findingTopic(AGES)).toBe('check.ages_don_t_add_up_brannoc');
    expect(findingTopic(AGES)).toBe(findingTopic('Ages don’t add up: Brannoc!'));
  });
});

describe('checkStep.inputs secrecy', () => {
  const TRUTH = 'The jar holds his mother’s memory';
  const facts = [
    { factKey: 'cost_of_power', text: 'Every lit hour costs a named memory', revealChapter: 1, constraintNote: 'It makes power personal', writerNote: null },
    { factKey: 'reveal_1', text: TRUTH, revealChapter: 60, constraintNote: 'Comes out at the audit', writerNote: 'He avoids the jar' },
  ];
  const db = {
    query: {
      bibleDocuments: { findMany: async () => [] },
      canonFacts: { findMany: async () => facts },
      entities: { findMany: async () => [] },
      briefs: { findMany: async () => [] },
      volumes: { findMany: async () => [] },
      arcs: { findMany: async () => [] },
    },
  };

  const sectionsFor = async (): Promise<Record<string, string>> => {
    const sections = await checkStep.inputs!({ projectId: 7n, project: {}, ledger: [], db, previous: null, input: null, focus: null, catalog: async () => '' } as never);
    return Object.fromEntries(sections.map(section => [section.key, section.content]));
  };

  it('should hand the rules slice a withheld fact as its note and its chapter, never as its text', async () => {
    const facts = (await sectionsFor())['check_facts'] ?? '';

    expect(facts).toContain('`cost_of_power` (open canon): Every lit hour costs a named memory');
    expect(facts).toContain('`reveal_1` is withheld until chapter 60: He avoids the jar');
    expect(facts).not.toContain(TRUTH);
    expect(facts).not.toContain('Comes out at the audit');
  });
});

describe('checkStep.inputs tailoring', () => {
  const emptyDb = {
    query: {
      bibleDocuments: { findMany: async () => [] },
      canonFacts: { findMany: async () => [] },
      entities: { findMany: async () => [] },
      briefs: { findMany: async () => [] },
      volumes: { findMany: async () => [] },
      arcs: { findMany: async () => [] },
    },
  };

  const promise = (drivers: string[]): Ledger.Entry =>
    ledgerEntry({ id: 5n, kind: 'decision', phase: 'heart', topic: 'promise', stepKey: 'promise', statement: 'A promise', payload: { drivers } });

  const scopeFor = async (ledger: Ledger.Entry[], previous: CheckOptions | null, input: { slice: CheckSlice } | null = null): Promise<string> => {
    const sections = await checkStep.inputs!({ projectId: 7n, project: {}, ledger, db: emptyDb, previous, input, focus: null, catalog: async () => '' } as never);
    return sections.find(section => section.key === 'check_scope')?.content ?? '';
  };

  const shapeRun: CheckOptions = {
    slices: [
      { slice: 'rules', run: true, passed: 1 },
      { slice: 'cast', run: true, passed: 1 },
      { slice: 'shape', run: false, passed: 0 },
    ],
    findings: [],
  };

  it('should look for rhythm and small change instead of escalation when slice of life drives the novel', async () => {
    const scope = await scopeFor([promise(['slice_of_life'])], shapeRun);

    expect(scope).toContain('rhythm and small change');
    expect(scope).toContain('Do not ask for an antagonist');
    expect(scope).toContain('has no antagonist by decision');
  });

  it('should assemble the slice the author asked for, not the next unchecked one', async () => {
    const all: CheckOptions = { slices: [{ slice: 'rules', run: false, passed: 0 }], findings: [] };
    expect(await scopeFor([promise(['mystery'])], all, { slice: 'cast' })).toContain('Cast, places and ages');
    expect(await scopeFor([promise(['mystery'])], all)).toContain('Rules and briefs');
  });

  it('should look for escalation and opposition for every other novel', async () => {
    const scope = await scopeFor([promise(['mystery', 'progression'])], shapeRun);

    expect(scope).toContain('an escalation that does not escalate');
    expect(scope).not.toContain('rhythm and small change');
  });
});

describe('checkStep', () => {
  it('should be required, own the check topic and run for every novel', () => {
    expect(checkStep.required).toBe(true);
    expect(checkStep.completionTopics).toEqual(['check']);
    expect(checkStep.appliesWhen).toBeUndefined();
    expect(checkStep.describeOptions(view).map(option => option.id)).toEqual(['f1', 'f1a', 'f1b', 'f2', 'f2a', 'f2b']);
    expect(checkStep.chosenOptionIds(selection())).toEqual(['f1', 'f1a', 'f2', 'f2a']);
  });
});
