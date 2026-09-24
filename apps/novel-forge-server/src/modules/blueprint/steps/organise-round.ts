import { Field, Schema } from '@shadow-library/class-schema';
import {
  ORGANISE_RECORD_TYPES,
  ORGANISE_SOURCES,
  type OrganiseRecordType,
  type OrganiseSource,
  organiseTextKey,
  textDigest,
  TIMELINE_BANDS,
  type TimelineBand,
} from '@shadow-library/sdk';

import { type Bible, type Ledger } from '@server/database';

import { AUTHOR_BRIEF_TOPIC } from '../../ai/context/ledger-sections';
import {
  type BlueprintOrganiseOutput,
  type BlueprintOrganisePageOut,
  ORGANISE_PAGE_SECTIONS,
  ORGANISE_SLUG_MAX,
  type OrganisePageSection,
} from '../../ai/schemas/blueprint-organise.schema';
import { requiredEntityTypesForSlug } from '../../bible/bible-manifest';
import { type PageRef } from './bible-page';
import { addressOf, pageBody, pageLine, samePage } from './organise-content';
import { OPEN_QUESTIONS_PAGE, TIMELINE_PAGE } from './organised-timeline';
import { PREMISE_PAGE } from './premise.step';
import { CAST_PAGE } from './protagonist.step';

const PROSE_SECTION: Bible.Section = 'lore';
const PAGE_SECTIONS: readonly Bible.Section[] = [...ORGANISE_PAGE_SECTIONS, PROSE_SECTION];
const RESERVED_PAGES: readonly PageRef[] = [PREMISE_PAGE, TIMELINE_PAGE, OPEN_QUESTIONS_PAGE];
const CAST_TITLE = 'Cast';

@Schema()
export class OrganiseEventOption {
  @Field({ pattern: '^t[0-9]+$' })
  id: string;

  @Field(() => String, { enum: [...TIMELINE_BANDS] })
  band: TimelineBand;

  @Field({ minLength: 1 })
  event: string;
}

@Schema()
export class OrganiseSectionOption {
  @Field({ pattern: '^p[0-9]+s[0-9]+$' })
  id: string;

  @Field({ minLength: 1 })
  heading: string;

  @Field({ minLength: 1 })
  body: string;

  @Field(() => String, { enum: [...ORGANISE_SOURCES] })
  source: OrganiseSource;
}

@Schema()
export class OrganisePageOption {
  @Field({ pattern: '^p[0-9]+$' })
  id: string;

  @Field(() => String, { enum: [...PAGE_SECTIONS] })
  section: Bible.Section;

  @Field({ minLength: 1 })
  slug: string;

  @Field({ minLength: 1 })
  title: string;

  @Field(() => [String], { description: 'Record types this page owes the Story Bible: keeping it needs at least one kept record of one of them.' })
  needs: OrganiseRecordType[];

  @Field(() => [OrganiseSectionOption], { minItems: 1 })
  sections: OrganiseSectionOption[];
}

@Schema()
export class OrganiseRecordOption {
  @Field({ pattern: '^e[0-9]+$' })
  id: string;

  @Field({ minLength: 1 })
  name: string;

  @Field(() => String, { enum: [...ORGANISE_RECORD_TYPES] })
  type: OrganiseRecordType;

  @Field({ minLength: 1 })
  summary: string;

  @Field(() => String, { enum: [...ORGANISE_SOURCES] })
  source: OrganiseSource;
}

@Schema()
export class OrganiseRuleOption {
  @Field({ pattern: '^r[0-9]+$' })
  id: string;

  @Field({ minLength: 1 })
  rule: string;
}

@Schema()
export class OrganiseQuestionOption {
  @Field({ pattern: '^q[0-9]+$' })
  id: string;

  @Field({ minLength: 1 })
  question: string;

  @Field({ minLength: 1 })
  why: string;
}

@Schema()
export class OrganiseSuggestionOption {
  @Field({ pattern: '^s[0-9]+$' })
  id: string;

  @Field({ pattern: '^p[0-9]+$', description: 'The page it would go on.' })
  pageId: string;

