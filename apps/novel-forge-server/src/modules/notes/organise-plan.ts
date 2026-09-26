import { Field, Schema } from '@shadow-library/class-schema';
import {
  ORGANISE_ACCEPTED_TOPIC,
  ORGANISE_REASON_MAX,
  ORGANISE_RULED_OUT_TOPIC,
  ORGANISE_RULES_TOPIC,
  ORGANISE_TOPIC,
  organiseRecordKey,
  organiseSectionKey,
  organiseTextKey,
  SUGGESTION_VERDICTS,
  type SuggestionVerdict,
  textDigest,
  TIMELINE_BAND_LABELS,
  TIMELINE_BANDS,
  type TimelineBand,
} from '@shadow-library/sdk';

import { AppErrorCode } from '@server/classes';
import { type Ledger, type PrimaryTransaction } from '@server/database';

import { type NotesOrganiseOutput } from '../ai/schemas/notes-organise.schema';
import { countWords } from '../eval/deterministic-metrics';
import { AUTHOR_BRIEF_TOPIC } from '../ledger/ledger-sections';
import { type NewLedgerEntry } from '../ledger/ledger.types';
import { type ContentOp, type OpType } from '../refinement/change-set';
import { type PageRef, type PageSection } from './bible-page';
import { lockedLinks } from './content-keys';
import {
  addressOf,
  loadPages,
  ownPageWrite,
  pageBody,
  pageLine,
  recordWrite,
  refuseSelection,
  samePage,
  sharedPageWrite,
  withBacking,
  writtenBefore,
  type WrittenSection,
} from './organise-content';
import {
  type OrganiseOptions,
  type OrganisePageOption,
  type OrganiseQuestionOption,
  type OrganiseRecordOption,
  organiseRound,
  type OrganiseSuggestionOption,
  uniqueBy,
} from './organise-round';
import { OPEN_QUESTIONS_PAGE, ORGANISE_STEP_KEY, TIMELINE_PAGE } from './organised-pages';

export const ORGANISE_MIN_WORDS = 600;

/** Everything organising may write, for the host that applies a plan as the author's own change. */
export const ORGANISE_CHANGE_OPS: readonly OpType[] = ['bible_document.upsert', 'bible_document.remove', 'entity.upsert', 'entity.remove'];

const TIMELINE_TITLE = 'Timeline';
const TIMELINE_LEAD = 'The events your notes describe, placed where your notes place them. “Not yet placed” means your notes do not say when yet.';
const QUESTIONS_TITLE = 'Open questions';
const QUESTIONS_LEAD = 'What your notes leave open, most important first, and why each matters for the first chapters.';
const QUESTIONS_HEADING = 'Still to decide';

@Schema()
export class OrganiseEventChoice {
  @Field({ pattern: '^t[0-9]+$' })
  optionId: string;

  @Field(() => String, { enum: [...TIMELINE_BANDS], description: 'Where the author places it, which may differ from where the round did.' })
  band: TimelineBand;
}

@Schema()
export class OrganiseSuggestionChoice {
  @Field({ pattern: '^s[0-9]+$' })
  optionId: string;

  @Field(() => String, { enum: [...SUGGESTION_VERDICTS] })
  verdict: SuggestionVerdict;

  @Field({ optional: true, maxLength: ORGANISE_REASON_MAX, description: 'Why the author turned it down; only read on a rejection.' })
  reason?: string;
}

@Schema()
export class OrganiseSelection {
  @Field(() => [String], { maxItems: 400, description: 'The page sections the author keeps; a page is written when any of its sections is.' })
  sections: string[];

  @Field(() => [String], { maxItems: 100 })
  records: string[];

  @Field(() => [OrganiseEventChoice], { maxItems: 100 })
  timeline: OrganiseEventChoice[];

  @Field(() => [String], { maxItems: 100 })
  rules: string[];

  @Field(() => [String], { maxItems: 100 })
  questions: string[];

  @Field(() => [OrganiseSuggestionChoice], { maxItems: 100, description: 'Only the suggestions the author answered; one left out stays undecided and writes nothing.' })
  suggestions: OrganiseSuggestionChoice[];
}

