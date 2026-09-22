import { describe, expect, it } from 'bun:test';

import { type BlueprintTitleOutput } from '@modules/ai/schemas/blueprint-title.schema';
import { reconcileLockEntries } from '@modules/blueprint/engine/blueprint-round';
import { type MaterialiseContext, type StepInputContext } from '@modules/blueprint/engine/blueprint-step.types';
import { TitleChecksService } from '@modules/blueprint/steps/title-checks.service';
import { type TitleOptions, type TitleSelection, titleStep } from '@modules/blueprint/steps/title.step';
import { type Ledger, type Project } from '@server/database';

import { ledgerEntry } from './blueprint-fixtures';

function output(overrides: Partial<BlueprintTitleOutput> = {}): BlueprintTitleOutput {
  return {
    groups: [
      {
        style: 'short_literary',
        titles: [
          { text: 'The Memory Tithe', from: 'the cost rule' },
          { text: 'What the River Keeps', from: 'the theme' },
        ],
      },
      {
        style: 'web_novel_descriptive',
        titles: [
          { text: 'The Tithe Collector’s Apprentice', from: 'the protagonist' },
          { text: 'I Collect Memories for a Living', from: 'the premise’s hook' },
        ],
      },
    ],
    coachMessage: 'The short ones sell the feeling; the long ones sell the job.',
    ...overrides,
  };
}

function options(): TitleOptions {
  return titleStep.toRound(output(), { previous: null, input: null, focus: null, ledger: [] }).options;
}

function materialise(selection: TitleSelection, ledger: Ledger.Entry[] = [], round: TitleOptions | null = options()): ReturnType<typeof titleStep.materialise> {
  const ctx = { round: round ? { round: 1, options: round } : null, ledger, project: { id: 7n }, tx: {} } as unknown as MaterialiseContext<TitleOptions>;
  return titleStep.materialise(selection, ctx);
}

describe('titleStep.toRound', () => {
  it('should number candidates across every group and label each style', () => {
    const round = options();
    expect(round.groups.flatMap(group => group.titles.map(title => title.id))).toEqual(['t1', 't2', 't3', 't4']);
    expect(round.groups.map(group => group.label)).toEqual(['Short and literary', 'Web-novel descriptive']);
  });

  it('should keep the decision each title came from', () => {
    expect(options().groups[0]?.titles[0]).toEqual({ id: 't1', text: 'The Memory Tithe', from: 'the cost rule' });
  });
});

describe('titleStep.inputs', () => {
  it('should tell a re-roll what is already on screen and what the novel is called now', async () => {
    const sections = await titleStep.inputs?.({ previous: options(), project: { title: 'The Memory Tithe' } } as unknown as StepInputContext<TitleOptions, never>);
    expect(sections?.[0]?.key).toBe('already_shown');
    expect(sections?.[0]?.content).toContain('The Memory Tithe');
    expect(sections?.[0]?.content).toContain('current working title');
  });

  it('should send nothing before the first round', async () => {
    expect(await titleStep.inputs?.({ previous: null, project: { title: null } } as unknown as StepInputContext<TitleOptions, never>)).toEqual([]);
  });
});

describe('titleStep.materialise', () => {
  it('should lock the working title and update the novel’s title', async () => {
    const plan = await materialise({ working: { optionId: 't1', text: 'The Memory Tithe' } });
    expect(plan.entries[0]).toMatchObject({ kind: 'decision', topic: 'title', statement: 'The Memory Tithe', why: 'From the cost rule.' });
    expect(plan.changeSet).toEqual([{ op: 'premise.update', title: 'The Memory Tithe' }]);
  });

  it('should keep the starred titles on the decision rather than as answers of their own', async () => {
    const plan = await materialise({ working: { optionId: 't1', text: 'The Memory Tithe' }, shortlist: ['The Tithe Collector’s Apprentice', 'The Memory Tithe'] });
    expect(plan.entries).toHaveLength(1);
    expect(plan.entries[0]?.payload).toEqual({ choiceId: 't1', from: 'the cost rule', ownWords: false, shortlist: ['The Tithe Collector’s Apprentice'] });
  });

  it('should write a refused title to its own permanent topic', async () => {
    const plan = await materialise({
      working: { optionId: 't1', text: 'The Memory Tithe' },
      rejected: [{ optionId: 't4', reason: 'I never want a first-person title' }],
    });
    expect(plan.entries[1]).toMatchObject({ kind: 'rejected', topic: 'title.ruled_out', statement: 'I Collect Memories for a Living', why: 'I never want a first-person title' });
    expect(plan.replaces).toEqual(['title']);
  });

  it('should not write a refusal the notebook already holds', async () => {
    const known = [ledgerEntry({ kind: 'rejected', phase: 'heart', topic: 'title.ruled_out', statement: 'I Collect Memories for a Living', stepKey: 'title' })];
    const plan = await materialise({ working: { optionId: 't1', text: 'The Memory Tithe' }, rejected: [{ optionId: 't4', reason: 'Said so already' }] }, known);
    expect(plan.entries).toHaveLength(1);
  });

  it('should never refuse the title it is locking', async () => {
    const plan = await materialise({ working: { optionId: 't1', text: 'The Memory Tithe' }, rejected: [{ optionId: 't1', reason: 'A misclick' }] });
    expect(plan.entries).toHaveLength(1);
  });

  it('should record the titles passed over', async () => {
    const plan = await materialise({ working: { optionId: 't1', text: 'The Memory Tithe' } });
    expect(plan.entries[0]?.rejectedAlternatives).toEqual(['What the River Keeps', 'The Tithe Collector’s Apprentice', 'I Collect Memories for a Living']);
  });

  it('should take a title the author typed themselves', async () => {
    const plan = await materialise({ working: { text: '  The Ledger of Small Debts  ' } });
    expect(plan.entries[0]?.statement).toBe('The Ledger of Small Debts');
    expect(plan.entries[0]?.payload).toEqual({ ownWords: true });
    expect(plan.changeSet).toEqual([{ op: 'premise.update', title: 'The Ledger of Small Debts' }]);
  });

  it('should refuse an empty title', async () => {
    await expect(materialise({ working: { text: '   ' } })).rejects.toThrow(expect.objectContaining({ code: 'BPR_004' }));
  });
});

