import { describe, expect, it } from 'bun:test';
import { organiseRecordKey, organiseSectionKey, organiseTextKey, textDigest } from '@shadow-library/sdk';

import { ledgerTopicLabel } from '../src/features/blueprint/notebook';
import {
  answerSuggestion,
  buildOrganiseSelection,
  eventsByBand,
  mergeRestored,
  moveEvent,
  nextOrganiseDraft,
  organiseCounts,
  organiseDraftFrom,
  organiseFailureMessage,
  organiseLockIssue,
  organiseLockSummary,
  organiseNotesChanged,
  organiseOverview,
  organiseRemovals,
  type OrganiseRound,
  organiseRoundFeedback,
  organiseRunningLabel,
  pageAllInferred,
  pageInclusion,
  parseOrganiseRound,
  restoreOrganiseDraft,
  togglePage,
} from '../src/features/blueprint/organise-step';
import { type BlueprintRoundResponse, type LedgerEntryResponse } from '../src/lib/apis';

const NOTES = 'Ilse carries sealed letters up from the salt mine. The Lantern Guild owns every letter in the valley.';

const OPTIONS = {
  reading: 'A courier learns who owns the letters she carries.',
  notesDigest: textDigest(NOTES),
  timeline: [
    { id: 't1', band: 'opening', event: 'Ilse carries a sealed letter up from the mine' },
    { id: 't2', band: 'unplaced', event: 'Ilse meets her brother again' },
  ],
  pages: [
    { id: 'p1', section: 'project', slug: 'cast', title: 'Cast', needs: ['character'], sections: [{ id: 'p1s1', heading: 'Ilse', body: 'A courier.', source: 'notes' }] },
    {
      id: 'p2',
      section: 'world',
      slug: 'the-lantern-guild',
      title: 'The Lantern Guild',
      needs: ['location', 'concept', 'faction'],
      sections: [
        { id: 'p2s1', heading: 'What it wants', body: 'Every letter.', source: 'notes' },
        { id: 'p2s2', heading: 'How it began', body: 'Older than the mine.', source: 'inferred' },
      ],
    },
  ],
  records: [
    { id: 'e1', name: 'Ilse', type: 'character', summary: 'A courier.', source: 'notes' },
    { id: 'e2', name: 'The Lantern Guild', type: 'faction', summary: 'Owns the letters.', source: 'notes' },
  ],
  rules: [{ id: 'r1', rule: 'Ilse never opens a letter she carries' }],
  questions: [{ id: 'q1', question: 'Who sent the first letter?', why: 'Chapter one opens on it.' }],
  suggestions: [{ id: 's1', pageId: 'p2', section: 'How it began', text: 'The first mine foreman founded the guild.', why: 'It gives the guild a face.' }],
};