export interface OrganiseOption {
  id: string;
  label: string;
}

export interface OrganisedRound {
  options: OrganiseOptions;
  coachMessage: string;
}

export interface LockedOrganiseRound {
  round: number;
  options: OrganiseOptions;
}

export interface OrganisePlanContext {
  /** The latest organised round; an answer is only ever given against it. */
  round: LockedOrganiseRound | null;
  ledger: Ledger.Entry[];
  projectId: bigint;
  tx: PrimaryTransaction;
}

/** Written to the ledger only through `reconcileOrganiseEntries`, which gives `replaces`, `retires` and `withdraws` their meaning. */
export interface OrganisePlan {
  entries: NewLedgerEntry[];
  /** Content ops only, applied as the author's own change so change history and revert cover it. */
  changeSet: ContentOp[];
  summary: string;
  /** Topics whose earlier organise entries this answer supersedes or retires. */
  replaces: string[];
  /** The question ids (`payload.optionId`) of earlier rules and accepted suggestions, which this answer settles again whatever it keeps. */
  retires: string[];
  /** Earlier refusals of a suggestion the author has now accepted, taken back by id. */
  withdraws: bigint[];
}

interface KeptPage {
  page: OrganisePageOption;
  sections: PageSection[];
}

interface OrganiseAnswer {
  pages: KeptPage[];
  records: OrganiseRecordOption[];
  events: { event: string; band: TimelineBand }[];
  rules: string[];
  questions: OrganiseQuestionOption[];
  accepted: { suggestion: OrganiseSuggestionOption; page: OrganisePageOption }[];
  rejected: { suggestion: OrganiseSuggestionOption; reason: string | null }[];
}

function pick<T extends { id: string }>(items: T[], ids: string[]): T[] {
  const byId = new Map(items.map(item => [item.id, item]));
  return [...new Set(ids)].map(id => {
    const item = byId.get(id);
    if (!item) throw AppErrorCode.NTS_002.create({ optionId: id });
    return item;
  });
}

function withAdditions(sections: PageSection[], additions: OrganiseSuggestionOption[]): PageSection[] {
  const merged = sections.map(section => ({ ...section }));
  for (const addition of additions) {
    const heading = pageLine(addition.section);
    const target = merged.find(section => organiseTextKey(section.heading) === organiseTextKey(heading));
    if (target) target.body = `${target.body}\n\n${pageBody(addition.text)}`;
    else merged.push({ heading, body: pageBody(addition.text) });
  }
  return merged;
}

function answerOf(selection: OrganiseSelection, options: OrganiseOptions): OrganiseAnswer {
  const sectionIds = new Set(selection.sections);
  pick(
    options.pages.flatMap(page => page.sections),
    selection.sections,
  );

  const decided = uniqueBy(selection.suggestions, choice => choice.optionId);
  const suggestions = pick(
    options.suggestions,
    decided.map(choice => choice.optionId),
  );
  const verdicts = new Map(decided.map(choice => [choice.optionId, choice]));
  const pageById = new Map(options.pages.map(page => [page.id, page]));
  const kept = options.pages.map(page => ({ page, sections: page.sections.filter(section => sectionIds.has(section.id)) })).filter(page => page.sections.length > 0);
  const keptIds = new Set(kept.map(({ page }) => page.id));

  const accepted = suggestions
    .filter(suggestion => verdicts.get(suggestion.id)?.verdict === 'accept')
    .map(suggestion => ({ suggestion, page: pageById.get(suggestion.pageId) as OrganisePageOption }));
  const orphan = accepted.find(({ page }) => !keptIds.has(page.id));
  if (orphan) refuseSelection(`a suggestion you accepted belongs on “${orphan.page.title}”, which you left out — keep that page or leave the suggestion undecided`);

  const events = pick(
    options.timeline,
    selection.timeline.map(choice => choice.optionId),
  );
  const bands = new Map(selection.timeline.map(choice => [choice.optionId, choice.band]));

  return {
    pages: kept.map(({ page, sections }) => ({
      page,
      sections: withAdditions(
        sections.map(section => ({ heading: section.heading, body: section.body })),
        accepted.filter(item => item.page.id === page.id).map(item => item.suggestion),
      ),
    })),
    records: pick(options.records, selection.records),
    events: events.map(event => ({ event: event.event, band: bands.get(event.id) ?? event.band })),
    rules: pick(options.rules, selection.rules).map(rule => rule.rule),
    questions: pick(options.questions, selection.questions),
    accepted,
    rejected: suggestions
      .filter(suggestion => verdicts.get(suggestion.id)?.verdict === 'reject')
      .map(suggestion => ({ suggestion, reason: verdicts.get(suggestion.id)?.reason?.trim() || null })),
  };
}

