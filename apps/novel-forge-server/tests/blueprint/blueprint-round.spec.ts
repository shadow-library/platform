import { describe, expect, it } from 'bun:test';

import { blueprintSections, joinSections } from '@modules/ai/context';
import {
  effectiveRoundStatus,
  reconcileLockEntries,
  renderRoundInput,
  resolveNudges,
  roundLedgerEffects,
  stepMessages,
  UNQUEUED_ROUND_GRACE_MS,
} from '@modules/blueprint/engine/blueprint-round';
import { type RoundAuthorInput, type ScreenStep } from '@modules/blueprint/engine/blueprint-step.types';
import { startStep } from '@modules/blueprint/steps/start.step';

import { ledgerEntry, round } from './blueprint-fixtures';

const step = startStep as unknown as ScreenStep<unknown, unknown, unknown, unknown>;
const offered = [
  { id: 'c1', label: 'A lighthouse keeper who hates the sea' },
  { id: 'c2', label: 'A storm that never ends' },
];

function input(overrides: Partial<RoundAuthorInput> = {}): RoundAuthorInput {
  return { steer: null, nudges: [], keepAsDirection: false, feedback: [], input: null, focus: null, ...overrides };
}

describe('effectiveRoundStatus', () => {
  const now = new Date(10 * UNQUEUED_ROUND_GRACE_MS);

  it('should keep a settled round as it is', () => {
    expect(effectiveRoundStatus(round({ status: 'ready' }), 'cancelled', now)).toEqual({ status: 'ready', error: null });
  });

  it('should report an active round whose job was cancelled or failed with the job outcome', () => {
    expect(effectiveRoundStatus(round({ status: 'pending' }), 'cancelled', now).status).toBe('cancelled');
    expect(effectiveRoundStatus(round({ status: 'running' }), 'failed', now).status).toBe('failed');
    expect(effectiveRoundStatus(round({ status: 'running' }), 'in_progress', now).status).toBe('running');
  });

  it('should fail a round that was never queued only after the grace period', () => {
    expect(effectiveRoundStatus(round({ status: 'pending', jobId: null, createdAt: new Date(now.getTime() - 1000) }), null, now).status).toBe('pending');
    expect(effectiveRoundStatus(round({ status: 'pending', jobId: null, createdAt: new Date(0) }), null, now).status).toBe('failed');
  });
});

describe('roundLedgerEffects', () => {
  it('should record a kept steer as a direction on the step’s steer topic', () => {
    expect(roundLedgerEffects(step, input({ steer: '  Quieter, more domestic  ', keepAsDirection: true }), offered)).toEqual([
      { kind: 'direction', phase: 'idea', topic: 'start.steer', statement: 'Quieter, more domestic', decidedBy: 'author' },
    ]);
  });

  it('should write nothing for a steer that is not kept', () => {
    expect(roundLedgerEffects(step, input({ steer: 'Quieter' }), offered)).toEqual([]);
  });

  it('should record an option killed with a reason as a rejected entry naming it', () => {
    const effects = roundLedgerEffects(
      step,
      input({
        feedback: [
          { optionId: 'c2', verdict: 'not', reason: 'Too bleak for this book' },
          { optionId: 'c1', verdict: 'not' },
          { optionId: 'c1', verdict: 'more', reason: 'Yes' },
          { optionId: 'c2', verdict: 'not', reason: 'Said it twice' },
        ],
      }),
      offered,
    );
    expect(effects).toEqual([
      { kind: 'rejected', phase: 'idea', topic: 'start.rejected', statement: 'A storm that never ends', why: 'Too bleak for this book', decidedBy: 'author' },
    ]);
  });
});

describe('resolveNudges', () => {
  it('should keep the step’s own nudges once each and refuse anything else', () => {
    expect(resolveNudges(step, [' Fewer chips ', 'Fewer chips'])).toEqual(['Fewer chips']);
    expect(() => resolveNudges(step, ['Make it a heist'])).toThrow(expect.objectContaining({ code: 'BPR_004' }));
  });

  it('should cap a free nudge’s length where the step offers none', () => {
    const free = { nudges: [] };
    expect(resolveNudges(free, ['Shorter'])).toEqual(['Shorter']);
    expect(() => resolveNudges(free, ['x'.repeat(81)])).toThrow(expect.objectContaining({ code: 'BPR_004' }));
  });
});

