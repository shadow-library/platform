import { ORGANISE_TOPIC, textDigest, TIMELINE_BAND_LABELS } from '@shadow-library/sdk';

import { type Ledger } from '@server/database';

import { AUTHOR_BRIEF_TOPIC } from '../../ledger/ledger-sections';
import { type BibleDocRow, ORGANISED_TIMELINE_DOC } from './bible-docs';

export const ORGANISED_TIMELINE_SECTION = 'organised_timeline';

/** Whether the organised timeline was organised from the notes as they stand, or from an earlier version of them. */
export type OrganisedTimelineState = 'current' | 'stale';

const BANDS = [
  `"${TIMELINE_BAND_LABELS.opening}" is how the story opens;`,
  `everything under "${TIMELINE_BAND_LABELS.early}", "${TIMELINE_BAND_LABELS.later}" and "${TIMELINE_BAND_LABELS.ending}" happens where it is placed and never in the opening;`,
  `"${TIMELINE_BAND_LABELS.unplaced}" is not the opening either — place it only where it plainly fits`,
].join(' ');

const RULES: Record<OrganisedTimelineState, string> = {
  current: [
    "The author's own timeline, organised from their notes as they stand and checked by them.",
    `It binds where things happen: ${BANDS}.`,
    'Where it and the starting point\'s "later in the story" items disagree, this timeline wins.',
    "The ending is the author's own, and every step keeps to it.",
  ].join(' '),
  stale: [
    "The author's timeline, organised from an earlier version of their notes.",
    `It still binds where things happen: ${BANDS}.`,
    'Where it disagrees with the author\'s own words or with the starting point\'s "later in the story" items, those win: the notes have changed since.',
    "The ending is the author's own, and every step keeps to it.",
  ].join(' '),
};

export function isOrganisedTimelineDoc(doc: Pick<BibleDocRow, 'section' | 'slug'>): boolean {
  return doc.section === ORGANISED_TIMELINE_DOC.section && doc.slug === ORGANISED_TIMELINE_DOC.slug;
}

/**
 * Null until an organise lock has written the timeline: only that lock makes the page the author's checked timeline, although the address
 * is planner-only whoever writes it.
 */
export function organisedTimelineState(ledger: Pick<Ledger.Entry, 'kind' | 'topic' | 'links' | 'payload' | 'statement'>[]): OrganisedTimelineState | null {
  const decision = ledger.find(entry => entry.kind === 'decision' && entry.topic === ORGANISE_TOPIC && (entry.links.bibleDocuments ?? []).some(isOrganisedTimelineDoc));
  if (!decision) return null;
  const digest = (decision.payload as { notesDigest?: unknown } | null)?.notesDigest;
  const notes = ledger.find(entry => entry.topic === AUTHOR_BRIEF_TOPIC)?.statement ?? '';
  return typeof digest === 'string' && digest === textDigest(notes) ? 'current' : 'stale';
}

export function renderOrganisedTimeline(body: string, state: OrganisedTimelineState): string {
  return `${RULES[state]}\n\n${body.trim()}`;
}

/** The timeline as a planner reads it, rule first; null when the author has not organised their notes or the page is empty. */
export function organisedTimelineText(docs: readonly Pick<BibleDocRow, 'section' | 'slug' | 'body'>[], ledger: Parameters<typeof organisedTimelineState>[0]): string | null {
  const state = organisedTimelineState(ledger);
  const body = docs.find(isOrganisedTimelineDoc)?.body?.trim();
  return state && body ? renderOrganisedTimeline(body, state) : null;
}

/**
 * The Story Bible as a whole-book planner reads it: the organised timeline whole and first, because it binds where every later event
 * lands, then the digest of every other page, which a budget may cut.
 */
export function planningBibleText(docs: readonly BibleDocRow[], ledger: Parameters<typeof organisedTimelineState>[0], digest: (docs: readonly BibleDocRow[]) => string): string {
  const timeline = organisedTimelineText(docs, ledger);
  const rest = digest(timeline ? docs.filter(doc => !isOrganisedTimelineDoc(doc)) : docs);
  const heading = `### ${ORGANISED_TIMELINE_DOC.section}/${ORGANISED_TIMELINE_DOC.slug} — the author's organised timeline`;
  return [timeline ? `${heading}\n${timeline}` : '', rest].filter(Boolean).join('\n\n');
}
