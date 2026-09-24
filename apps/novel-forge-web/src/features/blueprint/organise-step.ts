import {
  isOrganiseRecordType,
  isTimelineBand,
  ORGANISE_ACCEPTED_TOPIC,
  ORGANISE_REASON_MAX,
  ORGANISE_RECORD_TYPE_WORDS,
  ORGANISE_RECORD_TYPES,
  ORGANISE_RULED_OUT_TOPIC,
  ORGANISE_TOPIC,
  organiseRecordKey,
  type OrganiseRecordType,
  organiseSectionKey,
  type OrganiseSource,
  organiseTextKey,
  ROUND_MODEL_CALL_FAILED,
  type SuggestionVerdict,
  textDigest,
  TIMELINE_BANDS,
  type TimelineBand,
} from '@shadow-library/sdk';

import { type BlueprintRoundResponse, type LedgerEntryResponse } from '@/lib/apis';

import { decisionPayload, lockedDecision, passList, passText } from './engine-pass';
import { type OptionVerdicts } from './round';

export const AUTHOR_BRIEF_TOPIC = 'start.brief';
export const ORGANISE_LONG_NOTES_WORDS = 4_000;

export const ORGANISE_SOURCE_LABELS: Record<OrganiseSource, string> = { notes: 'From your notes', inferred: 'Inferred — not stated in your notes' };

export const RECORD_TYPE_LABELS: Record<OrganiseRecordType, string> = {
  character: 'Characters',
  location: 'Places',
  faction: 'Factions',
  power_rule: 'Powers and their rules',
  item: 'Items',
  concept: 'Ideas',
};

const PAGE_SECTION_LABELS: Record<string, string> = { project: 'The story', world: 'World', power: 'Power', plot: 'Plot', lore: 'Lore' };

export interface OrganiseEvent {
  id: string;
  band: TimelineBand;
  event: string;
}

export interface OrganiseSection {
  id: string;
  heading: string;
  body: string;
  source: OrganiseSource;
}

export interface OrganisePage {
  id: string;
  section: string;
  slug: string;
  title: string;
  needs: OrganiseRecordType[];
  sections: OrganiseSection[];
}

export interface OrganiseRecord {
  id: string;
  name: string;
  type: OrganiseRecordType;
  summary: string;
  source: OrganiseSource;
}

export interface OrganiseRule {
  id: string;
  rule: string;
}

export interface OrganiseQuestion {
  id: string;
  question: string;
  why: string;
}

export interface OrganiseSuggestion {
  id: string;
  pageId: string;
  section: string;
  text: string;
  why: string;
}

export interface OrganiseRound {
  round: number;
  reading: string;
  notesDigest: string;
  timeline: OrganiseEvent[];
  pages: OrganisePage[];
  records: OrganiseRecord[];
  rules: OrganiseRule[];
  questions: OrganiseQuestion[];
  suggestions: OrganiseSuggestion[];
}

export interface SuggestionAnswer {
  verdict: SuggestionVerdict | null;
  reason: string;
}

export interface OrganiseDraft {
  sections: Record<string, boolean>;
  records: Record<string, boolean>;
  events: Record<string, { kept: boolean; band: TimelineBand }>;
  rules: Record<string, boolean>;
  questions: Record<string, boolean>;
  suggestions: Record<string, SuggestionAnswer>;
}

type DraftKind = keyof OrganiseDraft;

const KINDS: readonly DraftKind[] = ['sections', 'records', 'events', 'rules', 'questions', 'suggestions'];

export const EMPTY_ORGANISE_DRAFT: OrganiseDraft = { sections: {}, records: {}, events: {}, rules: {}, questions: {}, suggestions: {} };

const sourceOf = (value: unknown): OrganiseSource => (value === 'notes' ? 'notes' : 'inferred');
const withId = (value: unknown): value is { id: string } & Record<string, unknown> => typeof (value as { id?: unknown } | null)?.id === 'string';
const same = (left: unknown, right: unknown): boolean => JSON.stringify(left ?? null) === JSON.stringify(right ?? null);

