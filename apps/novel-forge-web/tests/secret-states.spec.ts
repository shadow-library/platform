import { describe, expect, it } from 'bun:test';

import { type KnowledgeEntryResponse } from '../src/lib/apis/api-types.gen';
import {
  allowedClues,
  knowerRows,
  type MilestoneLike,
  plannedRevealLine,
  readerLearnsLine,
  termDrafts,
  termsFromDrafts,
  type UnlockLookup,
  unlockRows,
  type VolumeLike,
  withClue,
  withoutClue,
  writerToldLine,
} from '../src/lib/secret-states';

function knower(entityName: string, learnedInChapter: number, status: KnowledgeEntryResponse['status'], note?: string): KnowledgeEntryResponse {
  return { entityKey: entityName.toLowerCase(), entityName, learnedInChapter, status, note, source: 'manual', createdAt: '2026-09-01T00:00:00Z' };
}

const milestones = new Map<string, MilestoneLike>([
  ['reads_margins', { milestoneKey: 'reads_margins', label: 'Tamsin reads the margins', state: 'open' }],
  ['teaches_beacon', { milestoneKey: 'teaches_beacon', label: 'Hollis teaches the Beacon', state: 'planned', plannedChapter: 87 }],
  ['reaches_lantern', { milestoneKey: 'reaches_lantern', label: 'Tamsin reaches Lantern', state: 'reached', reachedChapter: 64 }],
]);

const volumes = new Map<string, VolumeLike>([
  ['v2', { volumeKey: 'v2', ordinal: 2, title: 'The payment', state: 'active' }],
  ['v3', { volumeKey: 'v3', ordinal: 3, title: null, state: 'not_started' }],
]);

const lookup: UnlockLookup = { milestones, volumes, nextChapter: 5, status: 'ready' };

describe('unlockRows', () => {
  it('should read each milestone term with its provisional or committed state', () => {
    const rows = unlockRows({ unlock: { all: [{ milestone: 'reaches_lantern' }, { milestone: 'teaches_beacon' }, { milestone: 'reads_margins' }] } }, lookup);
    expect(rows.map(row => [row.label, row.state, row.status])).toEqual([
      ['Tamsin reaches Lantern', 'reached', 'reached ch 64'],
      ['Hollis teaches the Beacon', 'planned', 'planned ch 87 · provisional'],
      ['Tamsin reads the margins', 'open', 'open'],
    ]);
  });

  it('should hold a volume term once that volume has started and a chapter term once the story reaches it', () => {
    const rows = unlockRows({ unlock: { all: [{ volume: 'v2' }, { volume: 'v3' }, { chapter: 5 }, { chapter: 9 }, { ending: true }] } }, lookup);
    expect(rows.map(row => [row.kind, row.label, row.status])).toEqual([
      ['VOLUME', 'Volume 2 · The payment has started', 'met'],
      ['VOLUME', 'Volume 3 has started', 'not yet'],
      ['CHAPTER', 'From chapter 5', 'met'],
      ['CHAPTER', 'From chapter 9', 'not yet'],
      ['ENDING', 'The chapters that write the ending', 'at the ending'],
    ]);
  });

  it('should name a term whose milestone or volume no longer exists instead of dropping it', () => {
    const rows = unlockRows({ unlock: { all: [{ milestone: 'gone' }, { volume: 'v9' }] } }, lookup);
    expect(rows.map(row => [row.label, row.state, row.status])).toEqual([
      ['gone', 'open', 'no such milestone'],
      ['v9', 'open', 'no such volume'],
    ]);
  });

  it('should leave every term unknown until the lookups arrive, and say when they failed', () => {
    const unlock = { all: [{ milestone: 'reaches_lantern' }, { volume: 'v2' }, { chapter: 1 }] };
    expect(unlockRows({ unlock }, { ...lookup, status: 'loading' }).map(row => [row.state, row.status])).toEqual([
      ['unknown', 'checking…'],
      ['unknown', 'checking…'],
      ['unknown', 'checking…'],
    ]);
    expect(unlockRows({ unlock }, { ...lookup, status: 'error' })[0]).toMatchObject({ state: 'unknown', status: 'couldn’t check' });
  });

  it('should treat a chapter term as unmet while the next chapter is unknown', () => {
    expect(unlockRows({ unlock: { all: [{ chapter: 1 }] } }, { ...lookup, nextChapter: undefined })[0]?.state).toBe('open');
  });
});

