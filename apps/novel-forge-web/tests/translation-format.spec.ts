import { describe, expect, it } from 'bun:test';

import { translationLifecycle } from '../src/lib/format';
import {
  alignParagraphs,
  CHAPTER_STATE_INTENT,
  CHAPTER_STATE_LABEL,
  chapterAttentionNote,
  chapterNeighbour,
  chapterPosition,
  chapterRowState,
  chapterStaleNote,
  finalizeBlockers,
  finalizeTooltip,
  pasteStatsLabel,
  queueHotkey,
  startActionLabel,
  TRANSLATION_PHASE_LABEL,
  TREATMENT_INTENT,
  TREATMENT_LABEL,
} from '../src/lib/translation';

const counts = { originals: 0, untranslated: 0, translated: 0, attention: 0, finalized: 0 };
const glossary = { approved: 0, suggested: 0 };

describe('translationLifecycle', () => {
  it('should sit on Originals for a project with nothing pasted yet', () => {
    expect(translationLifecycle()).toEqual({ completed: 0, total: 5, label: 'Originals' });
    expect(translationLifecycle({ counts, glossary })).toEqual({ completed: 0, total: 5, label: 'Originals' });
  });

  it('should advance to Terms once originals exist and back off while suggestions wait', () => {
    expect(translationLifecycle({ counts: { ...counts, originals: 30, untranslated: 30 }, glossary })).toEqual({ completed: 1, total: 5, label: 'Terms' });
    expect(translationLifecycle({ counts: { ...counts, originals: 30, untranslated: 30 }, glossary: { approved: 12, suggested: 6 } })).toEqual({
      completed: 1,
      total: 5,
      label: 'Terms',
    });
  });

  it('should advance to Translate once every suggestion is decided and at least one term is approved', () => {
    expect(translationLifecycle({ counts: { ...counts, originals: 30, untranslated: 16 }, glossary: { approved: 41, suggested: 0 } })).toEqual({
      completed: 2,
      total: 5,
      label: 'Translate',
    });
  });

  it('should hold Translate open while a job is still running, even with nothing untranslated left', () => {
    const input = { counts: { ...counts, originals: 30, translated: 30 }, glossary: { approved: 41, suggested: 0 } };
    expect(translationLifecycle({ ...input, jobActive: true }).label).toBe('Translate');
    expect(translationLifecycle({ ...input, jobActive: false })).toEqual({ completed: 3, total: 5, label: 'Review' });
  });

  it('should reach Publish only when every chapter is finalized', () => {
    const glossaryDone = { approved: 41, suggested: 0 };
    expect(translationLifecycle({ counts: { ...counts, originals: 30, attention: 1, finalized: 29 }, glossary: glossaryDone }).label).toBe('Review');
    expect(translationLifecycle({ counts: { ...counts, originals: 30, finalized: 30 }, glossary: glossaryDone })).toEqual({ completed: 4, total: 5, label: 'Publish' });
  });
});

describe('chapterRowState', () => {
  it('should fall back to untranslated when the chapter has no translation row', () => {
    expect(chapterRowState({ status: null })).toBe('untranslated');
    expect(chapterRowState({ status: 'translated' })).toBe('translated');
  });

  it('should report the running chapter as in progress whatever the stored status says', () => {
    expect(chapterRowState({ status: 'failed' }, true)).toBe('in_progress');
  });

  it('should label and colour every row state', () => {
    for (const state of ['finalized', 'translated', 'attention', 'failed', 'in_progress', 'untranslated'] as const) {
      expect(CHAPTER_STATE_LABEL[state]).toBeTruthy();
      expect(CHAPTER_STATE_INTENT[state]).toBeTruthy();
    }
    expect(CHAPTER_STATE_LABEL.attention).toBe('Needs review');
    expect(CHAPTER_STATE_INTENT.in_progress).toBe('accent');
  });
});

