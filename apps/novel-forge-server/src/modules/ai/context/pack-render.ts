import * as schema from '@server/database/schemas';

import { type FactLike } from '../../bible/fact/knowledge-view';
import { type WriterDisclosurePolicy } from '../../bible/fact/writer-disclosure-policy';
import { bridgedSummary, type IsolationBridge } from '../../finalize-review/isolation-bridge';
import { NO_APPROVED_BRIDGE, NO_BRIDGE_SUMMARY, standardReadableState } from '../isolation-read-policy';
import { effectiveWritingInstructions, writingInstructionAdditions } from '../prompts/writing-instructions';
import { type ContextSection, type ContextSegment, type ContextTier, type OmittedSection, renderLabeledSection, renderSection } from './sections';
import { countTokens, truncateAtParagraph, truncateAtParagraphTail } from './token-budget';
import { WRITER_SECTION_CAPS } from './writer-context';

export const PREV_ENDING_TAIL = 500;
export const RECENT_SUMMARY_COUNT = 3;
const ESTABLISHED_FACTS_MAX = 15;
// A stale draft is labelled, not dropped: an ancestor changed under it, but it is still the only continuity the next writer has.
const STALE_LABEL = '[STALE — may not match the current plan]';

// Token counts of a section's parts and of the rendered whole differ by a few tokens; the margin keeps a sized section inside the budget.
const SIZED_SECTION_MARGIN = 32;

export function makeSection(key: string, content: string, tier: ContextTier, sourceRefs: string[] = [], segment: ContextSegment = 'volatile'): ContextSection {
  const rendered = renderSection(key, content);
  const tokens = countTokens(rendered);
  return { key, tier, segment, tokens, truncated: false, sourceRefs, rendered };
}

function makeSectionTail(key: string, content: string, maxTokens: number, tier: ContextTier, sourceRefs: string[] = []): ContextSection {
  const { text, truncated } = truncateAtParagraphTail(content, maxTokens);
  const rendered = renderSection(key, text);
  const tokens = countTokens(rendered);
  return { key, tier, segment: 'volatile', tokens, truncated, sourceRefs, rendered };
}

interface SubjectRecord {
  name: string;
  status: string | null;
  appearance: string | null;
  body: string | null;
  notes: string | null;
  motivation: string | null;
}

export function presentSubjectCard(entity: SubjectRecord, heading: string, aliases: string): string[] {
  return [
    heading,
    aliases,
    entity.status ? `Status: ${entity.status}` : '',
    entity.appearance ? `Canonical appearance: ${entity.appearance}` : 'Canonical appearance: none recorded — derive one.',
    entity.body ?? '',
    entity.notes ?? '',
    entity.motivation ? `Motivation: ${entity.motivation}` : '',
  ];
}

// The entity row is its present-day record, so a draw at an earlier chapter reads it as a baseline the timeline corrects; the author's
// working notes and the present-day status are left out, since neither is a description of the entity at that chapter.
export function datedSubjectCard(entity: SubjectRecord, heading: string, aliases: string, chapter: number): string[] {
  return [
    heading,
    `Draw ${entity.name} as of chapter ${chapter}. The current record below may describe later chapters; where the changes up to chapter ${chapter} differ from it, they win.`,
    aliases,
    entity.appearance ? `Current record (may describe later chapters) — appearance: ${entity.appearance}` : `Appearance: none recorded — derive one as of chapter ${chapter}.`,
    entity.body ? `Current record (may describe later chapters) — profile: ${entity.body}` : '',
    entity.motivation ? `Current record (may describe later chapters) — motivation: ${entity.motivation}` : '',
  ];
}

export function asStable(section: ContextSection): ContextSection {
  return { ...section, segment: 'stable' };
}

/** The finished section cut at its paragraphs to `cap` tokens, heading included, when it is longer — whatever made it long. */
export function fitToCap(section: ContextSection, cap: number): ContextSection {
  if (section.tokens <= cap) return section;
  const split = section.rendered.indexOf('\n\n');
  const heading = split === -1 ? '' : section.rendered.slice(0, split + 2);
  const body = split === -1 ? section.rendered : section.rendered.slice(split + 2);
  const room = Math.max(0, cap - countTokens(heading) - SIZED_SECTION_MARGIN);
  const rendered = `${heading}${truncateAtParagraph(body, room).text}`;
  return { ...section, rendered, tokens: countTokens(rendered), truncated: true };
}

interface FactCut {
  kept: FactLike[];
  omitted: OmittedSection[];
}