describe('reveal lines', () => {
  it('should set the reader’s chapter only from disclosure, never from a plan', () => {
    expect(readerLearnsLine({ disclosedInChapter: 12 })).toBe('Since chapter 12.');
    expect(readerLearnsLine({ disclosedInChapter: null })).toBe('Not yet — set when the chapter that reveals it is final.');
  });

  it('should mark a planned reveal provisional and say when nothing may reveal it', () => {
    expect(plannedRevealLine({ plannedChapter: 87 })).toBe('Planned for ch 87 — provisional until you finalize that chapter.');
    expect(plannedRevealLine({})).toBe('No unlock and no date — no chapter plan may reveal it yet.');
    expect(plannedRevealLine({ revealChapter: 40 })).toBe('No chapter plan claims it yet. Not before chapter 40.');
    expect(plannedRevealLine({ unlock: { all: [{ milestone: 'x' }] } })).toContain('No chapter plan claims it yet.');
  });

  it('should tell the writer the cover note while locked and the whole fact once known', () => {
    expect(writerToldLine({ knowledge: [], writerNote: ' Nobody asks her to pay. ' })).toBe('Nobody asks her to pay.');
    expect(writerToldLine({ knowledge: [], writerNote: '' })).toBe('Nothing — the writer doesn’t know this exists until it unlocks.');
    expect(writerToldLine({ knowledge: [knower('Hollis', 1, 'committed')], writerNote: 'cover' })).toContain('It is open');
  });
});

describe('knowerRows', () => {
  it('should list who knows in chapter order, provisional apart from confirmed', () => {
    const rows = knowerRows({ knowledge: [knower('Tamsin', 4, 'provisional', ' believes the ledger missed her '), knower('Hollis', 1, 'committed')] });
    expect(rows.map(row => [row.name, row.chapter, row.note, row.chip, row.intent])).toEqual([
      ['Hollis', 1, undefined, 'confirmed', 'success'],
      ['Tamsin', 4, 'believes the ledger missed her', 'provisional — ch 4 not final', 'accent'],
    ]);
  });
});

describe('allowed clues', () => {
  it('should keep the list the server would keep: trimmed, no blanks, no duplicates', () => {
    expect(allowedClues({ allowedClues: [' cold lamp ', '', 'quiet tide'] })).toEqual(['cold lamp', 'quiet tide']);
    expect(allowedClues({ allowedClues: null })).toEqual([]);
    expect(withClue(['cold lamp'], '  quiet tide ')).toEqual(['cold lamp', 'quiet tide']);
    expect(withClue(['cold lamp'], 'cold lamp')).toEqual(['cold lamp']);
    expect(withClue(['cold lamp'], '   ')).toEqual(['cold lamp']);
    expect(withoutClue(['a', 'b', 'c'], 1)).toEqual(['a', 'c']);
  });
});

describe('condition drafts', () => {
  it('should round-trip a stored unlock through the editor rows', () => {
    const unlock = { all: [{ milestone: 'reaches_lantern' }, { volume: 'v3' }, { chapter: 12 }, { ending: true }] };
    expect(termsFromDrafts(termDrafts({ unlock }))).toEqual(unlock.all);
    expect(termDrafts({})).toEqual([]);
  });

  it('should hold the save while a row is unfinished, and clear the condition when none are left', () => {
    expect(termsFromDrafts([{ kind: 'milestone', value: ' ' }])).toBeUndefined();
    expect(termsFromDrafts([{ kind: 'chapter', value: '0' }])).toBeUndefined();
    expect(termsFromDrafts([{ kind: 'chapter', value: '2.5' }])).toBeUndefined();
    expect(termsFromDrafts([])).toEqual([]);
  });
});
