import { and, eq, isNotNull, ne } from 'drizzle-orm';

import { revealTermPattern } from '@server/common';
import { type Knowledge, type PrimaryDatabase, schema } from '@server/database';

import { clipAtBoundary } from './bible-docs';
import { countTokens } from './token-budget';

export interface ChapterSpan {
  start: number;
  end: number;
}

export interface ScheduledReveal {
  factKey: string;
  revealChapter: number;
  terms: string[];
  writerNote: string | null;
}

/** `advised` are the reveals the rendered schedule names, worth one repair; `all` is every later reveal, which the final guard sanitises against. */
export interface RevealGuard {
  advised: ScheduledReveal[];
  all: ScheduledReveal[];
}

/** Carries only keys, field paths and chapter numbers, so it is safe to log. */
export interface RevealViolation {
  subject: string;
  field: string;
  factKey: string;
  revealChapter: number;
}

interface GuardLines {
  lines: string[];
  omitted: number;
}

type RevealFactRow = Pick<Knowledge.CanonFact, 'factKey' | 'revealChapter' | 'terms' | 'source' | 'writerNote'>;
type LimitEntityRow = Pick<Knowledge.Entity, 'entityKey' | 'type' | 'body' | 'notes'>;

interface LimitWorldFactRow {
  category: string;
  key: string;
  value: string;
}

interface PlannedScene {
  goal?: string;
  obstacle?: string;
  turn?: string;
  beats?: string[];
}

interface PlannedBrief {
  chapter: number;
  title?: string;
  objective?: string;
  events?: string[];
  scenes?: PlannedScene[];
  chapterPurpose?: string;
  handoffBeat?: string;
  repetitionRisks?: string[];
  endingContract?: { emotionalBeat?: string; openQuestion?: string; handoffState?: string; mustNotResolve?: string[] };
  knowledgeContract?: { learns?: { factKey: string }[] };
}

interface PlannedArc {
  arcKey: string;
  chapterEnd: number;
  title?: string;
  objective?: string;
  escalation?: string;
  payoff?: string;
  hook?: string;
  body?: string;
  ideas?: string[];
}

const REVEAL_SCHEDULE_BUDGET = 1_200;
const HARD_LIMIT_BUDGET = 1_500;
const HARD_LIMIT_CHARS = 400;
const LIMIT_CATEGORY_WORDS: ReadonlySet<string> = new Set(['limit', 'constraint', 'rule', 'cost', 'forbidden', 'restriction', 'law', 'taboo', 'power']);
const LEARNS_FIELD = 'knowledgeContract.learns';

