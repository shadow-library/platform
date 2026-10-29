import { describe, expect, it } from 'bun:test';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { CardsSummary } from '../src/features/chat/ProgressPanel';
import { filterShows, type ItemAnswer } from '../src/features/chat/review-answers';
import { type ReviewItem, reviewItems } from '../src/features/chat/review-dialog-view';
import {
  ReviewContentView,
  ReviewDone,
  ReviewFooter,
  type ReviewFooterProps,
  ReviewList,
  type ReviewListProps,
  ReviewReader,
  type ReviewReaderProps,
} from '../src/features/chat/ReviewDialog';
import { TurnReceiptView } from '../src/features/chat/TurnReceipt';
import { WaitingTray } from '../src/features/chat/WaitingTray';
import { type ProposalResponse } from '../src/lib/apis/api-types.gen';

type Op = ProposalResponse['changeSet'][number];

const noop = (): void => undefined;
const html = (element: ReactElement): string => renderToStaticMarkup(element);

const PAGE: Op = { op: 'bible_document.upsert', section: 'world', slug: 'pier', body: 'The tide takes the pier.' };
const WHOLE: Op = { ...PAGE, body: 'The tide takes the pier.\n\nGulls circle the wreck.' };
const TAMSIN: Op = { op: 'entity.upsert', type: 'character', entityKey: 'tamsin', name: 'Tamsin', body: 'Keeps the lamps.', quote: 'she keeps the lamps' };
const THREAD: Op = { op: 'promise.create', key: 'who-lit', label: 'Who lit the first lamp?' };
const ITEMS = reviewItems({ proposal: { id: 'p1', kind: 'organise', changeSet: [PAGE, TAMSIN, WHOLE, THREAD] }, current: [] });
const [PAIR, PERSON, QUESTION] = ITEMS as [ReviewItem, ReviewItem, ReviewItem];

const OPEN: ItemAnswer = { status: 'open', askScope: [] };

function list(overrides: Partial<ReviewListProps> = {}): string {
  const answers = new Map<string, ItemAnswer>([[PERSON.key, { status: 'add', askScope: [] }]]);
  const filter = overrides.filter ?? 'all';
  const shown = (item: ReviewItem): boolean => filterShows(filter, item, answers.get(item.key)?.status !== 'add');
  return html(createElement(ReviewList, { items: ITEMS, answers, currentKey: PAIR.key, filter, shown, onFilter: noop, onSelect: noop, ...overrides }));
}

function reader(overrides: Partial<ReviewReaderProps> = {}): string {
  return html(createElement(ReviewReader, { item: PAIR, position: 1, total: 3, version: 'notes', versionLocked: false, onVersion: noop, wordsLabel: 'Your notes', ...overrides }));
}

function footer(overrides: Partial<ReviewFooterProps> = {}): string {
  return html(
    createElement(ReviewFooter, {
      item: PERSON,
      answer: OPEN,
      pending: true,
      committing: false,
      remembering: false,
      onMove: noop,
      onDecide: noop,
      onClear: noop,
      onScope: noop,
      ...overrides,
    }),
  );
}

describe('ReviewList', () => {
  it('should list changes by group with answered counts, glyph states and hints', () => {
    const out = list();
    expect(out).toContain('aria-label="All changes"');
    expect(out).toContain('All 3');
    expect(out).toContain('Waiting 2');
    expect(out).toContain('Pages');
    expect(out).toContain('Characters &amp; factions');
    expect(out).toContain('1/1');
    expect(out).toContain('2 versions');
    expect(out).toContain(', will be added');
    expect(out.match(/aria-current="true"/g)).toHaveLength(1);
  });

  it('should filter to waiting changes and say when none is left', () => {
    expect(list({ filter: 'waiting' })).not.toContain('Tamsin');
    expect(list({ filter: 'waiting', items: [PERSON] })).toContain('Nothing waiting.');
  });
});

describe('ReviewReader', () => {
  it('should show the eyebrow, title, position and the version switch of a page offered twice', () => {
    const out = reader();
    expect(out).toContain('Pages · ');
    expect(out).toContain('1 of 3');
    expect(out).toContain('tabindex="-1"');
    expect(out).toContain('Only my notes');
    expect(out).toContain('With Forge’s additions · 1 addition');
    expect(out).not.toContain('Forge’s addition</span>');
  });

  it('should mark Forge’s added paragraphs in its version', () => {
    expect(reader({ version: 'forge' })).toContain('Forge’s addition</span>');
  });

  it('should hide what the author wrote behind a toggle', () => {
    const out = reader({ item: { ...PERSON, yourWords: 'she keeps the lamps' }, wordsLabel: 'Your message' });
    expect(out).toContain('aria-expanded="false"');
    expect(out).toContain('Show what you wrote');
    expect(out).toMatch(/hidden=""[^>]*>.*Your message/);
  });

  it('should show a skeleton while the Story Bible is compared, and note an update that changes nothing', () => {
    const waiting = reader({ item: { ...PERSON, awaitsCurrent: true } });
    expect(waiting).toContain('Comparing with your Story Bible');
    expect(waiting).not.toContain('Who they are');
    expect(reader({ item: { ...PERSON, unchanged: true } })).toContain('No change from your Story Bible now');
  });
});