  @Field({ minLength: 1, description: 'The heading of the section it would go under.' })
  section: string;

  @Field({ minLength: 1 })
  text: string;

  @Field({ minLength: 1 })
  why: string;
}

@Schema()
export class OrganiseOptions {
  @Field({ minLength: 1 })
  reading: string;

  @Field({ pattern: '^[0-9a-f]{8}$', description: 'A fingerprint of the notes this round read, so a screen can tell when they have changed since.' })
  notesDigest: string;

  @Field(() => [OrganiseEventOption])
  timeline: OrganiseEventOption[];

  @Field(() => [OrganisePageOption])
  pages: OrganisePageOption[];

  @Field(() => [OrganiseRecordOption])
  records: OrganiseRecordOption[];

  @Field(() => [OrganiseRuleOption])
  rules: OrganiseRuleOption[];

  @Field(() => [OrganiseQuestionOption])
  questions: OrganiseQuestionOption[];

  @Field(() => [OrganiseSuggestionOption])
  suggestions: OrganiseSuggestionOption[];
}

interface DraftSection {
  heading: string;
  body: string;
  source: OrganiseSource;
}

interface DraftPage extends PageRef {
  title: string;
  needs: OrganiseRecordType[];
  sections: DraftSection[];
  addresses: string[];
}

function slugOf(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, ORGANISE_SLUG_MAX)
    .replace(/-+$/, '');
}

/** The app writes the premise, the timeline and the open questions itself, so a page the model addressed there moves beside it instead. */
function pageAddress(section: OrganisePageSection, slug: string, title: string): PageRef {
  const base = slugOf(slug) || slugOf(title) || 'notes';
  return RESERVED_PAGES.some(page => samePage(page, { section, slug: base })) ? { section, slug: `${base}-notes` } : { section, slug: base };
}

function modelAddress(value: string): string | null {
  const [section, ...rest] = value.trim().split('/');
  if (!(ORGANISE_PAGE_SECTIONS as readonly string[]).includes(section ?? '')) return null;
  return addressOf(pageAddress(section as OrganisePageSection, rest.join('/'), ''));
}

