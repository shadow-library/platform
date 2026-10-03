import { describe, expect, it } from 'bun:test';

import { pendingItems, type PendingItemsInput, pendingKey, type PendingProposal, pendingTray } from '../src/lib/pending-items';

const SESSION = 'session-a';

function proposal(id: string, overrides: Partial<PendingProposal> = {}): PendingProposal {
  return { id, sessionId: null, kind: 'bible_audit', status: 'pending', summary: null, scopeRef: null, changeSet: [], createdAt: '2026-10-01T10:00:00Z', ...overrides };
}

function review(id: string, chapter: number, open = 1, status: 'preparing' | 'ready' | 'failed' = 'ready') {
  return { id, chapter, status, open: { consequential: open, routine: 0 } };
}

function input(overrides: Partial<PendingItemsInput> = {}): PendingItemsInput {
  return { sessionId: SESSION, drafts: [], decisions: [], settling: [], continuity: [], proposals: [], shownProposals: new Set(), ...overrides };
}

describe('pendingItems', () => {
  it('should order drafts, then decisions, then continuity, then cards oldest first, each kind by chapter', () => {
    const items = pendingItems(
      input({
        drafts: [
          { chapter: 4, title: 'Tide', reviewStatus: 'needs_review' },
          { chapter: 2, title: null, reviewStatus: 'contradiction' },
        ],
        decisions: [review('r5', 5), review('r3', 3)],
        continuity: [
          { id: 'c7', chapter: 7, status: 'pending' },
          { id: 'c1', chapter: 1, status: 'pending' },
        ],
        proposals: [proposal('p2', { createdAt: '2026-10-02T10:00:00Z' }), proposal('p1', { createdAt: '2026-09-30T10:00:00Z' })],
      }),
    );

    expect(items.map(item => item.key)).toEqual(['draft:2', 'draft:4', 'decisions:r3', 'decisions:r5', 'continuity:c1', 'continuity:c7', 'proposal:p1', 'proposal:p2']);
  });

  it('should keep only what waits on the author', () => {
    const items = pendingItems(
      input({
        drafts: [
          { chapter: 1, title: 'Done', reviewStatus: 'approved' },
          { chapter: 2, title: 'Writing', reviewStatus: 'generating' },
        ],
        decisions: [review('reading', 3, 0, 'preparing'), review('settling', 4, 0), review('answered', 5, 0), review('failed', 6, 0, 'failed')],
        settling: ['settling'],
        continuity: [{ id: 'c1', chapter: 1, status: 'applied' }],
        proposals: [proposal('applied', { status: 'applied' })],
      }),
    );

    expect(items.map(item => item.key)).toEqual(['decisions:answered', 'decisions:failed']);
  });

  it('should list a card once, however many times the list carries it', () => {
    const items = pendingItems(input({ proposals: [proposal('p1'), proposal('p1')], drafts: [{ chapter: 2, title: 'A', reviewStatus: 'needs_review' }] }));

    expect(items.map(item => item.key)).toEqual(['draft:2', 'proposal:p1']);
  });

  it('should show what the thread already holds and bring in only the cards it does not', () => {
    const items = pendingItems(
      input({
        drafts: [{ chapter: 3, title: 'Bout', reviewStatus: 'needs_review' }],
        proposals: [
          proposal('mine', { kind: 'chat', sessionId: SESSION }),
          proposal('refresh', { createdAt: '2026-10-01T11:00:00Z' }),
          proposal('theirs', { kind: 'chat', sessionId: 'session-b', createdAt: '2026-10-01T12:00:00Z' }),
          proposal('audit', { createdAt: '2026-10-01T13:00:00Z' }),
        ],
        shownProposals: new Set(['refresh']),
      }),
    );

    expect(items.map(item => [item.key, item.inThread, item.source, item.proposalId])).toEqual([
      ['draft:3', true, 'ready to read', undefined],
      ['proposal:mine', true, 'this chat', undefined],
      ['proposal:refresh', true, 'this chat', undefined],
      ['proposal:theirs', false, 'another chat', 'theirs'],
      ['proposal:audit', false, 'Story Bible · audit', 'audit'],
    ]);
  });

  it('should bring every card in while there is no chat yet', () => {
    const [item] = pendingItems(input({ sessionId: undefined, proposals: [proposal('p1', { kind: 'organise' })] }));

    expect(item).toMatchObject({ inThread: false, proposalId: 'p1', chip: { label: 'notes' }, source: 'organised notes' });
  });

  it('should title a card by its summary’s first line, a plan by its chapter, and anything else by its size', () => {
    const items = pendingItems(
      input({
        proposals: [
          proposal('summary', { summary: '  Chapter 4: two stale pages\nmore detail' }),
          proposal('plan', { kind: 'chapter_plan', changeSet: [{ op: 'brief.update', chapter: 6 }] as PendingProposal['changeSet'], createdAt: '2026-10-01T11:00:00Z' }),
          proposal('bare', { kind: 'premise_enhance', changeSet: [{ op: 'project.update' }] as PendingProposal['changeSet'], createdAt: '2026-10-01T12:00:00Z' }),
        ],
      }),
    );

    expect(items.map(item => item.title)).toEqual(['Chapter 4: two stale pages', 'Chapter 6 plan', '1 change']);
  });

  it('should name a plugin’s card by the plugin’s title, and by its id when the title is unknown', () => {
    const plugin = proposal('p1', { kind: 'plugin', scopeRef: 'tide-tables' });

    expect(pendingItems(input({ proposals: [plugin], pluginTitles: new Map([['tide-tables', 'Tide tables']]) }))[0]?.source).toBe('Tide tables');
    expect(pendingItems(input({ proposals: [plugin] }))[0]).toMatchObject({ source: 'tide-tables', chip: { label: 'plugin', intent: 'accent' } });
  });

  it('should flag a draft that conflicts with canon and a review whose reading failed', () => {
    const [draft, decisions] = pendingItems(input({ drafts: [{ chapter: 2, title: 'Salt', reviewStatus: 'contradiction' }], decisions: [review('r', 3, 0, 'failed')] }));

    expect(draft).toMatchObject({ title: 'Chapter 2: Salt', chip: { label: 'draft', intent: 'danger' }, source: 'conflicts with canon' });
    expect(decisions).toMatchObject({ title: 'Chapter 3: reading its Story Bible updates failed', chip: { intent: 'danger' } });
  });

  it('should count a review’s open decisions in its title', () => {
    const [asking, answered] = pendingItems(input({ decisions: [review('r2', 2, 2), review('r4', 4, 0)] }));

    expect(asking?.title).toBe('Chapter 2: 2 decisions');
    expect(answered?.title).toBe('Chapter 4: ready to finalize');
  });
});

describe('pendingTray', () => {
  it('should count every item, the ones outside the thread, and name them in order', () => {
    const items = pendingItems(
      input({
        drafts: [{ chapter: 3, title: 'Bout', reviewStatus: 'needs_review' }],
        continuity: [{ id: 'c2', chapter: 2, status: 'pending' }],
        proposals: [proposal('audit')],
      }),
    );

    expect(pendingTray(items)).toEqual({ count: 3, elsewhere: 1, names: 'chapter 3 draft · chapter 2 continuity · Story Bible audit' });
  });

  it('should be empty when nothing waits', () => {
    expect(pendingTray([])).toEqual({ count: 0, elsewhere: 0, names: '' });
  });
});

describe('pendingKey', () => {
  it('should mark a card by its kind and id', () => {
    expect(pendingKey('draft', 3)).toBe('draft:3');
    expect(pendingKey('proposal', '42')).toBe('proposal:42');
  });
});