describe('titleStep re-lock', () => {
  it('should supersede the working title and leave earlier refusals standing', async () => {
    const plan = await materialise({ working: { optionId: 't2', text: 'What the River Keeps' } });
    const active = [
      ledgerEntry({ id: 95n, kind: 'decision', phase: 'heart', topic: 'title', stepKey: 'title', statement: 'The Memory Tithe', payload: { choiceId: 't1', ownWords: false } }),
      ledgerEntry({ id: 96n, kind: 'rejected', phase: 'heart', topic: 'title.ruled_out', stepKey: 'title', statement: 'I Collect Memories for a Living', payload: null }),
    ];
    const reconciled = reconcileLockEntries(titleStep, plan, active);
    expect(reconciled.supersede.map(pair => pair.previous.id)).toEqual([95n]);
    expect(reconciled.withdraw).toHaveLength(0);
  });
});

function checksService(rows: { name: string; title: string | null }[]): TitleChecksService {
  const project = { id: 7n, kind: 'new_novel', ownerKind: 'user', ownerId: 3n } as unknown as Project.Row;
  const db = {
    query: { projects: { findFirst: () => Promise.resolve(project) } },
    select: () => ({ from: () => ({ where: () => Promise.resolve(rows) }) }),
  };
  const actor = { current: () => ({ kind: 'user' as const, id: 9n }) };
  return new TitleChecksService({ getPostgresClient: () => db } as never, actor as never);
}

describe('TitleChecksService', () => {
  it('should say a title is free when the author’s library does not hold it', async () => {
    const [result] = await checksService([{ name: 'Another Novel', title: 'Another Novel' }]).check(7n, ['The Memory Tithe']);
    expect(result?.library).toEqual({ status: 'ok', detail: 'Not used in your library' });
    expect(result?.catalogFit.status).toBe('ok');
  });

  it('should warn on a title another novel of theirs already has, whatever its case', async () => {
    const [result] = await checksService([{ name: 'the memory  tithe', title: null }]).check(7n, ['The Memory Tithe']);
    expect(result?.library.status).toBe('warn');
  });

  it('should never claim the published-titles check it cannot run', async () => {
    const [result] = await checksService([]).check(7n, ['The Memory Tithe']);
    expect(result?.published.status).toBe('unknown');
    expect(result?.published.detail).toContain('weren’t checked');
  });

  it('should warn when a title would not fit a catalog card', async () => {
    const [result] = await checksService([]).check(7n, ['I Collect Memories for a Living in the Drowned City of Vell and I Am Very Tired']);
    expect(result?.catalogFit.status).toBe('warn');
    expect(result?.catalogFit.detail).toContain('Long for a catalog card');
  });

  it('should check each title once and no more than a batch', async () => {
    const titles = Array.from({ length: 12 }, (_, at) => `Title ${at}`);
    const results = await checksService([]).check(7n, [...titles, 'Title 0']);
    expect(results).toHaveLength(8);
  });

  it('should refuse a title longer than the response can carry', async () => {
    await expect(checksService([]).check(7n, ['x'.repeat(121)])).rejects.toThrow(expect.objectContaining({ code: 'BPR_004' }));
  });
});
