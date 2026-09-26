import { describe, expect, it } from 'bun:test';

import { type DraftVersionResponse, type VersionComparisonResponse } from '../src/lib/apis';
import {
  diffParagraphs,
  diffView,
  FINAL_RESTORE_REASON,
  foldUnchanged,
  orderedPair,
  restoreConsequences,
  restoredMessage,
  restoreGate,
  versionSourceLabel,
} from '../src/lib/draft-versions';

const DRAFT = { status: 'draft' as const, reviewStatus: 'needs_review' as const, approvedRevision: null };

function version(overrides: Partial<DraftVersionResponse> = {}): DraftVersionResponse {
  return { revision: 2, source: 'hand_edited', restoredFrom: null, current: false, approved: false, isolated: false, createdAt: '2026-09-25T14:02:00Z', ...overrides };
}

describe('versionSourceLabel', () => {
  it('should say what made each version', () => {
    expect(versionSourceLabel(version())).toBe('You edited the text');
    expect(versionSourceLabel(version({ source: 'passage_rewritten' }))).toBe('One passage rewritten at your request');
    expect(versionSourceLabel(version({ source: 'restored', restoredFrom: 1 }))).toBe('Restored version 1 as a new version');
    expect(versionSourceLabel(version({ source: null }))).toBe('Text from before versions were kept');
  });
});

describe('restoreGate', () => {
  it('should refuse a restore on a final chapter with the reason shown', () => {
    expect(restoreGate({ ...DRAFT, status: 'final', reviewStatus: 'final' }, version(), false)).toEqual({ allowed: false, reason: FINAL_RESTORE_REASON });
    expect(FINAL_RESTORE_REASON).toBe('Restore isn’t available on a final chapter — Amend the text instead.');
  });

  it('should refuse restoring the current version or while the AI writes the chapter', () => {
    expect(restoreGate(DRAFT, version({ current: true }), false).allowed).toBe(false);
    expect(restoreGate(DRAFT, version(), true).allowed).toBe(false);
    expect(restoreGate({ ...DRAFT, reviewStatus: 'generating' }, version(), false).allowed).toBe(false);
  });

  it('should allow restoring an earlier version of a draft', () => {
    expect(restoreGate(DRAFT, version(), false)).toEqual({ allowed: true });
  });
});

describe('restoreConsequences', () => {
  it('should explain that restoring clears an approval', () => {
    expect(restoreConsequences({ ...DRAFT, reviewStatus: 'approved', approvedRevision: 3 }, version())).toContain(
      'Restoring clears your approval — you’ll approve the restored text again.',
    );
  });

  it('should explain that even the approved version needs approving again', () => {
    const lines = restoreConsequences({ ...DRAFT, approvedRevision: 2 }, version({ approved: true }));
    expect(lines).toContain('This is the version you approved, but restoring still makes a new version, so you’ll approve it again.');
    expect(lines.some(line => line.startsWith('Restoring clears'))).toBe(false);
  });

  it('should not mention approval on a chapter never approved', () => {
    expect(restoreConsequences(DRAFT, version()).some(line => line.includes('approv'))).toBe(false);
  });
});

describe('restoredMessage', () => {
  it('should report a restore of identical text as a no-op', () => {
    expect(restoredMessage({ revision: 4, saveSeq: 9 }, { revision: 4, saveSeq: 9 }, 2)).toBe('Version 2 is the same as the current text — nothing changed.');
    expect(restoredMessage({ revision: 4, saveSeq: 9 }, { revision: 5, saveSeq: 10 }, 2)).toBe('Version 2 restored as version 5');
  });
});

describe('orderedPair', () => {
  it('should always read from the older version to the newer', () => {
    expect(orderedPair(5, 2)).toEqual({ from: 2, to: 5 });
    expect(orderedPair(2, 5)).toEqual({ from: 2, to: 5 });
  });
});

describe('diffParagraphs', () => {
  it('should re-cut hunks into paragraphs and mark the ones that changed', () => {
    const paragraphs = diffParagraphs([
      { op: 'equal', text: 'First stays.\n\nThe pages ' },
      { op: 'delete', text: 'inside were' },
      { op: 'insert', text: 'had' },
      { op: 'equal', text: ' swollen.\n\nLast stays.' },
    ]);
    expect(paragraphs).toEqual([
      { pieces: [{ op: 'equal', text: 'First stays.' }], changed: false },
      {
        pieces: [
          { op: 'equal', text: 'The pages ' },
          { op: 'delete', text: 'inside were' },
          { op: 'insert', text: 'had' },
          { op: 'equal', text: ' swollen.' },
        ],
        changed: true,
      },
      { pieces: [{ op: 'equal', text: 'Last stays.' }], changed: false },
    ]);
  });

  it('should keep an added paragraph as its own changed block', () => {
    expect(
      diffParagraphs([
        { op: 'equal', text: 'One.' },
        { op: 'insert', text: '\n\nTwo.' },
      ]),
    ).toEqual([
      { pieces: [{ op: 'equal', text: 'One.' }], changed: false },
      { pieces: [{ op: 'insert', text: 'Two.' }], changed: true },
    ]);
  });
});

describe('foldUnchanged', () => {
  const same = { pieces: [{ op: 'equal' as const, text: 'Same.' }], changed: false };
  const changed = { pieces: [{ op: 'insert' as const, text: 'New.' }], changed: true };

  it('should fold runs of unchanged paragraphs, keeping one either side of a change', () => {
    const rows = foldUnchanged([same, same, same, changed, same, same, same]);
    expect(rows.map(row => (row.kind === 'unchanged' ? `fold ${row.count}` : row.paragraph.changed ? 'changed' : 'same'))).toEqual(['fold 2', 'same', 'changed', 'same', 'fold 2']);
  });
});

describe('diffView', () => {
  const comparison: VersionComparisonResponse = {
    from: 1,
    to: 3,
    hunks: [
      { op: 'equal', text: 'The ' },
      { op: 'insert', text: 'old ' },
      { op: 'equal', text: 'ledger.' },
    ],
    wordsAdded: 1,
    wordsRemoved: 0,
  };

  it('should summarise the words added and removed', () => {
    const view = diffView(comparison);
    expect(view.identical).toBe(false);
    expect(view.summary).toBe('1 word added · 0 words removed, from version 1 to 3');
    expect(view.rows).toHaveLength(1);
  });

  it('should say when two versions have the same text', () => {
    const view = diffView({ ...comparison, hunks: [{ op: 'equal', text: 'The ledger.' }], wordsAdded: 0 });
    expect(view.identical).toBe(true);
    expect(view.summary).toBe('Versions 1 and 3 have the same text');
  });
});