describe('chapterAttentionNote', () => {
  it('should join the pending-term and issue counts the way the chapter row reads them', () => {
    expect(chapterAttentionNote({ pendingTerms: 2, issueCount: 1 })).toBe('2 terms pending · 1 issue');
    expect(chapterAttentionNote({ pendingTerms: 1, issueCount: 0 })).toBe('1 term pending');
    expect(chapterAttentionNote({ pendingTerms: 0, issueCount: 0 })).toBeNull();
  });
});

describe('chapterStaleNote', () => {
  it('should name whichever side moved', () => {
    expect(chapterStaleNote({ glossaryStale: true, sourceStale: false })).toBe('glossary changed');
    expect(chapterStaleNote({ glossaryStale: false, sourceStale: true })).toBe('original changed');
    expect(chapterStaleNote({ glossaryStale: true, sourceStale: true })).toBe('glossary and original changed');
    expect(chapterStaleNote({ glossaryStale: false, sourceStale: false })).toBeNull();
  });
});

describe('finalizeBlockers', () => {
  const clean = { status: 'translated' as const, glossaryStale: false, sourceStale: false, pendingTerms: 0 };

  it('should open the gate for a clean translation', () => {
    expect(finalizeBlockers(clean)).toEqual([]);
    expect(finalizeTooltip([])).toBe('Write this English text into the novel and lock the chapter');
  });

  it('should refuse a chapter with no translation, a finalized one and a failed one', () => {
    expect(finalizeBlockers({ ...clean, status: null })).toEqual(['This chapter has no translation yet.']);
    expect(finalizeBlockers({ ...clean, status: 'finalized' })).toEqual(['Already finalized — reopen it to change the English text.']);
    expect(finalizeBlockers({ ...clean, status: 'failed' })).toEqual(['The last run failed — re-run the chapter before finalizing.']);
  });

  it('should name the pending terms when the reader knows them and only count them when it does not', () => {
    expect(finalizeBlockers({ ...clean, pendingTerms: 2, pendingTermNames: ['玄天丹', '长老'] })).toEqual(['Approve or reject 2 pending terms first (玄天丹, 长老)']);
    expect(finalizeBlockers({ ...clean, pendingTerms: 1 })).toEqual(['Approve or reject 1 pending term first']);
  });

  it('should report both staleness blockers together, after the pending terms', () => {
    expect(finalizeBlockers({ ...clean, pendingTerms: 1, glossaryStale: true, sourceStale: true })).toEqual([
      'Approve or reject 1 pending term first',
      'The glossary changed since this translation — re-run the chapter.',
      'The original changed since this translation — re-run the chapter.',
    ]);
  });
});

describe('startActionLabel', () => {
  it('should follow the phase', () => {
    expect(startActionLabel('pending', 0)).toBe('Start translation');
    expect(startActionLabel('review', 6)).toBe('Continue translating');
    expect(startActionLabel('review', 0)).toBe('Translate remaining');
    expect(startActionLabel('translating', 6)).toBe('Translate remaining');
    expect(startActionLabel('done', 0)).toBe('Translate remaining');
  });
});

describe('label maps', () => {
  it('should label every phase and treatment', () => {
    for (const phase of ['pending', 'seeding', 'review', 'translating', 'done', 'failed'] as const) expect(TRANSLATION_PHASE_LABEL[phase]).toBeTruthy();
    expect(TREATMENT_LABEL.preserve).toBe('Keep as is');
    expect(TREATMENT_INTENT.translate).toBe('success');
  });
});

describe('alignParagraphs', () => {
  it('should pair paragraphs by index and leave the shorter column blank', () => {
    expect(alignParagraphs('one\n\ntwo', 'ONE\n\nTWO')).toEqual([
      { original: 'one', english: 'ONE' },
      { original: 'two', english: 'TWO' },
    ]);
    expect(alignParagraphs('one\n\ntwo', 'ONE')).toEqual([
      { original: 'one', english: 'ONE' },
      { original: 'two', english: undefined },
    ]);
  });

  it('should ignore blank runs between paragraphs', () => {
    expect(alignParagraphs('one\n\n   \n\ntwo', '')).toHaveLength(2);
  });
});