function isEmptyAnswer(answer: OrganiseAnswer): boolean {
  return answer.pages.length + answer.records.length + answer.events.length + answer.rules.length + answer.questions.length === 0;
}

function timelineSections(events: OrganiseAnswer['events']): PageSection[] {
  return TIMELINE_BANDS.map(band => ({
    heading: TIMELINE_BAND_LABELS[band],
    body: events
      .filter(event => event.band === band)
      .map(event => `- ${pageLine(event.event)}`)
      .join('\n'),
  }));
}

function questionSections(questions: OrganiseQuestionOption[]): PageSection[] {
  return [{ heading: QUESTIONS_HEADING, body: questions.map((item, index) => `${index + 1}. **${pageLine(item.question)}** ${pageLine(item.why)}`).join('\n') }];
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function organisedStatement(answer: OrganiseAnswer): string {
  const parts = [
    answer.pages.length > 0 ? plural(answer.pages.length, 'Story Bible page', 'Story Bible pages') : null,
    answer.records.length > 0 ? plural(answer.records.length, 'record', 'records') : null,
    answer.events.length > 0 ? `a timeline of ${plural(answer.events.length, 'event', 'events')}` : null,
    answer.questions.length > 0 ? plural(answer.questions.length, 'open question', 'open questions') : null,
  ].filter((part): part is string => part !== null);
  const listed = parts.length <= 1 ? (parts[0] ?? 'nothing') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
  return `The author's notes are organised into ${listed}.`;
}

/** Every item's answer under a digest of what it says, so a screen can put the author's answer back on any later round that says the same. */
function lockedAnswers(selection: OrganiseSelection, options: OrganiseOptions): Record<string, Record<string, unknown>> {
  const key = (text: string): string => textDigest(text);
  const sections = new Set(selection.sections);
  const records = new Set(selection.records);
  const bands = new Map(selection.timeline.map(choice => [choice.optionId, choice.band]));
  const rules = new Set(selection.rules);
  const questions = new Set(selection.questions);
  const verdicts = new Map(selection.suggestions.map(choice => [choice.optionId, choice]));
  const answered = (id: string) => {
    const choice = verdicts.get(id);
    return choice ? [{ verdict: choice.verdict, ...(choice.verdict === 'reject' && choice.reason?.trim() ? { reason: choice.reason.trim() } : {}) }] : [];
  };
  return {
    sections: Object.fromEntries(options.pages.flatMap(page => page.sections.map(section => [key(organiseSectionKey(page, section.heading)), sections.has(section.id)]))),
    records: Object.fromEntries(options.records.map(record => [key(organiseRecordKey(record)), records.has(record.id)])),
    events: Object.fromEntries(options.timeline.map(event => [key(organiseTextKey(event.event)), { kept: bands.has(event.id), band: bands.get(event.id) ?? event.band }])),
    rules: Object.fromEntries(options.rules.map(rule => [key(organiseTextKey(rule.rule)), rules.has(rule.id)])),
    questions: Object.fromEntries(options.questions.map(item => [key(organiseTextKey(item.question)), questions.has(item.id)])),
    suggestions: Object.fromEntries(options.suggestions.flatMap(item => answered(item.id).map(answer => [key(organiseTextKey(item.text)), answer]))),
  };
}

/** The question an entry answers, named by what it says: the same rule on a later round is the same answer, not a new one. */
function questionId(prefix: string, text: string): string {
  return `${prefix}_${textDigest(organiseTextKey(text))}`;
}

function activeOptionIds(ledger: Ledger.Entry[], topics: string[]): string[] {
  return ledger
    .filter(entry => entry.stepKey === ORGANISE_STEP_KEY && topics.includes(entry.topic))
    .flatMap(entry => {
      const optionId = (entry.payload as { optionId?: unknown } | null)?.optionId;
      return typeof optionId === 'string' ? [optionId] : [];
    });
}

/** A refusal already on the ledger is never written a second time: refusals survive every later answer. */
function withoutKnownRejections(entries: NewLedgerEntry[], ledger: Ledger.Entry[]): NewLedgerEntry[] {
  const said = (entry: Pick<Ledger.Entry, 'topic' | 'statement'>): string => `${entry.topic}|${entry.statement.trim().toLowerCase()}`;
  const known = new Set(ledger.filter(entry => entry.kind === 'rejected').map(said));
  return entries.filter(entry => entry.kind !== 'rejected' || !known.has(said(entry)));
}

function authored(entry: Omit<NewLedgerEntry, 'decidedBy' | 'stepKey'>): NewLedgerEntry {
  return { ...entry, decidedBy: 'author', stepKey: ORGANISE_STEP_KEY };
}

/** Once organised, the notes stay organisable whatever they become, so what organising wrote can always be revisited and its staleness shown. */
export function organiseApplies(ledger: Pick<Ledger.Entry, 'kind' | 'topic' | 'stepKey' | 'statement'>[]): boolean {
  if (ledger.some(entry => entry.kind === 'decision' && entry.topic === ORGANISE_TOPIC && entry.stepKey === ORGANISE_STEP_KEY)) return true;
  const notes = ledger.find(entry => entry.topic === AUTHOR_BRIEF_TOPIC);
  return notes !== undefined && countWords(notes.statement) >= ORGANISE_MIN_WORDS;
}

export function organiseOptions(output: NotesOrganiseOutput, ledger: Pick<Ledger.Entry, 'kind' | 'topic' | 'statement'>[]): OrganisedRound {
  const options = organiseRound(output, ledger);
  if (options.pages.length === 0 && options.timeline.length === 0) throw AppErrorCode.AI_001.create();
  return { options, coachMessage: output.coachMessage.trim() };
}

export function describeOrganiseOptions(options: OrganiseOptions): OrganiseOption[] {
  return [
    ...options.pages.flatMap(page => page.sections.map(section => ({ id: section.id, label: `${page.title} — ${section.heading}` }))),
    ...options.records.map(record => ({ id: record.id, label: record.name })),
    ...options.timeline.map(event => ({ id: event.id, label: event.event })),
    ...options.rules.map(rule => ({ id: rule.id, label: rule.rule })),
    ...options.questions.map(item => ({ id: item.id, label: item.question })),
    ...options.suggestions.map(suggestion => ({ id: suggestion.id, label: suggestion.text })),
  ];
}

export function chosenOrganiseOptionIds(selection: OrganiseSelection): string[] {
  return [
    ...selection.sections,
    ...selection.records,
    ...selection.timeline.map(choice => choice.optionId),
    ...selection.rules,
    ...selection.questions,
    ...selection.suggestions.map(choice => choice.optionId),
  ];
}

/** Hard rules become directions, never canon facts: organising the notes never mints a secret. */
export async function planOrganise(selection: OrganiseSelection, { round, ledger, projectId, tx }: OrganisePlanContext): Promise<OrganisePlan> {
  if (!round) refuseSelection('there is nothing organised to add yet — organise your notes first');
  const options = round.options;
  const answer = answerOf(selection, options);
  if (isEmptyAnswer(answer)) refuseSelection('keep at least one page section, record, timeline event, rule or open question');

  const before = writtenBefore(ledger);
  const previous = lockedLinks(ledger, ORGANISE_STEP_KEY, [ORGANISE_TOPIC]);
  const hadOwnPage = (page: PageRef): boolean => (previous.bibleDocuments ?? []).some(written => samePage(written, page));
  const kept = answer.pages.map(({ page }) => ({ section: page.section, slug: page.slug }));
  const stale = before.filter(page => !kept.some(address => samePage(address, page)));
  const stored = await loadPages(tx, projectId, [...kept, ...stale, TIMELINE_PAGE, OPEN_QUESTIONS_PAGE]);
  const bodyOf = (page: PageRef): string | null => stored.find(row => samePage(row, page))?.body ?? null;
  const writtenOn = (page: PageRef): WrittenSection[] => before.find(written => samePage(written, page))?.sections ?? [];

  const shared = [
    ...answer.pages.map(({ page, sections }) => sharedPageWrite(page, page.title, bodyOf(page), writtenOn(page), sections)),
    ...stale.map(page => sharedPageWrite(page, page.slug, bodyOf(page), page.sections, [])),
  ];
  const timeline =
    hadOwnPage(TIMELINE_PAGE) || answer.events.length > 0 ? ownPageWrite(TIMELINE_PAGE, TIMELINE_TITLE, TIMELINE_LEAD, bodyOf(TIMELINE_PAGE), timelineSections(answer.events)) : [];
  const questions =
    hadOwnPage(OPEN_QUESTIONS_PAGE) || answer.questions.length > 0
      ? ownPageWrite(OPEN_QUESTIONS_PAGE, QUESTIONS_TITLE, QUESTIONS_LEAD, bodyOf(OPEN_QUESTIONS_PAGE), questionSections(answer.questions))
      : [];
  const records = await recordWrite(answer.records, ledger, tx, projectId);
  const backed = answer.pages.map(({ page }) => ({ section: page.section, slug: page.slug, title: page.title }));
  const changeSet = await withBacking([...records.ops, ...shared.flatMap(write => write.ops), ...timeline, ...questions], backed, tx, projectId);

  const written = shared.flatMap(write => (write.written ? [write.written] : []));
  const pagesWritten: PageRef[] = [
    ...written.map(page => ({ section: page.section, slug: page.slug })),
    ...(answer.events.length > 0 ? [TIMELINE_PAGE] : []),
    ...(answer.questions.length > 0 ? [OPEN_QUESTIONS_PAGE] : []),
  ];
  const decision = authored({
    kind: 'decision',
    topic: ORGANISE_TOPIC,
    statement: organisedStatement(answer),
    payload: { notesDigest: options.notesDigest, round: round.round, pages: written, records: records.written, answers: lockedAnswers(selection, options) },
    links: { bibleDocuments: pagesWritten, entityKeys: records.written.map(record => record.entityKey) },
  });
  const rules = answer.rules.map(rule => authored({ kind: 'direction', topic: ORGANISE_RULES_TOPIC, statement: rule, payload: { optionId: questionId('rule', rule) } }));
  const accepted = answer.accepted.map(({ suggestion, page }) =>
    authored({
      kind: 'direction',
      topic: ORGANISE_ACCEPTED_TOPIC,
      statement: suggestion.text,
      why: suggestion.why,
      payload: { optionId: questionId('suggestion', suggestion.text), page: addressOf(page), section: suggestion.section },
      links: { bibleDocuments: [{ section: page.section, slug: page.slug }] },
    }),
  );
  const rejected = answer.rejected.map(({ suggestion, reason }) => authored({ kind: 'rejected', topic: ORGANISE_RULED_OUT_TOPIC, statement: suggestion.text, why: reason }));
  const acceptedTexts = new Set(answer.accepted.map(({ suggestion }) => organiseTextKey(suggestion.text)));

  return {
    entries: withoutKnownRejections([decision, ...rules, ...accepted, ...rejected], ledger),
    changeSet,
    summary: 'Your notes, organised',
    replaces: [ORGANISE_TOPIC, ORGANISE_RULES_TOPIC, ORGANISE_ACCEPTED_TOPIC],
    retires: activeOptionIds(ledger, [ORGANISE_RULES_TOPIC, ORGANISE_ACCEPTED_TOPIC]),
    withdraws: ledger
      .filter(
        entry =>
          entry.kind === 'rejected' && entry.topic === ORGANISE_RULED_OUT_TOPIC && entry.stepKey === ORGANISE_STEP_KEY && acceptedTexts.has(organiseTextKey(entry.statement)),
      )
      .map(entry => entry.id),
  };
}