describe('renderRoundInput', () => {
  it('should tell a focused pass round which part to rework', () => {
    expect(renderRoundInput(step, input({ focus: 'engine_world' }), [])).toStartWith('Focus: rework only the "engine_world" part');
  });

  it('should name the options feedback points at, the steer and the step’s own input', () => {
    const rendered = renderRoundInput(
      step,
      input({ steer: 'Read it literally', nudges: ['Fewer chips'], feedback: [{ optionId: 'c1', verdict: 'more' }], input: { text: 'A ferry town.', startingType: 'world' } }),
      offered,
    );
    expect(rendered).toContain('Starting from a world.');
    expect(rendered).toContain('A ferry town.');
    expect(rendered).toContain('Steer: Read it literally');
    expect(rendered).toContain('Nudges: Fewer chips');
    expect(rendered).toContain('More like this: A lighthouse keeper who hates the sea');
  });
});

describe('Blueprint context recipe', () => {
  const rounds = [1, 2, 3, 4].map(number =>
    round({
      round: number,
      steer: `steer ${number}`,
      coachMessage: `coach ${number}`,
      options: { understood: [{ id: 'c1', label: `option-from-round-${number}`, kind: 'element' }] },
    }),
  );

  it('should carry the active ledger, only the last four step messages and never an earlier round’s options', () => {
    const ledger = [ledgerEntry({ kind: 'decision', topic: 'premise', statement: 'A keeper must choose between the light and his brother.' })];
    const sections = blueprintSections(ledger, { inputs: [], thread: stepMessages(rounds), roundInput: renderRoundInput(step, input(), []) });
    const rendered = joinSections(sections);

    expect(sections.find(section => section.key === 'ledger')?.required).toBe(true);
    expect(rendered).toContain('A keeper must choose between the light and his brother.');
    expect(rendered).toContain('Author: steer 3');
    expect(rendered).toContain('Coach: coach 4');
    expect(rendered).not.toContain('steer 2');
    expect(rendered).not.toContain('coach 2');
    expect(rendered).not.toContain('option-from-round');
  });

  it('should keep the step’s messages in round order whatever order the rounds arrive in', () => {
    expect(stepMessages([...rounds].reverse()).map(message => message.text)).toEqual(rounds.flatMap(r => [`steer ${r.round}`, `coach ${r.round}`]));
  });

  it('should give a focused pass round only its own screen’s and whole-pass rounds, never a sibling screen’s', () => {
    const passRounds = [
      round({ round: 1, steer: 'whole pass', focus: null }),
      round({ round: 2, steer: 'about the world', focus: 'engine_world' }),
      round({ round: 3, steer: 'about the hero', focus: 'engine_core' }),
    ];

    expect(stepMessages(passRounds, 'engine_core').map(message => message.text)).toEqual(['whole pass', 'about the hero']);
    expect(stepMessages(passRounds).map(message => message.text)).toEqual(['whole pass', 'about the world', 'about the hero']);
  });
});

