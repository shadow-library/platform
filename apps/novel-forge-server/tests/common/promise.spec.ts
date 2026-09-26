import { describe, expect, it } from 'bun:test';

import { mysteryPromiseItem, resolvePromiseDueStanding, threadPromiseItem } from '@server/common';

function payoff(overrides: Partial<{ payoffWindow: number | null; payoffMilestoneKey: string | null; payoffVolumeKey: string | null }> = {}) {
  return { payoffWindow: null, payoffMilestoneKey: null, payoffVolumeKey: null, ...overrides };
}

describe('resolvePromiseDueStanding', () => {
  it('should report not_due when nothing named a payoff has been reached', () => {
    expect(resolvePromiseDueStanding(payoff({ payoffWindow: 10 }), 5)).toBe('not_due');
  });

  it('should report overdue once the authored chapter window has passed', () => {
    expect(resolvePromiseDueStanding(payoff({ payoffWindow: 10 }), 10)).toBe('overdue');
    expect(resolvePromiseDueStanding(payoff({ payoffWindow: 10 }), 11)).toBe('overdue');
  });

  it('should report due once the payoff milestone is reached', () => {
    const milestoneStates = new Map([['mk', 'reached' as const]]);
    expect(resolvePromiseDueStanding(payoff({ payoffMilestoneKey: 'mk' }), 1, milestoneStates)).toBe('due');
  });

  it('should stay not_due while the payoff milestone has not been reached', () => {
    const milestoneStates = new Map([['mk', 'open' as const]]);
    expect(resolvePromiseDueStanding(payoff({ payoffMilestoneKey: 'mk' }), 1, milestoneStates)).toBe('not_due');
  });

  it('should report due while the payoff volume is the one now active', () => {
    const volumeStates = new Map([['vk', 'active' as const]]);
    expect(resolvePromiseDueStanding(payoff({ payoffVolumeKey: 'vk' }), 1, undefined, volumeStates)).toBe('due');
  });

  it('should report overdue once the payoff volume has already met its goal — P4-41b', () => {
    const volumeStates = new Map([['vk', 'goal_met' as const]]);
    expect(resolvePromiseDueStanding(payoff({ payoffVolumeKey: 'vk' }), 1, undefined, volumeStates)).toBe('overdue');
  });

  it('should stay not_due while the payoff volume has not started', () => {
    const volumeStates = new Map([['vk', 'not_started' as const]]);
    expect(resolvePromiseDueStanding(payoff({ payoffVolumeKey: 'vk' }), 1, undefined, volumeStates)).toBe('not_due');
  });
});

function thread(overrides: Record<string, unknown> = {}) {
  return {
    threadKey: 'thread-1',
    summary: 'A thread',
    status: 'open' as const,
    intentionallyOpen: false,
    openedChapter: 1,
    closedChapter: null,
    lastAdvancedChapter: 3,
    payoffWindow: null,
    payoffMilestoneKey: null,
    payoffVolumeKey: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-02'),
    ...overrides,
  };
}

function mystery(overrides: Record<string, unknown> = {}) {
  return {
    mysteryKey: 'mystery-1',
    question: 'Who did it?',
    status: 'open' as const,
    intentionallyOpen: false,
    openedChapter: 1,
    resolvedChapter: null,
    lastAdvancedChapter: 3,
    payoffWindow: null,
    payoffMilestoneKey: null,
    payoffVolumeKey: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-02'),
    ...overrides,
  };
}

describe('threadPromiseItem', () => {
  it('should label with the summary and never carry a mystery-only field', () => {
    const item = threadPromiseItem(thread(), 5);
    expect(item).toMatchObject({ kind: 'thread', key: 'thread-1', label: 'A thread', resolvedChapter: null, closedChapter: null });
  });

  it('should fall back to the thread key when the summary is blank', () => {
    expect(threadPromiseItem(thread({ summary: '  ' }), 5).label).toBe('thread-1');
  });

  it('should carry the closed chapter through', () => {
    expect(threadPromiseItem(thread({ closedChapter: 9 }), 5).closedChapter).toBe(9);
  });
});

describe('mysteryPromiseItem', () => {
  it('should label with the question and never carry a truth fact', () => {
    const item = mysteryPromiseItem(mystery(), 5);
    expect(item).toMatchObject({ kind: 'mystery', key: 'mystery-1', label: 'Who did it?', closedChapter: null });
    expect(item).not.toHaveProperty('truthFactKey');
  });

  it('should carry the resolved chapter through', () => {
    expect(mysteryPromiseItem(mystery({ resolvedChapter: 12 }), 20).resolvedChapter).toBe(12);
  });

  it('should compute overdue for a mystery past its chapter window', () => {
    expect(mysteryPromiseItem(mystery({ payoffWindow: 5 }), 10).due).toBe('overdue');
  });
});
