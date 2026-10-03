import { describe, expect, it } from 'bun:test';

import {
  CHAPTER_PANEL_MIN,
  CHAPTER_PANEL_STEP,
  CHAPTER_PANEL_WIDTH,
  chapterPanelEdit,
  chapterPanelStatus,
  chapterParam,
  CHAT_BESIDE_PANEL_MIN,
  clampPanelWidth,
  draftCardShape,
  leavesChapter,
  opensInEditor,
  panelApproval,
  panelWidthBounds,
  panelWidthForKey,
  storedPanelWidth,
} from '../src/lib/chapter-panel';

type Draft = Parameters<typeof chapterPanelStatus>[0];

const draft = (overrides: Partial<Draft> = {}): Draft => ({ status: 'draft', reviewStatus: 'needs_review', body: 'She ran.', staleReason: null, ...overrides });

describe('chapterParam', () => {
  it('should read a hand-typed number and a navigated string alike', () => {
    expect(chapterParam(3)).toBe(3);
    expect(chapterParam('12')).toBe(12);
  });

  it('should open nothing for anything but a positive whole number', () => {
    for (const value of [0, '0', -1, '-1', 1.5, '1.5', 'abc', '', ' 3', undefined, null, {}, [3], Number.NaN, '9007199254740993']) expect(chapterParam(value)).toBeUndefined();
  });
});

describe('clampPanelWidth', () => {
  it('should keep the width the author chose while the chat keeps its 420', () => {
    expect(clampPanelWidth(640, 1400)).toBe(640);
    expect(clampPanelWidth(900, 1400)).toBe(900);
  });

  it('should give way to the chat on a narrower frame', () => {
    expect(clampPanelWidth(640, 900)).toBe(900 - CHAT_BESIDE_PANEL_MIN);
  });

  it('should never go below the panel minimum, even where the chat cannot keep its own', () => {
    expect(clampPanelWidth(100, 1400)).toBe(CHAPTER_PANEL_MIN);
    expect(clampPanelWidth(640, 600)).toBe(CHAPTER_PANEL_MIN);
  });

  it('should fall back to the default for a width that is not a number', () => {
    expect(clampPanelWidth(Number.NaN, 1400)).toBe(CHAPTER_PANEL_WIDTH);
    expect(clampPanelWidth(Number.NaN, 900)).toBe(900 - CHAT_BESIDE_PANEL_MIN);
  });

  it('should round a dragged width to whole pixels', () => {
    expect(clampPanelWidth(640.6, 1400)).toBe(641);
  });
});

describe('panelWidthForKey', () => {
  const bounds = panelWidthBounds(1400);

  it('should widen the panel as the divider moves left and narrow it as it moves right', () => {
    expect(panelWidthForKey('ArrowLeft', 640, bounds)).toBe(640 + CHAPTER_PANEL_STEP);
    expect(panelWidthForKey('ArrowUp', 640, bounds)).toBe(640 + CHAPTER_PANEL_STEP);
    expect(panelWidthForKey('ArrowRight', 640, bounds)).toBe(640 - CHAPTER_PANEL_STEP);
    expect(panelWidthForKey('ArrowDown', 640, bounds)).toBe(640 - CHAPTER_PANEL_STEP);
  });

  it('should jump to the ends on Home and End and stop at them', () => {
    expect(panelWidthForKey('Home', 640, bounds)).toBe(CHAPTER_PANEL_MIN);
    expect(panelWidthForKey('End', 640, bounds)).toBe(1400 - CHAT_BESIDE_PANEL_MIN);
    expect(panelWidthForKey('ArrowRight', CHAPTER_PANEL_MIN, bounds)).toBe(CHAPTER_PANEL_MIN);
    expect(panelWidthForKey('ArrowLeft', bounds.max, bounds)).toBe(bounds.max);
  });

  it('should leave every other key to the page', () => {
    expect(panelWidthForKey('Enter', 640, bounds)).toBeUndefined();
    expect(panelWidthForKey('a', 640, bounds)).toBeUndefined();
  });
});

describe('storedPanelWidth', () => {
  it('should read back a width this browser stored', () => {
    expect(storedPanelWidth('720')).toBe(720);
  });

  it('should start from the default when nothing usable was stored', () => {
    for (const raw of [null, undefined, '', 'wide', '12', 'Infinity']) expect(storedPanelWidth(raw)).toBe(CHAPTER_PANEL_WIDTH);
  });
});

describe('draftCardShape', () => {
  it('should shrink the card to a pointer only while the panel shows its chapter', () => {
    expect(draftCardShape(4, 4)).toBe('pointer');
    expect(draftCardShape(4, 5)).toBe('card');
    expect(draftCardShape(4, undefined)).toBe('card');
  });
});