function byKey(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Seed facts are reader promises the book obeys openly, so only the author's scheduled secrets are guarded. */
export function scheduledReveals(facts: readonly RevealFactRow[]): ScheduledReveal[] {
  return facts
    .filter((fact): fact is RevealFactRow & { revealChapter: number } => fact.revealChapter !== null && fact.source !== 'seed')
    .map(fact => ({
      factKey: fact.factKey,
      revealChapter: fact.revealChapter,
      terms: (fact.terms ?? []).filter(term => term.trim().length > 0),
      writerNote: fact.writerNote?.trim() || null,
    }))
    .sort((left, right) => left.revealChapter - right.revealChapter || byKey(left.factKey, right.factKey));
}

/** Moves every reveal after `afterChapter` one chapter later, as a chapter insert will once it commits. */
export function shiftRevealsForInsert<T extends { revealChapter: number | null }>(facts: readonly T[], afterChapter: number): T[] {
  return facts.map(fact => (fact.revealChapter !== null && fact.revealChapter > afterChapter ? { ...fact, revealChapter: fact.revealChapter + 1 } : fact));
}

function fitLines<T>(items: readonly T[], render: (item: T) => string, budget: number): { kept: T[]; lines: string[] } {
  const kept: T[] = [];
  const lines: string[] = [];
  let used = 0;
  for (const item of items) {
    const line = render(item);
    const tokens = countTokens(line) + 1;
    if (used + tokens > budget) break;
    kept.push(item);
    lines.push(line);
    used += tokens;
  }
  return { kept, lines };
}

function termsNote(reveal: ScheduledReveal): string {
  return reveal.terms.length > 0 ? `; never name: ${reveal.terms.join(', ')}` : '';
}

function scheduleLine(reveal: ScheduledReveal, span: ChapterSpan): string {
  const rule = reveal.revealChapter > span.end ? 'hidden for this whole span' : `nothing before ch ${reveal.revealChapter} may surface it`;
  return `${reveal.factKey} — reveals ch ${reveal.revealChapter}: ${rule}${termsNote(reveal)}`;
}

// Earliest reveals first: those landing inside the span are the ones a planner is most tempted to pull forward.
function fitSchedule(reveals: readonly ScheduledReveal[], span: ChapterSpan): { kept: ScheduledReveal[]; lines: string[]; candidates: number } {
  const candidates = reveals.filter(reveal => reveal.revealChapter > span.start);
  return { ...fitLines(candidates, reveal => scheduleLine(reveal, span), REVEAL_SCHEDULE_BUDGET), candidates: candidates.length };
}

export function renderRevealSchedule(reveals: readonly ScheduledReveal[], span: ChapterSpan): GuardLines {
  const { lines, candidates } = fitSchedule(reveals, span);
  return { lines, omitted: candidates - lines.length };
}

/** The repair only hears about reveals the rendered schedule names; the final guard covers every later reveal regardless. */
export function revealGuard(reveals: readonly ScheduledReveal[], span: ChapterSpan): RevealGuard {
  return { advised: fitSchedule(reveals, span).kept, all: reveals.filter(reveal => reveal.revealChapter > span.start) };
}

export async function loadRevealGuard(db: Pick<PrimaryDatabase, 'query'>, projectId: bigint, span: ChapterSpan, insertAfter?: number): Promise<RevealGuard> {
  const facts = await db.query.canonFacts.findMany({
    columns: { factKey: true, revealChapter: true, terms: true, source: true, writerNote: true },
    where: and(eq(schema.canonFacts.projectId, projectId), isNotNull(schema.canonFacts.revealChapter), ne(schema.canonFacts.source, 'seed')),
  });
  return revealGuard(scheduledReveals(insertAfter === undefined ? facts : shiftRevealsForInsert(facts, insertAfter)), span);
}

export function isLimitCategory(category: string): boolean {
  return category
    .toLowerCase()
    .split(/[^a-z]+/)
    .some(word => LIMIT_CATEGORY_WORDS.has(word) || (word.endsWith('s') && LIMIT_CATEGORY_WORDS.has(word.slice(0, -1))));
}

export function renderHardLimits(entities: readonly LimitEntityRow[], worldFacts: readonly LimitWorldFactRow[]): GuardLines {
  const powerLines = entities
    .filter(entity => entity.type === 'power_rule')
    .sort((left, right) => byKey(left.entityKey, right.entityKey))
    .map(entity => ({ entity, rule: clipAtBoundary(entity.body?.trim() || entity.notes?.trim() || '', HARD_LIMIT_CHARS) }))
    .filter(({ rule }) => rule.length > 0)
    .map(({ entity, rule }) => `entity:${entity.entityKey} — ${rule}`);
  const factLines = worldFacts
    .filter(fact => isLimitCategory(fact.category) && fact.value.trim().length > 0)
    .sort((left, right) => byKey(left.category, right.category) || byKey(left.key, right.key))
    .map(fact => `world_fact:${fact.category}/${fact.key} — ${clipAtBoundary(fact.value, HARD_LIMIT_CHARS)}`);
  const all = [...powerLines, ...factLines];
  const { lines } = fitLines(all, line => line, HARD_LIMIT_BUDGET);
  return { lines, omitted: all.length - lines.length };
}

function mentionsTerm(text: string, term: string): boolean {
  return revealTermPattern(term)?.test(text) ?? false;
}

function firstMentioningField(fields: [string, string | undefined][], reveal: ScheduledReveal): string | null {
  for (const [field, text] of fields) {
    if (text && reveal.terms.some(term => mentionsTerm(text, term))) return field;
  }
  return null;
}

export function renderRevealViolation({ subject, field, factKey, revealChapter }: RevealViolation): string {
  const schedule = `whose reveal is scheduled for chapter ${revealChapter}`;
  if (field === LEARNS_FIELD) return `${subject} ${LEARNS_FIELD} names ${factKey}, ${schedule} — move the discovery there`;
  return `${subject} ${field} names a REVEAL SCHEDULE term of ${factKey}, ${schedule} — keep it out until then`;
}

function sceneFields(scene: PlannedScene, index: number): [string, string | undefined][] {
  const path = `scenes[${index}]`;
  return [
    [`${path}.goal`, scene.goal],
    [`${path}.obstacle`, scene.obstacle],
    [`${path}.turn`, scene.turn],
    ...(scene.beats ?? []).map((beat, beatIndex): [string, string] => [`${path}.beats[${beatIndex}]`, beat]),
  ];
}

/** One violation per brief and fact, so a repair sees each leak once. */
export function findBriefRevealViolations(briefs: readonly PlannedBrief[], reveals: readonly ScheduledReveal[]): RevealViolation[] {
  const violations: RevealViolation[] = [];
  for (const brief of briefs) {
    const subject = `chapter ${brief.chapter}`;
    const learned = new Set((brief.knowledgeContract?.learns ?? []).map(entry => entry.factKey));
    const fields: [string, string | undefined][] = [
      ['title', brief.title],
      ['objective', brief.objective],
      ...(brief.events ?? []).map((event, index): [string, string] => [`events[${index}]`, event]),
      ...(brief.scenes ?? []).flatMap(sceneFields),
      ['chapterPurpose', brief.chapterPurpose],
      ['handoffBeat', brief.handoffBeat],
      ['endingContract.emotionalBeat', brief.endingContract?.emotionalBeat],
      ['endingContract.openQuestion', brief.endingContract?.openQuestion],
      ['endingContract.handoffState', brief.endingContract?.handoffState],
      ...(brief.endingContract?.mustNotResolve ?? []).map((entry, index): [string, string] => [`endingContract.mustNotResolve[${index}]`, entry]),
      ...(brief.repetitionRisks ?? []).map((risk, index): [string, string] => [`repetitionRisks[${index}]`, risk]),
    ];
    for (const reveal of reveals) {
      if (reveal.revealChapter <= brief.chapter) continue;
      const field = learned.has(reveal.factKey) ? LEARNS_FIELD : firstMentioningField(fields, reveal);
      if (field) violations.push({ subject, field, factKey: reveal.factKey, revealChapter: reveal.revealChapter });
    }
  }
  return violations;
}

/** An arc may carry a reveal only when its range reaches the reveal chapter. */
export function findArcRevealViolations(arcs: readonly PlannedArc[], reveals: readonly ScheduledReveal[]): RevealViolation[] {
  const violations: RevealViolation[] = [];
  for (const arc of arcs) {
    const fields: [string, string | undefined][] = [
      ['title', arc.title],
      ['objective', arc.objective],
      ['escalation', arc.escalation],
      ['payoff', arc.payoff],
      ['hook', arc.hook],
      ['body', arc.body],
      ...(arc.ideas ?? []).map((idea, index): [string, string] => [`ideas[${index}]`, idea]),
    ];
    for (const reveal of reveals) {
      if (reveal.revealChapter <= arc.chapterEnd) continue;
      const field = firstMentioningField(fields, reveal);
      if (field) violations.push({ subject: `arc ${arc.arcKey}`, field, factKey: reveal.factKey, revealChapter: reveal.revealChapter });
    }
  }
  return violations;
}

// A sentence runs to its closing punctuation (plus any closing quote or bracket) or to the end of the text.
const SENTENCE = /[^.!?]+(?:[.!?]+["'”’)\]]*|$)\s*|[.!?]+\s*/gu;

interface Sanitiser {
  subject: string;
  reveals: readonly ScheduledReveal[];
  sanitised: RevealViolation[];
}

function firstHit(text: string, reveals: readonly ScheduledReveal[]): ScheduledReveal | undefined {
  return reveals.find(reveal => reveal.terms.some(term => mentionsTerm(text, term)));
}

function placeholderFor(reveal: ScheduledReveal, reveals: readonly ScheduledReveal[]): string {
  return [`(withheld until ch ${reveal.revealChapter})`, '(withheld)'].find(candidate => !firstHit(candidate, reveals)) ?? '…';
}

// A writer note stands in for the first sentence it replaces in a field; later sentences it would replace are dropped.
function cleanSentence(sentence: string, reveals: readonly ScheduledReveal[], usedNotes: Set<string>): string {
  const hit = firstHit(sentence, reveals);
  if (!hit) return sentence;
  if (!hit.writerNote || firstHit(hit.writerNote, reveals) || usedNotes.has(hit.writerNote)) return '';
  usedNotes.add(hit.writerNote);
  return `${hit.writerNote}${/\s*$/u.exec(sentence)?.[0] ?? ''}`;
}

/** Each offending sentence becomes the fact's writer note, or goes; a field that would end up empty gets a neutral placeholder. */
function sanitiseText(text: string, field: string, state: Sanitiser): string {
  const hit = firstHit(text, state.reveals);
  if (!hit) return text;
  state.sanitised.push({ subject: state.subject, field, factKey: hit.factKey, revealChapter: hit.revealChapter });
  const usedNotes = new Set<string>();
  const cleaned = (text.match(SENTENCE) ?? [text])
    .map(sentence => cleanSentence(sentence, state.reveals, usedNotes))
    .join('')
    .trim();
  return cleaned && !firstHit(cleaned, state.reveals) ? cleaned : placeholderFor(hit, state.reveals);
}

function sanitiseOptional(text: string | undefined, field: string, state: Sanitiser): string | undefined {
  return text === undefined ? undefined : sanitiseText(text, field, state);
}

function sanitiseList(items: readonly string[], field: string, state: Sanitiser): string[] {
  return items.filter((item, index) => {
    const hit = firstHit(item, state.reveals);
    if (hit) state.sanitised.push({ subject: state.subject, field: `${field}[${index}]`, factKey: hit.factKey, revealChapter: hit.revealChapter });
    return !hit;
  });
}

function withKnownKeys<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

function sanitiseScene<T extends PlannedScene>(scene: T, path: string, state: Sanitiser, placeholder: string): T {
  const beats = scene.beats === undefined ? undefined : sanitiseList(scene.beats, `${path}.beats`, state);
  return withKnownKeys({
    ...scene,
    goal: sanitiseOptional(scene.goal, `${path}.goal`, state),
    obstacle: sanitiseOptional(scene.obstacle, `${path}.obstacle`, state),
    turn: sanitiseOptional(scene.turn, `${path}.turn`, state),
    beats: beats !== undefined && beats.length === 0 ? [placeholder] : beats,
  });
}

/**
 * The final guard behind the advisory repair: whatever still surfaces a reveal before its chapter is rewritten before it is
 * persisted, so a stored brief never carries a give-away term early. Chapter numbers, chaining flags, refs and reader value are
 * never touched, so the blocking outline rules still hold; `events` and each scene's `beats` keep at least one entry.
 */
export function sanitiseBriefReveals<T extends PlannedBrief>(briefs: readonly T[], reveals: readonly ScheduledReveal[]): { briefs: T[]; sanitised: RevealViolation[] } {
  const sanitised: RevealViolation[] = [];
  const safe = briefs.map(brief => {
    const state: Sanitiser = { subject: `chapter ${brief.chapter}`, reveals: reveals.filter(reveal => reveal.revealChapter > brief.chapter), sanitised };
    if (state.reveals.length === 0) return brief;
    const early = new Set(state.reveals.map(reveal => reveal.factKey));
    const learns = brief.knowledgeContract?.learns;
    const keptLearns = learns?.filter(entry => !early.has(entry.factKey));
    for (const entry of learns ?? []) {
      const reveal = state.reveals.find(candidate => candidate.factKey === entry.factKey);
      if (reveal) sanitised.push({ subject: state.subject, field: LEARNS_FIELD, factKey: reveal.factKey, revealChapter: reveal.revealChapter });
    }
    const events = brief.events === undefined ? undefined : sanitiseList(brief.events, 'events', state);
    const firstReveal = state.reveals[0] as ScheduledReveal;
    return withKnownKeys({
      ...brief,
      title: sanitiseOptional(brief.title, 'title', state),
      objective: sanitiseOptional(brief.objective, 'objective', state),
      events: events !== undefined && events.length === 0 ? [placeholderFor(firstReveal, state.reveals)] : events,
      scenes: brief.scenes?.map((scene, index) => sanitiseScene(scene, `scenes[${index}]`, state, placeholderFor(firstReveal, state.reveals))),
      chapterPurpose: sanitiseOptional(brief.chapterPurpose, 'chapterPurpose', state),
      handoffBeat: sanitiseOptional(brief.handoffBeat, 'handoffBeat', state),
      repetitionRisks: brief.repetitionRisks === undefined ? undefined : sanitiseList(brief.repetitionRisks, 'repetitionRisks', state),
      endingContract:
        brief.endingContract === undefined
          ? undefined
          : withKnownKeys({
              ...brief.endingContract,
              emotionalBeat: sanitiseOptional(brief.endingContract.emotionalBeat, 'endingContract.emotionalBeat', state),
              openQuestion: sanitiseOptional(brief.endingContract.openQuestion, 'endingContract.openQuestion', state),
              handoffState: sanitiseOptional(brief.endingContract.handoffState, 'endingContract.handoffState', state),
              mustNotResolve:
                brief.endingContract.mustNotResolve === undefined ? undefined : sanitiseList(brief.endingContract.mustNotResolve, 'endingContract.mustNotResolve', state),
            }),
      knowledgeContract: brief.knowledgeContract === undefined || learns === undefined ? brief.knowledgeContract : { ...brief.knowledgeContract, learns: keptLearns },
    });
  });
  return { briefs: safe, sanitised };
}

export function sanitiseArcReveals<T extends PlannedArc>(arcs: readonly T[], reveals: readonly ScheduledReveal[]): { arcs: T[]; sanitised: RevealViolation[] } {
  const sanitised: RevealViolation[] = [];
  const safe = arcs.map(arc => {
    const state: Sanitiser = { subject: `arc ${arc.arcKey}`, reveals: reveals.filter(reveal => reveal.revealChapter > arc.chapterEnd), sanitised };
    if (state.reveals.length === 0) return arc;
    return withKnownKeys({
      ...arc,
      title: sanitiseOptional(arc.title, 'title', state),
      objective: sanitiseOptional(arc.objective, 'objective', state),
      escalation: sanitiseOptional(arc.escalation, 'escalation', state),
      payoff: sanitiseOptional(arc.payoff, 'payoff', state),
      hook: sanitiseOptional(arc.hook, 'hook', state),
      body: sanitiseOptional(arc.body, 'body', state),
      ideas: arc.ideas === undefined ? undefined : sanitiseList(arc.ideas, 'ideas', state),
    });
  });
  return { arcs: safe, sanitised };
}