export function parseOrganiseRound(round: BlueprintRoundResponse | null): OrganiseRound | null {
  const options = round?.options as Record<string, unknown> | null | undefined;
  if (round == null || options == null || typeof options !== 'object') return null;
  const pages = passList(options['pages'])
    .filter(withId)
    .map(page => ({
      id: page.id,
      section: passText(page['section']),
      slug: passText(page['slug']),
      title: passText(page['title']) || 'Untitled page',
      needs: passList(page['needs']).filter(isOrganiseRecordType),
      sections: passList(page['sections'])
        .filter(withId)
        .map(section => ({ id: section.id, heading: passText(section['heading']), body: passText(section['body']), source: sourceOf(section['source']) })),
    }))
    .filter(page => page.sections.length > 0);
  return {
    round: round.round,
    reading: passText(options['reading']),
    notesDigest: passText(options['notesDigest']),
    timeline: passList(options['timeline'])
      .filter(withId)
      .flatMap(event => (isTimelineBand(event['band']) ? [{ id: event.id, band: event['band'], event: passText(event['event']) }] : [])),
    pages,
    records: passList(options['records'])
      .filter(withId)
      .flatMap(record =>
        isOrganiseRecordType(record['type'])
          ? [{ id: record.id, name: passText(record['name']), type: record['type'], summary: passText(record['summary']), source: sourceOf(record['source']) }]
          : [],
      ),
    rules: passList(options['rules'])
      .filter(withId)
      .map(rule => ({ id: rule.id, rule: passText(rule['rule']) })),
    questions: passList(options['questions'])
      .filter(withId)
      .map(item => ({ id: item.id, question: passText(item['question']), why: passText(item['why']) })),
    suggestions: passList(options['suggestions'])
      .filter(withId)
      .map(item => ({ id: item.id, pageId: passText(item['pageId']), section: passText(item['section']), text: passText(item['text']), why: passText(item['why']) }))
      .filter(item => pages.some(page => page.id === item.pageId)),
  };
}

/** What the notes state goes in unless the author takes it out; anything the model inferred or suggested stays out until they say yes. */
export function organiseDraftFrom(round: OrganiseRound | null): OrganiseDraft {
  if (round == null) return EMPTY_ORGANISE_DRAFT;
  return {
    sections: Object.fromEntries(round.pages.flatMap(page => page.sections.map(section => [section.id, section.source === 'notes']))),
    records: Object.fromEntries(round.records.map(record => [record.id, record.source === 'notes'])),
    events: Object.fromEntries(round.timeline.map(event => [event.id, { kept: true, band: event.band }])),
    rules: Object.fromEntries(round.rules.map(rule => [rule.id, true])),
    questions: Object.fromEntries(round.questions.map(item => [item.id, true])),
    suggestions: Object.fromEntries(round.suggestions.map(item => [item.id, { verdict: null, reason: '' }])),
  };
}

/** Each item of a round under the digest of what it says — the same names the server stores a locked answer under. */
function keysOf(round: OrganiseRound): Record<DraftKind, Map<string, string>> {
  const key = (text: string): string => textDigest(text);
  return {
    sections: new Map(round.pages.flatMap(page => page.sections.map(section => [section.id, key(organiseSectionKey(page, section.heading))]))),
    records: new Map(round.records.map(record => [record.id, key(organiseRecordKey(record))])),
    events: new Map(round.timeline.map(event => [event.id, key(organiseTextKey(event.event))])),
    rules: new Map(round.rules.map(rule => [rule.id, key(organiseTextKey(rule.rule))])),
    questions: new Map(round.questions.map(item => [item.id, key(organiseTextKey(item.question))])),
    suggestions: new Map(round.suggestions.map(item => [item.id, key(organiseTextKey(item.text))])),
  };
}

/** `answers` holds each kind's values under item digests; every item of the round that has one takes it, and the rest keep the draft's. */
function applyAnswers(draft: OrganiseDraft, round: OrganiseRound, answers: Partial<Record<DraftKind, Record<string, unknown>>>): OrganiseDraft {
  const keys = keysOf(round);
  const next = { ...draft };
  for (const kind of KINDS) {
    const values: Record<string, unknown> = { ...draft[kind] };
    for (const [id, key] of keys[kind]) if (answers[kind] && key in answers[kind]) values[id] = answers[kind][key];
    (next as Record<DraftKind, unknown>)[kind] = values;
  }
  return next;
}