/** Keeps facts in the order given while their lines fit `maxTokens`; each one left out is recorded with the size of its line. */
export function fitFacts(facts: readonly FactLike[], line: (fact: FactLike) => string, maxTokens: number): FactCut {
  const kept: FactLike[] = [];
  const omitted: OmittedSection[] = [];
  let used = 0;
  for (const fact of facts) {
    const tokens = countTokens(line(fact)) + 1;
    if (used + tokens <= maxTokens || kept.length === 0) {
      kept.push(fact);
      used += tokens;
    } else {
      omitted.push({ key: `fact:${fact.factKey}`, reason: 'budget', tokens });
    }
  }
  return { kept, omitted };
}

/** The chapter's own facts first — those about its cast — then the rest in the order given. */
export function subjectsFirst(facts: readonly FactLike[], castKeys: ReadonlySet<string>): FactLike[] {
  const about = (fact: FactLike): boolean => (fact.subjects ?? []).some(subject => castKeys.has(subject));
  return [...facts.filter(about), ...facts.filter(fact => !about(fact))];
}

/** What a section is about, from its heading: the name after `## LABEL:`, or the whole heading. */
export function sectionSubject(section: Pick<ContextSection, 'rendered'>): string {
  const heading = (section.rendered.split('\n', 1)[0] ?? '').replace(/^#+\s*/, '');
  const colon = heading.indexOf(':');
  return colon === -1 ? heading : heading.slice(colon + 1).trim();
}

// Writing style is reserved ahead of every other section, so an oversized instructions text must not be
// able to claim the budget the rest of the pack needs.
export const WRITING_STYLE_BUDGET = 4_000;

export function writingStyleSection(stored: string | null | undefined, disclosure: WriterDisclosurePolicy): ContextSection {
  const additions = writingInstructionAdditions(stored);
  const { text, truncated } = effectiveWritingInstructions(additions && disclosure.scrub(additions, 'style'), WRITING_STYLE_BUDGET);
  return { ...makeSection('writing_style', text, 'canonical'), truncated };
}

const ALLOWED_CLUES_LEAD = 'Signs you may show while their cause stays unexplained:';

/** Allowed clues are the author's licence to foreshadow, so they reach the writer unscrubbed. */
export function allowedCluesSection(disclosure: WriterDisclosurePolicy): ContextSection | null {
  const clues = disclosure.allowedClues();
  if (clues.length === 0) return null;
  return makeSection('allowed_clues', [ALLOWED_CLUES_LEAD, ...clues.map(clue => `- ${clue}`)].join('\n'), 'approved_intent');
}

export type EntityCardRow = Pick<typeof schema.entities.$inferSelect, 'name' | 'type' | 'status' | 'body' | 'notes'> & { aliases: { alias: string }[] };

interface RenderedCard {
  text: string;
  truncated: boolean;
}

const HEADING_LINE = /^(#{1,6}\s+(?<md>.+)|\*\*(?<bold>[^*\n]+)\*\*:?|__(?<under>[^_\n]+)__:?)\s*$/;
const INLINE_LABEL = /^(?:\*\*|__)?(?<label>[^*_:\n]{1,40}?)(?:\*\*|__)?:/;
const GUIDANCE_WORDS = /\b(drafter|drafting|cautions?|prohibit\w*|avoid|warnings?|guidance|off[- ]limits)\b/i;
const PROHIBITION_OPENER = /^(?:\*\*|__)?(never|do not|don't|must not)\b/i;

interface CardBlock {
  paragraphs: string[];
  guidance: boolean;
  heading: boolean;
}

function headingText(paragraph: string): string | null {
  const groups = HEADING_LINE.exec(paragraph.split('\n', 1)[0] ?? '')?.groups;
  return groups ? (groups.md ?? groups.bold ?? groups.under ?? '') : null;
}

function isGuidanceParagraph(paragraph: string): boolean {
  const label = INLINE_LABEL.exec(paragraph)?.groups?.label;
  return (label !== undefined && GUIDANCE_WORDS.test(label)) || PROHIBITION_OPENER.test(paragraph.trimStart());
}

// Authored cards tend to end on the drafter guidance and the prohibitions, which a tail cut removes
// first; an over-budget card therefore leads with those blocks, in their authored order.
function guidanceFirst(body: string): string {
  const blocks: CardBlock[] = [];
  for (const paragraph of body.split(/\n\n+/)) {
    const heading = headingText(paragraph);
    const current = blocks.at(-1);
    if (heading !== null) blocks.push({ paragraphs: [paragraph], guidance: GUIDANCE_WORDS.test(heading), heading: true });
    else if (current?.heading) current.paragraphs.push(paragraph);
    else blocks.push({ paragraphs: [paragraph], guidance: isGuidanceParagraph(paragraph), heading: false });
  }
  return [...blocks.filter(b => b.guidance), ...blocks.filter(b => !b.guidance)].flatMap(b => b.paragraphs).join('\n\n');
}

/** A body over `maxTokens` leads with its guidance and prohibitions before it is cut; one within it keeps its authored order. */
export function renderEntityCard(entity: EntityCardRow, maxTokens: number): RenderedCard {
  const aliasLine = entity.aliases.length > 0 ? `\nAliases: ${entity.aliases.map(a => a.alias).join(', ')}` : '';
  const statusLine = entity.status != null ? `\nStatus: ${entity.status}` : '';
  const bodyRaw = entity.body ?? entity.notes ?? '';
  const overBudget = countTokens(bodyRaw) > maxTokens;
  const { text: body, truncated } = overBudget ? truncateAtParagraph(guidanceFirst(bodyRaw), maxTokens) : { text: bodyRaw, truncated: false };
  return { text: `**${entity.name}** (${entity.type}, ${entity.status ?? 'active'})\n${body}${aliasLine}${statusLine}`, truncated };
}

export function entityLabel(entity: Pick<EntityCardRow, 'name' | 'type'>, pov = false): string {
  return `${pov ? 'POV ' : ''}${entity.type.toUpperCase().replace(/_/g, ' ')}: ${entity.name}`;
}

export type WorldFactRow = typeof schema.worldFacts.$inferSelect;

export type CanonFactRow = typeof schema.canonFacts.$inferSelect;

// The catalog lists world facts as `category: key | key`, so an outliner ref may name either. Category
// wins because it was the only reading before keys resolved; `category/key` pins a single fact.
export function matchWorldFacts(rows: WorldFactRow[], value: string): { facts: WorldFactRow[]; byKey: boolean } | null {
  const byCategory = rows.filter(f => f.category === value);
  if (byCategory.length > 0) return { facts: byCategory, byKey: false };
  const slash = value.indexOf('/');
  const pinned = slash === -1 ? [] : rows.filter(f => f.category === value.slice(0, slash) && f.key === value.slice(slash + 1));
  if (pinned.length > 0) return { facts: pinned, byKey: true };
  const byKey = rows.filter(f => f.key === value);
  return byKey.length > 0 ? { facts: byKey, byKey: true } : null;
}

export function makeRefSection(ref: string, label: string, content: string, tier: ContextTier, truncated = false): ContextSection {
  const rendered = renderLabeledSection(label, content);
  return { key: `ref:${ref}`, tier, segment: 'volatile', tokens: countTokens(rendered), truncated, sourceRefs: [ref], rendered };
}

export function entityCardTier(status: EntityCardRow['status']): ContextTier {
  return status === 'planned' ? 'approved_intent' : 'canonical';
}

export function sumTokens(sections: ContextSection[]): number {
  return sections.reduce((sum, section) => sum + section.tokens, 0);
}

/** The content a section may hold when the section itself, heading included, must fit in `available`. */
export function sizedSectionCeiling(key: string, available: number): number {
  return Math.max(0, available - countTokens(renderSection(key, '')) - SIZED_SECTION_MARGIN);
}

type CharacterStateRow = typeof schema.characterStates.$inferSelect;
type EntityRelationshipRow = typeof schema.entityRelationships.$inferSelect;

export function renderCharacterState(name: string, state: CharacterStateRow): string | null {
  const lines: string[] = [];
  if (state.location) lines.push(`Location: ${state.location}`);
  if (state.conditions && state.conditions.length > 0) lines.push(`Conditions: ${state.conditions.join(', ')}`);
  if (state.immediateGoal) lines.push(`Goal: ${state.immediateGoal}`);
  if (state.statusNote) lines.push(`Status: ${state.statusNote}`);
  if (lines.length === 0) return null;
  return [`**${name}** (as of ch ${state.lastUpdatedChapter})`, ...lines].join('\n');
}

interface RecentSummary {
  chapter: number;
  summary: string;
  draft: boolean;
  stale: boolean;
}

interface CarriedDraft {
  chapter: number;
  summary: string | null;
  staleReason: string | null;
}

/** An isolated chapter as a standard call reads it: its title withheld and its summary replaced by the approved bridge, or by a walled-off note. */
export function walledOff<T extends { isolated: boolean; summary: string | null; title?: string | null }>(row: T, bridge: IsolationBridge | undefined): T {
  if (!row.isolated) return row;
  return { ...row, ...('title' in row ? { title: null } : {}), summary: bridgedSummary(row, bridge) ?? NO_BRIDGE_SUMMARY };
}

// A batch drafts chapter N before N-1 is finalized, so a chapter without a finalized row speaks through its draft's summary.
export function recentSummaries(finalized: { number: number; summary: string | null }[], drafts: CarriedDraft[]): RecentSummary[] {
  const byChapter = new Map<number, RecentSummary>();
  for (const draft of drafts) {
    if (draft.summary?.trim()) byChapter.set(draft.chapter, { chapter: draft.chapter, summary: draft.summary, draft: true, stale: draft.staleReason != null });
  }
  for (const row of finalized) {
    const summary = row.summary?.trim() ? row.summary : (byChapter.get(row.number)?.summary ?? '');
    byChapter.set(row.number, { chapter: row.number, summary, draft: false, stale: false });
  }
  return [...byChapter.values()].sort((a, b) => a.chapter - b.chapter).slice(-RECENT_SUMMARY_COUNT);
}

export function recentSummaryLine(entry: RecentSummary, index: number): string {
  const labels = [entry.draft ? '[DRAFT — not yet canon] ' : '', entry.stale ? `${STALE_LABEL} ` : ''].join('');
  return `${index + 1}. ${labels}Ch ${entry.chapter}: ${entry.summary}`;
}

function staleDraftPrefix(draft: { staleReason: string | null } | null | undefined): string {
  return draft?.staleReason != null ? `${STALE_LABEL}\n` : '';
}

// Only the tail reaches the writer, so only a margin around it is scrubbed; a passage cut at the margin is still caught by its sentences.
function scrubbedTail(prose: string, disclosure: WriterDisclosurePolicy): string {
  return disclosure.scrub(truncateAtParagraphTail(prose, PREV_ENDING_TAIL * 2).text, 'prose');
}

function renderCarriedState(state: unknown, disclosure: WriterDisclosurePolicy): string {
  return typeof state === 'string' ? disclosure.scrub(state, 'state') : JSON.stringify(disclosure.scrubState(state, ESTABLISHED_FACTS_MAX));
}

/**
 * Continuation state within `maxTokens`, shortened a whole entry at a time so it stays valid JSON: the largest entry goes first, and a
 * list loses its last item rather than all of them. A state stored as a list loses items from its end.
 */
function fittedState(state: unknown, disclosure: WriterDisclosurePolicy, maxTokens: number): string {
  const scrubbed = typeof state === 'string' ? null : disclosure.scrubState(state, ESTABLISHED_FACTS_MAX);
  if (Array.isArray(scrubbed)) {
    const items = [...scrubbed];
    while (items.length > 0 && countTokens(JSON.stringify(items)) > maxTokens) items.pop();
    return JSON.stringify(items);
  }
  if (scrubbed === null || typeof scrubbed !== 'object') return renderCarriedState(state, disclosure);
  const entries = Object.entries(scrubbed);
  let text = JSON.stringify(scrubbed);
  while (countTokens(text) > maxTokens && entries.length > 0) {
    const largest = entries.reduce((top, entry) => (JSON.stringify(entry[1]).length > JSON.stringify(top[1]).length ? entry : top));
    if (Array.isArray(largest[1]) && largest[1].length > 1) largest[1] = largest[1].slice(0, -1);
    else entries.splice(entries.indexOf(largest), 1);
    text = JSON.stringify(Object.fromEntries(entries));
  }
  return text;
}

/** With `maxTokens`, the summary takes at most half and the state is shortened whole entries at a time into the rest, so no cut ever lands inside its JSON. */
function renderIsolatedEnding(summary: string | null, state: unknown, disclosure: WriterDisclosurePolicy, maxTokens?: number): string {
  const scrubbed = disclosure.scrub(summary ?? '', 'summary');
  if (maxTokens === undefined) return `Summary: ${scrubbed}\nState: ${state ? renderCarriedState(state, disclosure) : 'null'}`;
  const head = `Summary: ${truncateAtParagraph(scrubbed, Math.floor(maxTokens / 2)).text}\nState: `;
  return `${head}${state ? fittedState(state, disclosure, maxTokens - countTokens(head)) : 'null'}`;
}

const DRAFT_LABEL = '[DRAFT — not yet canon]\n';

interface PreviousEndingSource {
  /** The chapter whose ending is read: the one before the chapter being written or planned. */
  chapter: number;
  row: Pick<typeof schema.chapters.$inferSelect, 'status' | 'isolated' | 'content' | 'summary'> | null | undefined;
  draft: Pick<typeof schema.drafts.$inferSelect, 'body' | 'summary' | 'state' | 'isolated' | 'staleReason'> | null | undefined;
  bridge: IsolationBridge | undefined;
  /** The unrestricted route reads an isolated chapter as written; every other reader gets only its approved bridge. */
  rawIsolated: boolean;
  disclosure: WriterDisclosurePolicy;
  caps?: PreviousEndingCaps;
}

interface PreviousEndingCaps {
  ending: number;
  state: number;
}

const WRITER_PREVIOUS_ENDING_CAPS: PreviousEndingCaps = { ending: WRITER_SECTION_CAPS.prevEnding, state: WRITER_SECTION_CAPS.continuationState };

interface PreviousEnding {
  ending: ContextSection | null;
  state: ContextSection | null;
}

/** How a chapter ends and the state it carries on, as the next chapter's writer reads them, each within its cap. */
export function previousEnding({ chapter, row, draft, bridge, rawIsolated, disclosure, caps = WRITER_PREVIOUS_ENDING_CAPS }: PreviousEndingSource): PreviousEnding {
  const refs = [`chapter:${chapter}`];
  const stale = staleDraftPrefix(draft);
  const isolated = Boolean(row?.isolated || draft?.isolated);
  const carried = isolated && !rawIsolated ? standardReadableState(bridge) : draft?.state;
  const endingRoom = sizedSectionCeiling('prev_ending', caps.ending);
  const isolatedEnding = (summary: string | null, room: number): string => {
    if (rawIsolated) return renderIsolatedEnding(summary, carried, disclosure, room);
    return bridge ? renderIsolatedEnding(bridge.summary, carried, disclosure, room) : NO_APPROVED_BRIDGE;
  };
  const ending = (): ContextSection | null => {
    if (row) {
      const tier: ContextTier = row.status === 'done' ? 'canonical' : 'working';
      if (row.isolated) return makeSection('prev_ending', isolatedEnding(row.summary, endingRoom), tier, refs);
      return makeSectionTail('prev_ending', scrubbedTail(row.content ?? '', disclosure), PREV_ENDING_TAIL, tier, refs);
    }
    if (draft?.isolated) {
      const label = `${DRAFT_LABEL}${stale}`;
      return makeSection('prev_ending', `${label}${isolatedEnding(draft.summary, endingRoom - countTokens(label))}`, 'working', refs);
    }
    if (!draft?.body) return null;
    // Chapter N-1 hasn't been finalized yet (mid-batch): the `chapters` row doesn't exist, so fall back
    // to the just-drafted prose tail instead of leaving chapter N with only continuation-state fields.
    const { text, truncated } = truncateAtParagraphTail(scrubbedTail(draft.body, disclosure), PREV_ENDING_TAIL);
    const rendered = renderSection('prev_ending', `${DRAFT_LABEL}${stale}${text}`);
    return { key: 'prev_ending', tier: 'working', segment: 'volatile', tokens: countTokens(rendered), truncated, sourceRefs: refs, rendered };
  };
  const stateSection = (): ContextSection | null => {
    if (carried == null) return null;
    const state = fittedState(carried, disclosure, sizedSectionCeiling('continuation_state', caps.state) - countTokens(stale));
    return fitToCap(makeSection('continuation_state', `${stale}${state}`, 'working', refs), caps.state);
  };
  const found = ending();
  return { ending: found && fitToCap(found, caps.ending), state: stateSection() };
}

// `entity_relationships` is append-only — one row per chapter that observed the pair — so current state
// is the highest-chapter row per (entityId, targetKey, kind), with the later insert winning a tie.
export function latestRelationships(rows: EntityRelationshipRow[]): EntityRelationshipRow[] {
  const latest = new Map<string, EntityRelationshipRow>();
  for (const row of rows) {
    const key = `${row.entityId}::${row.targetKey}::${row.kind}`;
    const current = latest.get(key);
    if (!current || (row.chapter ?? -1) > (current.chapter ?? -1) || ((row.chapter ?? -1) === (current.chapter ?? -1) && row.id > current.id)) latest.set(key, row);
  }
  return [...latest.values()];
}

export function renderPremise(project: { premise: string | null; brief: string | null; themes: unknown; instructions: string | null }): string {
  const themes = Array.isArray(project.themes) ? (project.themes as string[]).join(', ') : '';
  const additions = writingInstructionAdditions(project.instructions);
  return [project.premise ?? project.brief ?? '', themes ? `Themes: ${themes}` : '', additions ? `Author instructions: ${additions}` : ''].filter(Boolean).join('\n\n');
}