describe('pasteStatsLabel', () => {
  it('should count paragraphs and characters for the paste dialog', () => {
    expect(pasteStatsLabel('one\n\ntwo')).toBe('2 paragraphs · 8 characters');
    expect(pasteStatsLabel('')).toBe('0 paragraphs · 0 characters');
  });
});

describe('chapterNeighbour', () => {
  const walk = { chapter: 12, page: 1, pageSize: 25, total: 60, filtered: false, chapters: [11, 12, 13] };

  it('should step within the loaded page without changing page', () => {
    expect(chapterNeighbour(walk, 1)).toEqual({ chapter: 13, page: 1 });
    expect(chapterNeighbour(walk, -1)).toEqual({ chapter: 11, page: 1 });
  });

  it('should cross the page edge on an unfiltered list, where originals are contiguous', () => {
    expect(chapterNeighbour({ ...walk, chapter: 25, chapters: [24, 25] }, 1)).toEqual({ chapter: 26, page: 2 });
    expect(chapterNeighbour({ ...walk, chapter: 26, page: 2, chapters: [26, 27] }, -1)).toEqual({ chapter: 25, page: 1 });
  });

  it('should stop at the page edge once a status filter breaks contiguity', () => {
    expect(chapterNeighbour({ ...walk, chapter: 25, chapters: [24, 25], filtered: true }, 1)).toBeNull();
    expect(chapterNeighbour({ ...walk, chapter: 26, page: 2, chapters: [26, 27], filtered: true }, -1)).toBeNull();
  });

  it('should stop at the ends of the collection', () => {
    expect(chapterNeighbour({ ...walk, chapter: 1, page: 1, chapters: [1, 2] }, -1)).toBeNull();
    expect(chapterNeighbour({ ...walk, chapter: 60, page: 3, total: 60, chapters: [59, 60] }, 1)).toBeNull();
  });

  it('should refuse to guess for a chapter the loaded page does not hold', () => {
    expect(chapterNeighbour({ ...walk, chapter: 99 }, 1)).toEqual({ chapter: 100, page: 2 });
    expect(chapterNeighbour({ ...walk, chapter: 99, filtered: true }, 1)).toBeNull();
  });
});

describe('chapterPosition', () => {
  it('should count against the collection rather than the loaded page', () => {
    expect(chapterPosition({ chapter: 27, page: 2, pageSize: 25, total: 480, chapters: [26, 27, 28] })).toBe('27 of 480');
  });

  it('should report nothing when the chapter is off the loaded page or the collection is empty', () => {
    expect(chapterPosition({ chapter: 99, page: 1, pageSize: 25, total: 480, chapters: [1, 2] })).toBeNull();
    expect(chapterPosition({ chapter: 1, page: 1, pageSize: 25, total: 0, chapters: [1] })).toBeNull();
  });
});

describe('queueHotkey', () => {
  const event = { key: 'a', ctrlKey: false, metaKey: false, altKey: false, editableTarget: false };

  it('should map the bare triage letters', () => {
    expect(queueHotkey(event)).toBe('approve');
    expect(queueHotkey({ ...event, key: 'R' })).toBe('reject');
    expect(queueHotkey({ ...event, key: 'j' })).toBe('next');
    expect(queueHotkey({ ...event, key: 'k' })).toBe('previous');
    expect(queueHotkey({ ...event, key: 'z' })).toBeNull();
  });

  it('should leave the browser its own chords', () => {
    expect(queueHotkey({ ...event, metaKey: true })).toBeNull();
    expect(queueHotkey({ ...event, ctrlKey: true })).toBeNull();
    expect(queueHotkey({ ...event, altKey: true })).toBeNull();
  });

  it('should never fire while the key lands in text entry', () => {
    expect(queueHotkey({ ...event, editableTarget: true })).toBeNull();
    expect(queueHotkey({ ...event, key: 'j', editableTarget: true })).toBeNull();
  });
});