export function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter(item => {
    const id = key(item);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/** Two sections of one page under one heading are one section, unless one is read and the other inferred — those never share a body. */
function mergeSection(sections: DraftSection[], incoming: DraftSection): void {
  const same = sections.find(section => organiseTextKey(section.heading) === organiseTextKey(incoming.heading));
  if (same && same.source === incoming.source) {
    same.body = `${same.body}\n\n${incoming.body}`;
    return;
  }
  sections.push(same ? { ...incoming, heading: `${incoming.heading} (inferred)` } : incoming);
}

/**
 * A character's page folds into the cast page, one section per part of it, so everything said about a character sits on the page the
 * Story Bible reads as records and is backed by the character's own record.
 */
function characterPage(page: BlueprintOrganisePageOut, asked: PageRef, characters: Set<string>): string | null {
  if (asked.section !== CAST_PAGE.section || asked.slug === CAST_PAGE.slug) return null;
  const title = organiseTextKey(page.title);
  return characters.has(title) || [...characters].some(name => slugOf(name) === asked.slug) ? page.title.trim() : null;
}

/** A page in a section the Story Bible reads as records, with no record in the round to back it, moves to a prose section: no lock could write it. */
function organisedPages(pages: BlueprintOrganisePageOut[], recordTypes: Set<OrganiseRecordType>, characters: Set<string>): DraftPage[] {
  const merged = new Map<string, DraftPage>();
  for (const page of pages) {
    const asked = pageAddress(page.section, page.slug, page.title);
    const character = characterPage(page, asked, characters);
    const target = character === null ? asked : CAST_PAGE;
    const needs = requiredEntityTypesForSlug(target.section, target.slug) as OrganiseRecordType[];
    const backed = needs.length === 0 || needs.some(type => recordTypes.has(type));
    const address: PageRef = backed ? target : { section: PROSE_SECTION, slug: target.slug };
    const key = addressOf(address);
    const title = character === null ? pageLine(page.title) : CAST_TITLE;
    const draft = merged.get(key) ?? { ...address, title, needs: backed ? needs : [], sections: [], addresses: [] };
    draft.addresses.push(addressOf(asked));
    for (const section of page.sections) {
      const own = pageLine(section.heading);
      const heading = character === null || organiseTextKey(own) === organiseTextKey(character) ? own : `${pageLine(character)} — ${own}`;
      const body = pageBody(section.body);
      if (heading && body) mergeSection(draft.sections, { heading, body, source: section.source });
    }
    merged.set(key, draft);
  }
  const titles = new Map<string, number>();
  return [...merged.values()]
    .filter(page => page.sections.length > 0)
    .map(page => {
      const seen = (titles.get(organiseTextKey(page.title)) ?? 0) + 1;
      titles.set(organiseTextKey(page.title), seen);
      return seen === 1 ? page : { ...page, title: `${page.title} (${seen})` };
    });
}

function rejectedStatements(ledger: Pick<Ledger.Entry, 'kind' | 'statement'>[]): Set<string> {
  return new Set(ledger.filter(entry => entry.kind === 'rejected').map(entry => organiseTextKey(entry.statement)));
}

export function organiseRound(output: BlueprintOrganiseOutput, ledger: Pick<Ledger.Entry, 'kind' | 'topic' | 'statement'>[]): OrganiseOptions {
  const brief = ledger.find(entry => entry.topic === AUTHOR_BRIEF_TOPIC)?.statement ?? '';
  const records = uniqueBy(
    output.records.map(record => ({ name: pageLine(record.name), type: record.type, summary: pageLine(record.summary), source: record.source })),
    record => (record.name && record.summary ? `${organiseTextKey(record.name)}|${record.type}` : ''),
  );
  const characters = new Set(records.filter(record => record.type === 'character').map(record => organiseTextKey(record.name)));
  const drafts = organisedPages(output.pages, new Set(records.map(record => record.type)), characters);
  const pages = drafts.map((page, index): OrganisePageOption => ({
    id: `p${index + 1}`,
    section: page.section,
    slug: page.slug,
    title: page.title,
    needs: page.needs,
    sections: page.sections.map((section, at) => ({ id: `p${index + 1}s${at + 1}`, ...section })),
  }));
  const pageByAddress = new Map(drafts.flatMap((draft, index) => draft.addresses.map(address => [address, pages[index] as OrganisePageOption] as const)));
  const ruledOut = rejectedStatements(ledger);
  const suggestions = uniqueBy(
    output.suggestions.flatMap(suggestion => {
      const address = modelAddress(suggestion.page);
      const page = address === null ? undefined : pageByAddress.get(address);
      const text = pageBody(suggestion.text);
      return page && text && !ruledOut.has(organiseTextKey(text))
        ? [{ pageId: page.id, section: pageLine(suggestion.section) || page.title, text, why: pageLine(suggestion.why) }]
        : [];
    }),
    suggestion => organiseTextKey(suggestion.text),
  );

  return {
    reading: output.reading.trim(),
    notesDigest: textDigest(brief),
    timeline: uniqueBy(
      output.timeline.map(event => ({ band: event.band, event: pageLine(event.event) })),
      event => organiseTextKey(event.event),
    ).map((event, index) => ({ id: `t${index + 1}`, ...event })),
    pages,
    records: records.map((record, index) => ({ id: `e${index + 1}`, ...record })),
    rules: uniqueBy(
      output.rules.map(rule => pageLine(rule.rule)),
      organiseTextKey,
    ).map((rule, index) => ({ id: `r${index + 1}`, rule })),
    questions: uniqueBy(
      output.questions.map(item => ({ question: pageLine(item.question), why: pageLine(item.why) })),
      item => organiseTextKey(item.question),
    ).map((item, index) => ({ id: `q${index + 1}`, ...item })),
    suggestions: suggestions.map((suggestion, index) => ({ id: `s${index + 1}`, ...suggestion })),
  };
}