describe('reconcileLockEntries', () => {
  const plan = (entries: { kind: 'direction' | 'rejected' | 'decision'; statement: string; payload?: unknown }[], replaces?: string[]) => ({
    entries: entries.map(entry => ({ topic: 'start', ...entry })),
    replaces,
  });

  it('should append every entry on a first lock, stamped with the step and its phase', () => {
    const result = reconcileLockEntries(step, plan([{ kind: 'direction', statement: 'A ferry town' }]), []);
    expect(result.supersede).toEqual([]);
    expect(result.withdraw).toEqual([]);
    expect(result.append).toEqual([{ kind: 'direction', topic: 'start', statement: 'A ferry town', phase: 'idea', decidedBy: 'author', stepKey: 'start' }]);
  });

  it('should keep the two halves of one answer on their own history chains', () => {
    const before = [
      ledgerEntry({ id: 10n, kind: 'rejected', statement: 'slow-burn rise', payload: { optionId: 'p1', verdict: 'neither', side: 'a' } }),
      ledgerEntry({ id: 11n, kind: 'rejected', statement: 'early triumph', payload: { optionId: 'p1', verdict: 'neither', side: 'b' } }),
    ];
    const next = plan([
      { kind: 'rejected', statement: 'a slower rise', payload: { optionId: 'p1', verdict: 'neither', side: 'a' } },
      { kind: 'rejected', statement: 'a faster win', payload: { optionId: 'p1', verdict: 'neither', side: 'b' } },
    ]);
    const result = reconcileLockEntries(step, next, before);
    expect(result.supersede.map(pair => [pair.previous.id, pair.next.statement])).toEqual([
      [10n, 'a slower rise'],
      [11n, 'a faster win'],
    ]);
    expect(result.withdraw).toEqual([]);
  });

  it('should let an entry name its own phase', () => {
    const result = reconcileLockEntries(step, { entries: [{ kind: 'decision', topic: 'world.rules', statement: 'Crossings cost memories', phase: 'world' }] }, []);
    expect(result.append[0]?.phase).toBe('world');
  });

  it('should supersede the step’s earlier lock entries and withdraw the leftovers, leaving what the author wrote alone', () => {
    const kept = ledgerEntry({ id: 1n, kind: 'direction' });
    const dropped = ledgerEntry({ id: 2n, kind: 'rejected', statement: 'No sea monsters' });
    const backlog = ledgerEntry({ id: 3n, kind: 'backlog' });
    const authored = ledgerEntry({ id: 4n, kind: 'direction', stepKey: null, statement: 'Keep it under 300 pages' });
    const steering = ledgerEntry({ id: 5n, topic: 'start.steer', stepKey: null });

    const result = reconcileLockEntries(step, plan([{ kind: 'direction', statement: 'A river town' }]), [kept, dropped, backlog, authored, steering]);

    expect(result.supersede.map(pair => [pair.previous.id, pair.next.statement])).toEqual([[1n, 'A river town']]);
    expect(result.append).toEqual([]);
    expect(result.withdraw.map(entry => entry.id)).toEqual([2n]);
  });

  it('should pair a re-locked entry with the one for the same option, then the same statement, then in order', () => {
    const first = ledgerEntry({ id: 1n, statement: 'A ferry town', payload: { optionId: 'c1' } });
    const second = ledgerEntry({ id: 2n, statement: 'Quiet dread', payload: {} });
    const third = ledgerEntry({ id: 3n, statement: 'Found family', payload: {} });

    const result = reconcileLockEntries(
      step,
      plan([
        { kind: 'direction', statement: 'Something new' },
        { kind: 'direction', statement: 'Found family' },
        { kind: 'direction', statement: 'A ferry town at dusk', payload: { optionId: 'c1' } },
      ]),
      [first, second, third],
    );

    expect(result.supersede.map(pair => [pair.next.statement, pair.previous.id])).toEqual([
      ['Something new', 2n],
      ['Found family', 3n],
      ['A ferry town at dusk', 1n],
    ]);
  });

  it('should never pair two entries that answer different offered options', () => {
    const answered = ledgerEntry({ id: 1n, statement: 'A ferry town', payload: { optionId: 'p1' } });
    const result = reconcileLockEntries(step, plan([{ kind: 'direction', statement: 'A river town', payload: { optionId: 'p2' } }]), [answered]);

    expect(result.supersede).toEqual([]);
    expect(result.append.map(entry => entry.statement)).toEqual(['A river town']);
    expect(result.withdraw.map(entry => entry.id)).toEqual([1n]);
  });

  it('should leave an answered option alone when the new lock says nothing about its kind', () => {
    const rejection = ledgerEntry({ id: 1n, kind: 'rejected', statement: 'No sea monsters', payload: { optionId: 'p1' } });
    const result = reconcileLockEntries(step, plan([{ kind: 'direction', statement: 'A river town' }]), [rejection]);

    expect(result.withdraw).toEqual([]);
  });

  it('should retire only the topics a plan says it replaces', () => {
    const other = ledgerEntry({ id: 9n, topic: 'start.extra' });
    const result = reconcileLockEntries({ ...step, completionTopics: ['start', 'start.extra'] }, plan([{ kind: 'direction', statement: 'A ferry town' }], ['start']), [other]);
    expect(result.withdraw).toEqual([]);
  });
});
