import { describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';

import { type PassageSuggestionResponse } from '../src/lib/apis';
import { ApiError } from '../src/lib/apis/transport';
import {
  appliedMessage,
  editorSelection,
  MAX_PASSAGE_CHARS,
  passageHash,
  selectionOf,
  selectionProblem,
  splitAtAnchors,
  suggestionView,
  writeRefusalMessage,
} from '../src/lib/passage-suggestions';

const BODY = 'Hollis kept the ledger in a tin box.\n\nThe pages inside were *swollen* with damp.\n\nNothing. No tick.';

type Suggestion = Pick<PassageSuggestionResponse, 'baseRevision' | 'leakLines' | 'location'>;

const FRESH: Suggestion = { baseRevision: 3, leakLines: [], location: { freshness: 'fresh', start: 38, end: 80 } };
const DRAFT = { status: 'draft' as const, reviewStatus: 'needs_review' as const, approvedRevision: null };

describe('passageHash', () => {
  it('should hash the UTF-8 bytes as lowercase hex, matching the server', async () => {
    expect(await passageHash('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    const text = '“Low Harrow paid” — é 🌊';
    expect(await passageHash(text)).toBe(createHash('sha256').update(text, 'utf8').digest('hex'));
  });
});

describe('selectionOf', () => {
  it('should anchor on UTF-16 offsets with the end exclusive, so the slice is the passage', () => {
    const body = 'Sea 🌊 wall';
    const result = selectionOf(body, 4, 6);
    expect(result).toEqual({ kind: 'ok', selection: { start: 4, end: 6, text: '🌊' } });
  });

  it('should drop surrounding whitespace and accept a backwards drag', () => {
    expect(selectionOf(BODY, 38, 35)).toEqual({ kind: 'ok', selection: { start: 35, end: 36, text: '.' } });
    expect(selectionOf('  word  ', 0, 8)).toEqual({ kind: 'ok', selection: { start: 2, end: 6, text: 'word' } });
  });

  it('should refuse an empty or over-long selection', () => {
    expect(selectionOf(BODY, 36, 38)).toEqual({ kind: 'empty' });
    expect(selectionOf('x'.repeat(MAX_PASSAGE_CHARS + 1), 0, MAX_PASSAGE_CHARS + 1)).toEqual({ kind: 'too-long' });
  });
});

describe('editorSelection', () => {
  it('should take the textarea offsets when its value is the saved body', () => {
    expect(editorSelection('One two.', 'One two.', 4, 7)).toEqual({ kind: 'ok', selection: { start: 4, end: 7, text: 'two' } });
  });

  it('should refuse when the textarea normalised CRLF line endings, so its offsets no longer index the body', () => {
    expect(editorSelection('One\r\ntwo.', 'One\ntwo.', 4, 7)).toEqual({ kind: 'line-endings' });
  });

  it('should refuse when the textarea holds unsaved text', () => {
    expect(editorSelection('One two.', 'One two!', 4, 7)).toEqual({ kind: 'unsaved' });
  });
});

describe('selectionProblem', () => {
  it('should explain every refusal except an empty selection', () => {
    expect(selectionProblem({ kind: 'empty' })).toBeUndefined();
    expect(selectionProblem({ kind: 'unmapped' })).toContain('Edit prose');
    expect(selectionProblem({ kind: 'cuts-markup' })).toContain('cuts through a link');
    expect(selectionProblem({ kind: 'line-endings' })).toContain('line endings');
    expect(selectionProblem({ kind: 'unsaved' })).toContain('save them');
    expect(selectionProblem({ kind: 'too-long' })).toContain('6,000');
  });
});

describe('suggestionView', () => {
  it('should allow using a fresh suggestion where it was asked', () => {
    expect(suggestionView(FRESH, DRAFT)).toEqual({ state: 'fresh', canApply: true, label: undefined, warnings: [], anchorEnd: 80 });
  });

  it('should label a relocated suggestion and still allow it', () => {
    const view = suggestionView({ ...FRESH, location: { freshness: 'relocated', start: 50, end: 92 } }, DRAFT);
    expect(view.canApply).toBe(true);
    expect(view.label).toBe('The passage moved since — it changes where it stands now.');
    expect(view.anchorEnd).toBe(92);
  });

  it('should disable a stale suggestion with the version it was made for, and place it before the prose', () => {
    const view = suggestionView({ ...FRESH, location: { freshness: 'stale', start: null, end: null } }, DRAFT);
    expect(view).toEqual({
      state: 'stale',
      canApply: false,
      reason: 'The text changed since this rewrite was suggested (it was for version 3) — try again on the current text.',
      warnings: [],
      anchorEnd: undefined,
    });
  });

  it('should lock every suggestion on a final chapter', () => {
    const view = suggestionView(FRESH, { ...DRAFT, status: 'final', reviewStatus: 'final', approvedRevision: 3 });
    expect(view.state).toBe('locked');
    expect(view.canApply).toBe(false);
    expect(view.reason).toContain('Amend');
  });

  it('should hold a suggestion while the AI writes the chapter', () => {
    const view = suggestionView(FRESH, { ...DRAFT, reviewStatus: 'generating' });
    expect(view.canApply).toBe(false);
    expect(view.reason).toContain('being written');
    expect(suggestionView(FRESH, DRAFT, true).canApply).toBe(false);
  });

  it('should warn about a give-away and about clearing an approval', () => {
    const view = suggestionView({ ...FRESH, leakLines: ['Rook never paid'] }, { ...DRAFT, reviewStatus: 'approved', approvedRevision: 3 });
    expect(view.warnings).toEqual([
      'It may give away a locked secret — using it holds the chapter as a conflict until you resolve it.',
      'Using it changes an approved chapter — you’ll approve again afterwards.',
    ]);
  });
});

describe('splitAtAnchors', () => {
  it('should cut after the paragraph holding each anchor, and put unplaced cards before the prose', () => {
    const { before, segments } = splitAtAnchors(BODY, [{ key: 'stale' }, { key: 'ask', at: 50 }, { key: 'fresh', at: 60 }]);
    expect(before).toEqual(['stale']);
    expect(segments).toEqual([
      { source: 'Hollis kept the ledger in a tin box.\n\nThe pages inside were *swollen* with damp.', from: 0, after: ['ask', 'fresh'] },
      { source: '\n\nNothing. No tick.', from: 80, after: [] },
    ]);
  });

  it('should place a card after the last paragraph and keep the whole body when nothing is anchored', () => {
    expect(splitAtAnchors(BODY, [{ key: 'end', at: BODY.length - 2 }]).segments).toEqual([{ source: BODY, from: 0, after: ['end'] }]);
    expect(splitAtAnchors(BODY, []).segments).toEqual([{ source: BODY, from: 0, after: [] }]);
  });
});

describe('writeRefusalMessage', () => {
  it('should word the passage and version refusals for the author and fall back to the server message', () => {
    expect(writeRefusalMessage(new ApiError(409, { code: 'PSG_004', type: 'CONFLICT', message: 'stale' }))).toContain('Ask again on the current text');
    expect(writeRefusalMessage(new ApiError(409, { code: 'DRF_013', type: 'CONFLICT', message: 'moved' }))).toContain('newest text is on screen');
    expect(writeRefusalMessage(new ApiError(400, { code: 'VER_002', type: 'CLIENT_ERROR', message: 'final' }))).toBe(
      'Restore isn’t available on a final chapter — Amend the text instead.',
    );
    expect(writeRefusalMessage(new ApiError(500, { code: 'X', type: 'SERVER_ERROR', message: 'Boom' }))).toBe('Boom');
  });
});

describe('appliedMessage', () => {
  it('should warn when the rewrite held the chapter as a conflict', () => {
    expect(appliedMessage({ revision: 5, reviewStatus: 'needs_review' })).toEqual({ tone: 'success', text: 'Passage rewritten — saved as version 5' });
    expect(appliedMessage({ revision: 5, reviewStatus: 'contradiction' }).tone).toBe('warning');
  });
});