/** What the author changed on the draft, by what each item says, so it can follow them onto another round. */
function touched(current: OrganiseDraft, offered: OrganiseDraft, round: OrganiseRound): Partial<Record<DraftKind, Record<string, unknown>>> {
  const keys = keysOf(round);
  return Object.fromEntries(
    KINDS.map(kind => [kind, Object.fromEntries([...keys[kind]].filter(([id]) => !same(current[kind][id], offered[kind][id])).map(([id, key]) => [key, current[kind][id]]))]),
  );
}

/** A new round has new ids, so what the author changed on the last one follows them by what it says; anything only shown takes the new default. */
export function nextOrganiseDraft(current: OrganiseDraft, offered: OrganiseDraft, previous: OrganiseRound | null, next: OrganiseRound | null): OrganiseDraft {
  const fresh = organiseDraftFrom(next);
  if (previous == null || next == null) return fresh;
  return applyAnswers(fresh, next, touched(current, offered, previous));
}

function suggestionAnswers(entries: LedgerEntryResponse[]): Record<string, SuggestionAnswer> {
  const byText = (topic: string, kind: string): LedgerEntryResponse[] => entries.filter(entry => entry.topic === topic && entry.kind === kind);
  return Object.fromEntries([
    ...byText(ORGANISE_RULED_OUT_TOPIC, 'rejected').map(entry => [textDigest(organiseTextKey(entry.statement)), { verdict: 'reject' as const, reason: entry.why ?? '' }]),
    ...byText(ORGANISE_ACCEPTED_TOPIC, 'direction').map(entry => [textDigest(organiseTextKey(entry.statement)), { verdict: 'accept' as const, reason: '' }]),
  ]);
}

/**
 * What the author already locked, on whichever round is on screen: every item that says the same as one they answered takes that answer,
 * and what they accepted or turned down follows the suggestion wherever it is offered again. Null when nothing was locked.
 */
export function restoreOrganiseDraft(entries: LedgerEntryResponse[], round: OrganiseRound | null): OrganiseDraft | null {
  if (round == null) return null;
  const answers = decisionPayload(lockedDecision(entries, ORGANISE_TOPIC))['answers'] as Partial<Record<DraftKind, Record<string, unknown>>> | undefined;
  const suggestions = suggestionAnswers(entries);
  if (answers == null && Object.keys(suggestions).length === 0) return null;
  const locked = applyAnswers(organiseDraftFrom(round), round, { ...(answers ?? {}), suggestions: {} });
  const fromNotebook = applyAnswers(locked, round, { suggestions });
  return { ...fromNotebook, events: sanitisedEvents(fromNotebook.events) };
}

function sanitisedEvents(events: OrganiseDraft['events']): OrganiseDraft['events'] {
  return Object.fromEntries(
    Object.entries(events).flatMap(([id, value]) => {
      const answer = value as { kept?: unknown; band?: unknown };
      return isTimelineBand(answer.band) ? [[id, { kept: answer.kept === true, band: answer.band }]] : [];
    }),
  );
}

/** A restored answer goes UNDER what the author has already touched this session, never over it. */
export function mergeRestored(current: OrganiseDraft, offered: OrganiseDraft, restored: OrganiseDraft): OrganiseDraft {
  const merged = { ...restored };
  for (const kind of KINDS) {
    const values: Record<string, unknown> = { ...restored[kind] };
    for (const id of Object.keys(current[kind])) if (!same(current[kind][id], offered[kind][id])) values[id] = current[kind][id];
    (merged as Record<DraftKind, unknown>)[kind] = values;
  }
  return merged;
}

export function organiseNotesChanged(round: OrganiseRound | null, entries: LedgerEntryResponse[]): boolean {
  if (round == null || !round.notesDigest) return false;
  const brief = entries.find(entry => entry.kind === 'direction' && entry.topic === AUTHOR_BRIEF_TOPIC);
  return brief != null && textDigest(brief.statement) !== round.notesDigest;
}

export type PageInclusion = 'all' | 'some' | 'none';

