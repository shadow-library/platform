import { describe, expect, it } from 'bun:test';

import { groupByRecency, LIFECYCLE_PHASES, lifecyclePhase, projectDotColor, projectKindIntent, projectKindLabel, projectKindTag, sharedOwnerLabel } from '../src/lib/format';

describe('projectKindLabel', () => {
  it('should label the original-novel project kind', () => {
    expect(projectKindLabel('new_novel')).toBe('Original novel');
  });
});

describe('projectKindTag', () => {
  it('should tag the original-novel project kind', () => {
    expect(projectKindTag('new_novel')).toBe('new-novel');
  });
});

describe('projectKindIntent', () => {
  it('should map the only project kind to the accent chip intent', () => {
    expect(projectKindIntent('new_novel')).toBe('accent');
  });
});

describe('projectDotColor', () => {
  it('should give the original-novel project kind its dot colour', () => {
    expect(projectDotColor({ kind: 'new_novel' })).toBe('var(--sh-green-400)');
  });
});

describe('sharedOwnerLabel', () => {
  it('should mark a bot-owned shared project by ownership and org, not just sharing', () => {
    expect(sharedOwnerLabel({ ownerKind: 'bot', sharedWithOrg: true })).toBe('Bot-owned · shared with your organisation');
  });

  it('should mark a user-owned shared project without claiming a bot owns it', () => {
    expect(sharedOwnerLabel({ ownerKind: 'user', sharedWithOrg: true })).toBe('Shared with your organisation');
  });

  it('should return null for a project the caller was not shown as shared', () => {
    expect(sharedOwnerLabel({ ownerKind: 'bot', sharedWithOrg: false })).toBeNull();
    expect(sharedOwnerLabel({ ownerKind: 'user', sharedWithOrg: false })).toBeNull();
  });
});

describe('lifecyclePhase', () => {
  it('should default to the new_novel phases when status is unknown', () => {
    expect(lifecyclePhase(undefined)).toEqual({ completed: 0, total: 5, label: 'Bible' });
  });

  it('should walk the authoring phases forward as status fields complete', () => {
    const kind = 'new_novel' as const;
    expect(lifecyclePhase({ kind })).toEqual({ completed: 1, total: 5, label: 'Plan' });
    expect(lifecyclePhase({ kind, volumesTotal: 3 })).toEqual({ completed: 2, total: 5, label: 'Arcs' });
    expect(lifecyclePhase({ kind, volumesTotal: 3, planApproved: true })).toEqual({ completed: 3, total: 5, label: 'Drafts' });
    expect(lifecyclePhase({ kind, volumesTotal: 3, planApproved: true, draftsTotal: 10 })).toEqual({ completed: 4, total: 5, label: 'Review' });
    expect(lifecyclePhase({ kind, volumesTotal: 3, planApproved: true, draftsTotal: 10, draftsFinal: 10 })).toEqual({ completed: 5, total: 5, label: 'Review' });
  });

  it('should expose only the new_novel workflow', () => {
    expect(LIFECYCLE_PHASES.new_novel).toEqual(['Bible', 'Plan', 'Arcs', 'Drafts', 'Review']);
  });
});

describe('groupByRecency', () => {
  // Built from the local-timezone constructor and round-tripped through ISO, so the day-boundary math
  // (which reads local calendar components back off the parsed instant) is exercised the same way on
  // any machine's timezone rather than hard-coding one.
  const local = (y: number, m: number, d: number, h = 12): string => new Date(y, m, d, h).toISOString();
  const now = new Date(2026, 8, 19, 15);

  it('should bucket today, yesterday, and the 7/30-day windows', () => {
    const items = [
      { id: 'today', at: local(2026, 8, 19, 9) },
      { id: 'yesterday', at: local(2026, 8, 18) },
      { id: 'four-days', at: local(2026, 8, 15) },
      { id: 'twenty-days', at: local(2026, 7, 30) },
    ];
    const groups = groupByRecency(items, i => i.at, now);
    expect(groups.map(g => g.label)).toEqual(['Today', 'Yesterday', 'Previous 7 days', 'Previous 30 days']);
    expect(groups.map(g => g.items.map(i => i.id))).toEqual([['today'], ['yesterday'], ['four-days'], ['twenty-days']]);
  });

  it('should group anything older than 30 days by month, naming the year once it is not the current one', () => {
    const items = [
      { id: 'this-year', at: local(2026, 7, 5) },
      { id: 'last-year', at: local(2025, 7, 5) },
    ];
    const groups = groupByRecency(items, i => i.at, now);
    expect(groups.map(g => g.label)).toEqual(['August', 'August 2025']);
  });

  it('should render no empty bucket', () => {
    const groups = groupByRecency([{ id: 'today', at: local(2026, 8, 19, 9) }], i => i.at, now);
    expect(groups).toHaveLength(1);
  });

  it('should treat a calendar day boundary, not a fixed 24-hour window, as the yesterday cutoff', () => {
    const items = [{ id: 'early-today', at: local(2026, 8, 19, 0) }];
    expect(groupByRecency(items, i => i.at, now).map(g => g.label)).toEqual(['Today']);
  });

  it('should treat a clock-skewed future timestamp as today rather than inventing a future bucket', () => {
    const items = [{ id: 'future', at: local(2026, 8, 19, 23) }];
    expect(groupByRecency(items, i => i.at, new Date(2026, 8, 19, 1)).map(g => g.label)).toEqual(['Today']);
  });

  it('should sort by the recency accessor before bucketing, even when the input arrives in a different order', () => {
    const items = [
      { id: 'older', at: local(2026, 8, 10) },
      { id: 'newer', at: local(2026, 8, 19, 9) },
    ];
    const groups = groupByRecency(items, i => i.at, now);
    expect(groups.map(g => g.items.map(i => i.id))).toEqual([['newer'], ['older']]);
  });
});