describe('leavesChapter', () => {
  const at = (search: unknown, pathname = '/novels/n1/chat'): { pathname: string; search: unknown } => ({ pathname, search });

  it('should hold on to the chapter through a navigation that keeps it, such as a revealed card clearing ?card', () => {
    expect(leavesChapter(at({ session: 's1', chapter: 4, card: '9' }), at({ session: 's1', chapter: 4 }))).toBe(false);
    expect(leavesChapter(at({ chapter: 4 }), at({ chapter: '4' }))).toBe(false);
  });

  it('should count closing the panel, opening another chapter, switching chats and leaving the page as leaving', () => {
    expect(leavesChapter(at({ chapter: 4 }), at({}))).toBe(true);
    expect(leavesChapter(at({ chapter: 4 }), at({ chapter: 5 }))).toBe(true);
    expect(leavesChapter(at({ session: 's1', chapter: 4 }), at({ session: 's2' }))).toBe(true);
    expect(leavesChapter(at({ chapter: 4 }), at({ chapter: 4 }, '/novels/n1/chapters'))).toBe(true);
  });
});

describe('chapterPanelStatus', () => {
  it('should name what the chapter waits on', () => {
    expect(chapterPanelStatus(draft(), false, false)).toEqual({ label: 'ready for you', intent: 'warning' });
    expect(chapterPanelStatus(draft({ reviewStatus: 'contradiction' }), false, false)).toEqual({ label: 'conflicts with canon', intent: 'danger' });
    expect(chapterPanelStatus(draft({ reviewStatus: 'approved' }), false, false)).toEqual({ label: 'approved', intent: 'success' });
    expect(chapterPanelStatus(draft({ staleReason: 'Chapter 2 changed' }), false, false)).toEqual({ label: 'out of date', intent: 'warning' });
  });

  it('should say the chapter is being written before anything else, and final before editing', () => {
    expect(chapterPanelStatus(draft({ reviewStatus: 'generating' }), false, true).label).toBe('being written');
    expect(chapterPanelStatus(draft(), true, true).label).toBe('being written');
    expect(chapterPanelStatus(draft({ status: 'final', reviewStatus: 'final' }), false, true).label).toBe('final');
    expect(chapterPanelStatus(draft({ reviewStatus: 'contradiction' }), false, true).label).toBe('editing');
  });
});

describe('chapterPanelEdit', () => {
  it('should let the author edit a draft that is not final and not being written', () => {
    expect(chapterPanelEdit(draft(), false)).toEqual({ allowed: true });
    expect(chapterPanelEdit(draft({ reviewStatus: 'approved' }), false)).toEqual({ allowed: true });
  });

  it('should say why a final or a being-written chapter opens read-only', () => {
    expect(chapterPanelEdit(draft({ status: 'final', reviewStatus: 'final' }), false)).toMatchObject({ allowed: false, reason: expect.stringContaining('Amend') });
    expect(chapterPanelEdit(draft({ reviewStatus: 'generating' }), false)).toMatchObject({ allowed: false, reason: expect.stringContaining('being written') });
    expect(chapterPanelEdit(draft(), true)).toMatchObject({ allowed: false });
  });
});

describe('opensInEditor', () => {
  it('should open in the editor when asked, or when there is no prose to read', () => {
    expect(opensInEditor(draft(), false, true)).toBe(true);
    expect(opensInEditor(draft({ body: '  \n' }), false, false)).toBe(true);
    expect(opensInEditor(draft({ body: null }), false, false)).toBe(true);
    expect(opensInEditor(draft(), false, false)).toBe(false);
  });

  it('should open a final or a being-written chapter for reading whatever was asked', () => {
    expect(opensInEditor(draft({ status: 'final', reviewStatus: 'final', body: '' }), false, true)).toBe(false);
    expect(opensInEditor(draft({ body: '' }), true, true)).toBe(false);
  });
});

describe('panelApproval', () => {
  const ready = { writing: false };

  it('should offer Approve on a draft waiting for the author', () => {
    expect(panelApproval(draft(), ready)).toEqual({ kind: 'ready' });
  });

  it('should hide Approve on a final or an approved chapter', () => {
    expect(panelApproval(draft({ status: 'final', reviewStatus: 'final' }), ready)).toEqual({ kind: 'hidden' });
    expect(panelApproval(draft({ reviewStatus: 'approved' }), ready)).toEqual({ kind: 'hidden' });
  });

  it('should hold Approve while the chapter is written, while the author’s edits are not saved, and on the card’s own refusal', () => {
    expect(panelApproval(draft({ reviewStatus: 'generating' }), ready)).toMatchObject({ kind: 'blocked' });
    expect(panelApproval(draft(), { writing: false, pendingEdits: 'Your edits aren’t saved yet' })).toEqual({ kind: 'blocked', reason: 'Your edits aren’t saved yet' });
    expect(panelApproval(draft({ reviewStatus: 'contradiction' }), { writing: false, refusal: 'Run the AI review first' })).toEqual({
      kind: 'blocked',
      reason: 'Run the AI review first',
    });
  });
});