describe('ReviewContentView', () => {
  it('should lay out fields with an emphasised open question', () => {
    expect(html(createElement(ReviewContentView, { content: PERSON.content }))).toContain('Who they are');
    expect(html(createElement(ReviewContentView, { content: QUESTION.content }))).toMatch(/data-emphasis="">Who lit the first lamp\?/);
  });

  it('should mark removed and added words against the Story Bible now', () => {
    const out = html(
      createElement(ReviewContentView, {
        content: {
          kind: 'diff',
          fields: [
            {
              label: 'Who they are',
              segments: [
                { kind: 'same', text: 'Keeps ' },
                { kind: 'removed', text: 'lamps' },
                { kind: 'added', text: 'the light' },
              ],
            },
          ],
        },
      }),
    );
    expect(out).toContain('Compared with your Story Bible now');
    expect(out).toContain('Keeps <del>lamps</del><ins>the light</ins>');
  });
});

describe('ReviewFooter', () => {
  it('should offer Don’t add then Add with their keys while a change waits, and name the next one', () => {
    const out = footer({ next: 'Who lit the first lamp?' });
    expect(out).toContain('aria-label="Previous change"');
    expect(out).toContain('aria-label="Next change"');
    expect(out).toContain('Next: Who lit the first lamp?');
    expect(out.indexOf('Don’t add')).toBeLessThan(out.indexOf('>Add<'));
    expect(out).toContain('aria-keyshortcuts="a"');
    expect(out).toContain('aria-keyshortcuts="d"');
  });

  it('should disable the answers while the card commits', () => {
    expect(footer({ committing: true }).match(/disabled=""/g)).toHaveLength(2);
  });

  it('should show the answer with a way to change it', () => {
    const out = footer({ answer: { status: 'add', askScope: [] }, next: 'Elsewhere' });
    expect(out).toContain('Change answer');
    expect(out).toContain('Will be added');
    expect(out).not.toContain('Next:');
  });

  it('should ask when to suggest a declined change again, with keys 1 to 3', () => {
    const out = footer({ answer: { status: 'decline', scopeIndex: 1, askScope: ['never', 'not_now', 'not_this_version'] } });
    expect(out).toMatch(/tabindex="-1" data-scope-ask="">Not added. Suggest it again\?/);
    expect(out).toContain('Not for this version');
    expect(out).toContain('aria-keyshortcuts="3"');
    expect(footer({ answer: { status: 'decline', scopeIndex: 1, askScope: ['never'] }, remembering: true })).toMatch(/disabled=""[^>]*><span[^>]*>Never/);
  });

  it('should read the recorded scope, and only statuses once saved', () => {
    expect(footer({ answer: { status: 'decline', scopeIndex: 1, askScope: [], scope: 'not_now' } })).toContain('Not added · won’t be suggested again for now');
    const saved = footer({ pending: false, answer: { status: 'added', askScope: [] } });
    expect(saved).toContain('Added');
    expect(saved).not.toContain('Change answer');
    expect(footer({ pending: false, answer: { status: 'declined', askScope: [] } })).toContain('Not added');
  });
});

describe('ReviewDone', () => {
  it('should sum up and offer the way back to the chat, with a commit still owed', () => {
    const out = html(
      createElement(ReviewDone, {
        view: { title: 'Couldn’t finish', detail: 'Offline.', commit: { label: 'Add 2 now', force: false } },
        committing: false,
        onCommit: noop,
        onClose: noop,
      }),
    );
    expect(out).toContain('Couldn’t finish');
    expect(out).toContain('Add 2 now');
    expect(out).toContain('Back to chat');
  });
});

describe('review entry points', () => {
  it('should open the review from a receipt with “Review changes”, and keep “Review in panel” otherwise', () => {
    const view = { kind: 'cards', tone: 'waiting', count: 2, title: '2 changes waiting for you', detail: '', canAddAll: true } as const;
    expect(html(createElement(TurnReceiptView, { view, onReview: noop, reviewLabel: 'Review changes' }))).toContain('Review changes');
    expect(html(createElement(TurnReceiptView, { view, onReview: noop }))).toContain('Review in panel');
  });

  it('should collapse a waiting card in the panel to one summary row', () => {
    expect(html(createElement(CardsSummary, { waiting: 3, onReview: noop }))).toContain('3 changes waiting for you');
    expect(html(createElement(CardsSummary, { waiting: 1, onReview: noop }))).toContain('1 change waiting for you');
    expect(html(createElement(CardsSummary, { waiting: 0, onReview: noop }))).toContain('All changes answered');
  });

  it('should offer Review in the tray for a card the dialog answers, and Show for the rest', () => {
    const item = (key: string, title: string) => ({
      key,
      kind: 'proposal' as const,
      chip: { label: 'notes', intent: 'info' as const },
      title,
      short: title,
      source: 'this chat',
      inThread: true,
    });
    const out = html(
      createElement(WaitingTray, {
        items: [item('proposal:p1', 'Organised notes'), item('proposal:p2', 'Plan')],
        tray: { count: 2, elsewhere: 1, names: '' },
        canAdopt: true,
        onShow: noop,
        onAdopt: noop,
        reviewProposalIds: new Map([['proposal:p1', 'p1']]),
        onReview: noop,
      }),
    );
    expect(out).toContain('aria-label="Review Organised notes"');
    expect(out).toContain('aria-label="Show Plan"');
  });
});