function round(overrides: Partial<BlueprintRoundResponse> = {}): BlueprintRoundResponse {
  return {
    id: 'r1',
    stepKey: 'organise',
    round: 2,
    status: 'ready',
    jobId: null,
    steer: null,
    nudges: [],
    keepAsDirection: false,
    feedback: [],
    input: null,
    focus: null,
    options: OPTIONS,
    coachMessage: null,
    error: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function entry(overrides: Partial<LedgerEntryResponse> = {}): LedgerEntryResponse {
  return {
    id: '1',
    projectId: '7',
    kind: 'decision',
    phase: 'idea',
    topic: 'organise',
    statement: 'The author’s notes are organised.',
    why: null,
    rejectedAlternatives: [],
    writerLine: null,
    decidedBy: 'author',
    stepKey: 'organise',
    payload: null,
    links: {},
    supersedesId: null,
    supersededAt: null,
    withdrawnReason: null,
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const parsed = parseOrganiseRound(round()) as OrganiseRound;
const cast = parsed.pages[0]!;
const guild = parsed.pages[1]!;

describe('parseOrganiseRound', () => {
  it('should read a ready round and nothing from one that has not finished', () => {
    expect(parsed.round).toBe(2);
    expect(parsed.pages.map(page => page.id)).toEqual(['p1', 'p2']);
    expect(parseOrganiseRound(round({ status: 'running', options: null }))).toBeNull();
    expect(parseOrganiseRound(null)).toBeNull();
  });

  it('should drop parts in a shape this build does not know rather than throw', () => {
    const odd = parseOrganiseRound(round({ options: { ...OPTIONS, timeline: [{ id: 't1', band: 'middle', event: 'x' }], suggestions: [{ id: 's1', pageId: 'p9', text: 'x' }] } }));
    expect(odd?.timeline).toEqual([]);
    expect(odd?.suggestions).toEqual([]);
  });
});

describe('organiseDraftFrom', () => {
  it('should keep what the notes state and leave anything inferred or suggested out', () => {
    const draft = organiseDraftFrom(parsed);

    expect(draft.sections).toEqual({ p1s1: true, p2s1: true, p2s2: false });
    expect(draft.suggestions.s1).toEqual({ verdict: null, reason: '' });
    expect(pageInclusion(guild, draft)).toBe('some');
  });
});

describe('togglePage', () => {
  it('should take a partly or wholly kept page out, and bring an empty one back to what the notes state only', () => {
    const some = organiseDraftFrom(parsed);
    const none = togglePage(some, guild);
    expect(none.sections).toMatchObject({ p2s1: false, p2s2: false });

    const back = togglePage(none, guild);
    expect(back.sections).toMatchObject({ p2s1: true, p2s2: false });

    const all = { ...back, sections: { ...back.sections, p2s2: true } };
    expect(pageInclusion(guild, all)).toBe('all');
    expect(togglePage(all, guild).sections).toMatchObject({ p2s1: false, p2s2: false });
  });

  it('should leave a page whose every section is inferred to its own section boxes', () => {
    const inferredOnly = { ...guild, sections: guild.sections.map(section => ({ ...section, source: 'inferred' as const })) };
    const draft = { ...organiseDraftFrom(parsed), sections: { ...organiseDraftFrom(parsed).sections, p2s1: false, p2s2: false } };

    expect(pageAllInferred(inferredOnly)).toBe(true);
    expect(pageAllInferred(guild)).toBe(false);
    expect(togglePage(draft, inferredOnly).sections).toMatchObject({ p2s1: false, p2s2: false });
    expect(togglePage({ ...draft, sections: { ...draft.sections, p2s2: true } }, inferredOnly).sections).toMatchObject({ p2s1: false, p2s2: false });
  });
});

describe('organise selection', () => {
  it('should send only what is kept, with events where the author moved them and only the suggestions they answered', () => {
    let draft = moveEvent(organiseDraftFrom(parsed), 't2', 'later');
    draft = answerSuggestion(draft, 's1', { verdict: 'reject', reason: ' Too tidy ' });

    expect(
      eventsByBand(parsed, draft)
        .find(group => group.band === 'later')
        ?.events.map(event => event.id),
    ).toEqual(['t2']);
    expect(buildOrganiseSelection(parsed, draft)).toEqual({
      sections: ['p1s1', 'p2s1'],
      records: ['e1', 'e2'],
      timeline: [
        { optionId: 't1', band: 'opening' },
        { optionId: 't2', band: 'later' },
      ],
      rules: ['r1'],
      questions: ['q1'],
      suggestions: [{ optionId: 's1', verdict: 'reject', reason: 'Too tidy' }],
    });
    expect(organiseRoundFeedback(parsed, draft)).toEqual({ s1: { verdict: 'not', reason: 'Too tidy' } });
  });

  it('should refuse to lock nothing, a suggestion whose page is left out, a page with no record, and an over-long reason', () => {
    const none = { ...organiseDraftFrom(parsed), sections: {}, records: {}, events: {}, rules: {}, questions: {} };
    expect(organiseLockIssue(parsed, none)).toContain('Keep at least one thing');

    const orphan = answerSuggestion(togglePage(organiseDraftFrom(parsed), guild), 's1', { verdict: 'accept', reason: '' });
    expect(organiseLockIssue(parsed, orphan)).toContain('“The Lantern Guild”, which you left out');
    expect(buildOrganiseSelection(parsed, orphan)).toBeNull();

    const unbacked = { ...organiseDraftFrom(parsed), records: { e1: true, e2: false } };
    expect(organiseLockIssue(parsed, unbacked)).toBe('“The Lantern Guild” needs at least one record kept that is a place, an idea or a faction.');

    const wordy = answerSuggestion(organiseDraftFrom(parsed), 's1', { verdict: 'reject', reason: 'x'.repeat(401) });
    expect(organiseLockIssue(parsed, wordy)).toContain('over 400 characters');
  });
});

describe('organise copy', () => {
  it('should say first how many suggestions still need a decision', () => {
    expect(organiseOverview(parsed, organiseCounts(parsed, organiseDraftFrom(parsed)))).toBe(
      '1 suggestion needs a decision · 2 pages · 2 records · 2 timeline events · 1 open question',
    );
  });

  it('should say exactly what a lock writes and takes out, and what undoing it can reach', () => {
    const draft = answerSuggestion({ ...organiseDraftFrom(parsed), sections: { p1s1: true, p2s1: true, p2s2: true } }, 's1', { verdict: 'accept', reason: '' });
    const summary = organiseLockSummary(organiseCounts(parsed, draft), { records: ['Tide salt'], pages: 1 });

    expect(summary).toContain('Adds 2 pages, 2 records, a timeline of 2 events and 1 open question to your Story Bible.');
    expect(summary).toContain('Takes out what it added before and you have now left out: 1 record (Tide salt) and its sections on 1 page');
    expect(summary).toContain('1 rule goes to your Notebook for every later step.');
    expect(summary).toContain('Undoing it from change history restores the Story Bible; the rules and your answers to suggestions stay in your Notebook');
  });

  it('should read what locking again takes out from what the last lock wrote', () => {
    const locked = entry({
      payload: {
        records: [
          { entityKey: 'ilse', name: 'Ilse', digest: 'x' },
          { entityKey: 'tide_salt', name: 'Tide salt', digest: 'y' },
        ],
        pages: [
          { section: 'project', slug: 'cast', sections: [] },
          { section: 'power', slug: 'tide-salt', sections: [] },
        ],
      },
    });
    expect(organiseRemovals([locked], parsed, organiseDraftFrom(parsed))).toEqual({ records: ['Tide salt'], pages: 1 });
  });

  it('should say how long a round usually takes, and that long notes can take longer or time out, never promising a limit', () => {
    expect(organiseRunningLabel(3_000)).toContain('usually takes a few minutes');
    expect(organiseRunningLabel(9_000)).toContain('notes this long can take longer, or run past the time limit');
    expect(organiseRunningLabel(9_000)).not.toContain('five minutes');
  });

  it('should advise on a model call that did not finish, and keep every other failure’s own reason', () => {
    const long = organiseFailureMessage('The model call did not finish.', 9_000, true);
    expect(long).toStartWith('The model call did not finish. Notes this long can run past the time limit.');
    expect(long).toEndWith('Your last organisation is still below, and you can still add it.');
    expect(organiseFailureMessage('The model call did not finish.', 2_000, false)).toBe('The model call did not finish. Try again, or steer it toward fewer, fuller pages.');

    const spend = 'AI spend limit reached for this account in the current window — try again later';
    expect(organiseFailureMessage(spend, 9_000, true)).toBe(`${spend} Your last organisation is still below, and you can still add it.`);
    expect(organiseFailureMessage('The round was never queued.', 9_000, false)).toBe('The round was never queued.');
  });
});

describe('restoreOrganiseDraft', () => {
  const digest = (text: string): string => textDigest(text);
  const locked = entry({
    payload: {
      round: 1,
      answers: {
        sections: { [digest(organiseSectionKey(cast, 'Ilse'))]: false, [digest(organiseSectionKey(guild, 'How it began'))]: true },
        records: { [digest(organiseRecordKey({ name: 'Ilse', type: 'character' }))]: false },
        events: { [digest(organiseTextKey('Ilse meets her brother again'))]: { kept: true, band: 'early' } },
        rules: { [digest(organiseTextKey('Ilse never opens a letter she carries'))]: false },
      },
    },
  });

  it('should put the locked answer back by what each item says, on any round that says the same', () => {
    const draft = restoreOrganiseDraft([locked], parsed);

    expect(draft?.sections).toEqual({ p1s1: false, p2s1: true, p2s2: true });
    expect(draft?.records).toEqual({ e1: false, e2: true });
    expect(draft?.events.t2).toEqual({ kept: true, band: 'early' });
    expect(draft?.rules).toEqual({ r1: false });
  });

  it('should bring back what the author accepted and turned down wherever the same suggestion is offered', () => {
    const turnedDown = entry({ id: '2', kind: 'rejected', topic: 'organise.ruled_out', statement: 'The first mine foreman founded the guild.', why: 'Too tidy' });
    expect(restoreOrganiseDraft([turnedDown], parsed)?.suggestions.s1).toEqual({ verdict: 'reject', reason: 'Too tidy' });
    expect(restoreOrganiseDraft([], parsed)).toBeNull();
  });

  it('should merge a restored answer under what the author has touched this session', () => {
    const offered = organiseDraftFrom(parsed);
    const touchedRule = { ...offered, rules: { r1: true } };
    const restored = restoreOrganiseDraft([locked], parsed)!;

    const merged = mergeRestored({ ...offered, questions: { q1: false } }, offered, restored);
    expect(merged.questions).toEqual({ q1: false });
    expect(merged.rules).toEqual({ r1: false });
    expect(mergeRestored(touchedRule, { ...offered, rules: { r1: false } }, restored).rules).toEqual({ r1: true });
  });
});

describe('nextOrganiseDraft', () => {
  it('should carry what the author changed across a new round by what it says, and give everything else the new defaults', () => {
    const offered = organiseDraftFrom(parsed);
    const touched = moveEvent({ ...offered, rules: { r1: false } }, 't2', 'ending');
    const next = parseOrganiseRound(
      round({
        id: 'r2',
        round: 3,
        options: { ...OPTIONS, timeline: [{ id: 't1', band: 'unplaced', event: 'Ilse meets her brother again' }], rules: [{ id: 'r1', rule: 'A different rule' }] },
      }),
    );

    const carried = nextOrganiseDraft(touched, offered, parsed, next);
    expect(carried.events.t1).toEqual({ kept: true, band: 'ending' });
    expect(carried.rules).toEqual({ r1: true });
  });
});

describe('organiseNotesChanged', () => {
  it('should notice notes rewritten after they were organised', () => {
    const brief = entry({ kind: 'direction', topic: 'start.brief', statement: NOTES });
    expect(organiseNotesChanged(parsed, [brief])).toBe(false);
    expect(organiseNotesChanged(parsed, [{ ...brief, statement: `${NOTES} And a lighthouse.` }])).toBe(true);
    expect(organiseNotesChanged(parsed, [])).toBe(false);
  });
});

describe('ledgerTopicLabel', () => {
  it('should name the organise topics in words', () => {
    expect(ledgerTopicLabel('organise.ruled_out')).toBe('Suggestions you turned down');
    expect(ledgerTopicLabel('organise')).toBe('Your notes, organised');
  });
});