export function pageInclusion(page: OrganisePage, draft: OrganiseDraft): PageInclusion {
  const kept = page.sections.filter(section => draft.sections[section.id]).length;
  return kept === 0 ? 'none' : kept === page.sections.length ? 'all' : 'some';
}

/** The page's own box: anything kept → nothing; nothing kept → what the notes state. An inferred section only ever joins by its own box. */
export function togglePage(draft: OrganiseDraft, page: OrganisePage): OrganiseDraft {
  const keep = pageInclusion(page, draft) === 'none';
  return { ...draft, sections: { ...draft.sections, ...Object.fromEntries(page.sections.map(section => [section.id, keep && section.source === 'notes'])) } };
}

export function moveEvent(draft: OrganiseDraft, eventId: string, band: TimelineBand): OrganiseDraft {
  const current = draft.events[eventId];
  return current ? { ...draft, events: { ...draft.events, [eventId]: { ...current, band } } } : draft;
}

export function answerSuggestion(draft: OrganiseDraft, suggestionId: string, answer: SuggestionAnswer): OrganiseDraft {
  return { ...draft, suggestions: { ...draft.suggestions, [suggestionId]: answer } };
}

export function eventsByBand(round: OrganiseRound, draft: OrganiseDraft): { band: TimelineBand; events: OrganiseEvent[] }[] {
  return TIMELINE_BANDS.map(band => ({ band, events: round.timeline.filter(event => (draft.events[event.id]?.band ?? event.band) === band) }));
}

export function recordsByType(round: OrganiseRound): { type: OrganiseRecordType; records: OrganiseRecord[] }[] {
  return ORGANISE_RECORD_TYPES.map(type => ({ type, records: round.records.filter(record => record.type === type) })).filter(group => group.records.length > 0);
}

export function pageSectionLabel(page: Pick<OrganisePage, 'section'>): string {
  return PAGE_SECTION_LABELS[page.section] ?? 'Story Bible';
}

export function keptPages(round: OrganiseRound, draft: OrganiseDraft): OrganisePage[] {
  return round.pages.filter(page => pageInclusion(page, draft) !== 'none');
}

export function unbackedPages(round: OrganiseRound, draft: OrganiseDraft): OrganisePage[] {
  const types = new Set(round.records.filter(record => draft.records[record.id]).map(record => record.type));
  return keptPages(round, draft).filter(page => page.needs.length > 0 && !page.needs.some(type => types.has(type)));
}

export function needsWords(needs: OrganiseRecordType[]): string {
  const words = needs.map(type => ORGANISE_RECORD_TYPE_WORDS[type]);
  return words.length <= 1 ? (words[0] ?? 'a record') : `${words.slice(0, -1).join(', ')} or ${words.at(-1)}`;
}

export function suggestionPage(round: OrganiseRound, suggestion: OrganiseSuggestion): OrganisePage | undefined {
  return round.pages.find(page => page.id === suggestion.pageId);
}

export function reasonLength(reason: string): number {
  return [...reason.trim()].length;
}

/** Why the lock is unavailable, in the author's words. `buildOrganiseSelection` refuses exactly when this answers. */
export function organiseLockIssue(round: OrganiseRound, draft: OrganiseDraft): string | null {
  const counts = organiseCounts(round, draft);
  if (counts.pages + counts.records + counts.events + counts.rules + counts.questions === 0) {
    return 'Keep at least one thing to add — a page, a record, a timeline event, a rule or an open question.';
  }
  const orphan = round.suggestions.find(item => draft.suggestions[item.id]?.verdict === 'accept' && pageInclusion(suggestionPage(round, item) as OrganisePage, draft) === 'none');
  if (orphan) return `You accepted a suggestion for “${suggestionPage(round, orphan)?.title}”, which you left out. Keep part of that page, or undo the acceptance.`;
  const [unbacked] = unbackedPages(round, draft);
  if (unbacked) return `“${unbacked.title}” needs at least one record kept that is ${needsWords(unbacked.needs)}.`;
  const tooLong = round.suggestions.find(item => draft.suggestions[item.id]?.verdict === 'reject' && reasonLength(draft.suggestions[item.id]?.reason ?? '') > ORGANISE_REASON_MAX);
  if (tooLong) return `Your reason for turning down a suggestion is over ${ORGANISE_REASON_MAX} characters. Shorten it first.`;
  return null;
}

export interface OrganiseCounts {
  pages: number;
  records: number;
  events: number;
  rules: number;
  questions: number;
  accepted: number;
  rejected: number;
  undecided: number;
}

export function organiseCounts(round: OrganiseRound, draft: OrganiseDraft): OrganiseCounts {
  const verdicts = round.suggestions.map(item => draft.suggestions[item.id]?.verdict ?? null);
  return {
    pages: keptPages(round, draft).length,
    records: round.records.filter(record => draft.records[record.id]).length,
    events: round.timeline.filter(event => draft.events[event.id]?.kept).length,
    rules: round.rules.filter(rule => draft.rules[rule.id]).length,
    questions: round.questions.filter(item => draft.questions[item.id]).length,
    accepted: verdicts.filter(verdict => verdict === 'accept').length,
    rejected: verdicts.filter(verdict => verdict === 'reject').length,
    undecided: verdicts.filter(verdict => verdict === null).length,
  };
}

export interface OrganiseRemovals {
  /** Records the last lock made that are no longer kept: removed unless someone has changed or claimed them since. */
  records: string[];
  /** Pages the last lock wrote into that are no longer kept: its own sections come off them. */
  pages: number;
}

/** What locking again takes out of the Story Bible, read from what the last lock wrote. */
export function organiseRemovals(entries: LedgerEntryResponse[], round: OrganiseRound, draft: OrganiseDraft): OrganiseRemovals {
  const payload = decisionPayload(lockedDecision(entries, ORGANISE_TOPIC));
  const keptNames = new Set(round.records.filter(record => draft.records[record.id]).map(record => organiseTextKey(record.name)));
  const keptPagesAt = new Set(keptPages(round, draft).map(page => `${page.section}/${page.slug}`));
  const records = passList(payload['records']).flatMap(item => {
    const name = passText((item as { name?: unknown }).name);
    return name && !keptNames.has(organiseTextKey(name)) ? [name] : [];
  });
  const pages = passList(payload['pages']).filter(item => {
    const page = item as { section?: unknown; slug?: unknown };
    return !keptPagesAt.has(`${passText(page.section)}/${passText(page.slug)}`);
  }).length;
  return { records, pages };
}

function count(value: number, one: string, many: string): string {
  return `${value} ${value === 1 ? one : many}`;
}

function listed(parts: string[]): string {
  return parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}

/** One line of counts for the top of the screen, saying first how many suggestions still need the author. */
export function organiseOverview(round: OrganiseRound, counts: OrganiseCounts): string {
  const parts = [
    round.suggestions.length > 0 ? (counts.undecided > 0 ? `${count(counts.undecided, 'suggestion needs', 'suggestions need')} a decision` : 'Every suggestion answered') : null,
    count(round.pages.length, 'page', 'pages'),
    count(round.records.length, 'record', 'records'),
    count(round.timeline.length, 'timeline event', 'timeline events'),
    count(round.questions.length, 'open question', 'open questions'),
  ].filter((part): part is string => part !== null);
  return parts.join(' · ');
}

/** Exactly what the lock will write and take out, and what undoing it can and cannot reach. */
export function organiseLockSummary(counts: OrganiseCounts, removals: OrganiseRemovals): string {
  const bible = listed(
    [
      counts.pages > 0 ? count(counts.pages, 'page', 'pages') : '',
      counts.records > 0 ? count(counts.records, 'record', 'records') : '',
      counts.events > 0 ? `a timeline of ${count(counts.events, 'event', 'events')}` : '',
      counts.questions > 0 ? count(counts.questions, 'open question', 'open questions') : '',
    ].filter(Boolean),
  );
  const removing = listed(
    [
      removals.records.length > 0 ? `${count(removals.records.length, 'record', 'records')} (${removals.records.join(', ')})` : '',
      removals.pages > 0 ? `its sections on ${count(removals.pages, 'page', 'pages')}` : '',
    ].filter(Boolean),
  );
  const sentences = [
    bible ? `Adds ${bible} to your Story Bible.` : '',
    removing ? `Takes out what it added before and you have now left out: ${removing}, unless you or a later step changed it since.` : '',
    counts.rules > 0 ? `${count(counts.rules, 'rule goes', 'rules go')} to your Notebook for every later step.` : '',
    counts.accepted > 0 ? `${count(counts.accepted, 'suggestion you accepted is', 'suggestions you accepted are')} written in.` : '',
    counts.rejected > 0 ? `${count(counts.rejected, 'suggestion you turned down is', 'suggestions you turned down are')} never offered again.` : '',
    'Undoing it from change history restores the Story Bible; the rules and your answers to suggestions stay in your Notebook, where you can withdraw them.',
  ];
  return sentences.filter(Boolean).join(' ');
}

export interface OrganiseSelectionBody {
  sections: string[];
  records: string[];
  timeline: { optionId: string; band: TimelineBand }[];
  rules: string[];
  questions: string[];
  suggestions: { optionId: string; verdict: SuggestionVerdict; reason?: string }[];
}

export function buildOrganiseSelection(round: OrganiseRound, draft: OrganiseDraft): OrganiseSelectionBody | null {
  if (organiseLockIssue(round, draft)) return null;
  return {
    sections: round.pages.flatMap(page => page.sections.filter(section => draft.sections[section.id]).map(section => section.id)),
    records: round.records.filter(record => draft.records[record.id]).map(record => record.id),
    timeline: round.timeline.flatMap(event => {
      const answer = draft.events[event.id];
      return answer?.kept ? [{ optionId: event.id, band: answer.band }] : [];
    }),
    rules: round.rules.filter(rule => draft.rules[rule.id]).map(rule => rule.id),
    questions: round.questions.filter(item => draft.questions[item.id]).map(item => item.id),
    suggestions: round.suggestions.flatMap(item => {
      const answer = draft.suggestions[item.id];
      if (!answer?.verdict) return [];
      const reason = answer.reason.trim();
      return [{ optionId: item.id, verdict: answer.verdict, ...(answer.verdict === 'reject' && reason ? { reason } : {}) }];
    }),
  };
}

/** Suggestions turned down before organising again travel with the round, so the next one is told not to offer them. */
export function organiseRoundFeedback(round: OrganiseRound | null, draft: OrganiseDraft): OptionVerdicts {
  if (round == null) return {};
  return Object.fromEntries(
    round.suggestions.flatMap(item => {
      const answer = draft.suggestions[item.id];
      if (answer?.verdict !== 'reject') return [];
      const reason = answer.reason.trim();
      return [[item.id, reason && reasonLength(reason) <= ORGANISE_REASON_MAX ? { verdict: 'not' as const, reason } : { verdict: 'not' as const }]];
    }),
  );
}

/** Honest about how long a round takes: a long starting point takes the pass longer, and may run past the time limit. */
export function organiseRunningLabel(notesWords: number): string {
  return notesWords > ORGANISE_LONG_NOTES_WORDS
    ? 'Organising your notes. This usually takes a few minutes; notes this long can take longer, or run past the time limit. You can leave this page and come back.'
    : 'Organising your notes. This usually takes a few minutes. You can leave this page and come back.';
}

/** The round's own reason it failed, with advice on the one failure organising can do something about: a model call that did not finish. */
export function organiseFailureMessage(error: string | null, notesWords: number, hasEarlier: boolean): string {
  const modelCall = error === ROUND_MODEL_CALL_FAILED;
  const advice = !modelCall
    ? ''
    : notesWords > ORGANISE_LONG_NOTES_WORDS
      ? 'Notes this long can run past the time limit. Try again, trim the starting point, or steer it toward fewer, fuller pages.'
      : 'Try again, or steer it toward fewer, fuller pages.';
  const earlier = hasEarlier ? 'Your last organisation is still below, and you can still add it.' : '';
  return [error ?? 'The round stopped before it produced anything. Nothing was saved.', advice, earlier].filter(Boolean).join(' ');
}

/** A page whose every section is inferred has no notes-only answer for its own box to restore: its sections are chosen one by one. */
export function pageAllInferred(page: OrganisePage): boolean {
  return page.sections.every(section => section.source === 'inferred');
}
