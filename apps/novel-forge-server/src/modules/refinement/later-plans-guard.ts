import { TIMELINE_BAND_LABELS } from '@shadow-library/sdk';

import { isWriterExcludedBibleDoc, ORGANISED_TIMELINE_DOC } from '../ai/context/bible-docs';

/** The openings the web sends to organise the notes: the new-novel opener and the opener chip. */
const NOTES_ORGANISE_LEADS = ['here are my notes for the story.', 'organise my notes', 'organize my notes'];
const ORGANISE_NOTES_OP = 'action.organise_notes';

// Anchored to the title's first words, so "Battle plans of the north" or "The future city" stay world pages.
const PLANS_TITLE = /^(?:(?:the|my|our|story|author'?s?)\s+)?(?:plans?|planned|upcoming|roadmap|(?:future|later)\s+(?:plans|events|arcs?|beats)|what happens (?:next|later))\b/i;
export const LATER_BAND_HEADINGS = [TIMELINE_BAND_LABELS.early, TIMELINE_BAND_LABELS.later, TIMELINE_BAND_LABELS.ending, TIMELINE_BAND_LABELS.unplaced]
  .map(label => `"## ${label}"`)
  .join(', ');
const TIMELINE_REF = `${ORGANISED_TIMELINE_DOC.section}/${ORGANISED_TIMELINE_DOC.slug}`;

export const ORGANISE_ROUTED_NOTE =
  'Organising your notes runs as its own step: it keeps the world as the story opens in your Story Bible and puts what happens later in your private timeline, which only planning reads. Accept the card to start it.';
export const PLANS_WITHHELD_NOTE =
  'Forge kept a page of plans for later off the pages the chapter writer reads, so later events cannot leak into chapter prose. Ask again to keep them in your private timeline, which only planning reads.';

type OpLike = Record<string, unknown>;

interface TurnOutput {
  reply: string;
  changeSet?: OpLike[];
}

export function isNotesOrganiseRequest(message: string): boolean {
  const opening = message.trimStart().toLowerCase();
  return NOTES_ORGANISE_LEADS.some(lead => opening.startsWith(lead));
}

function pageTitle(op: OpLike): string {
  const frontmatter = op['frontmatter'];
  const title = typeof frontmatter === 'object' && frontmatter !== null ? (frontmatter as OpLike)['title'] : undefined;
  if (typeof title === 'string' && title.trim()) return title.trim();
  const body = typeof op['body'] === 'string' ? op['body'] : '';
  return /^#\s+(.+)$/m.exec(body)?.[1]?.trim() ?? '';
}

/** A page titled as the author's plans for later, written where the chapter writer reads it. */
export function writesPlansOnWriterPage(op: OpLike): boolean {
  const { section, slug } = op;
  if (op['op'] !== 'bible_document.upsert' || typeof section !== 'string' || typeof slug !== 'string') return false;
  if (isWriterExcludedBibleDoc({ section: section as never, slug })) return false;
  return [pageTitle(op), slug.replace(/[-_]+/g, ' ')].some(text => PLANS_TITLE.test(text));
}

function onlyOrganises(changeSet: readonly OpLike[]): boolean {
  return changeSet.length === 1 && changeSet[0]?.['op'] === ORGANISE_NOTES_OP;
}

export function laterPlanIssues(changeSet: readonly OpLike[] | undefined, organiseRequest: boolean): string[] {
  const ops = changeSet ?? [];
  if (organiseRequest) {
    if (onlyOrganises(ops)) return [];
    return [
      `The author asked you to organise their notes. That runs as its own step, which keeps the world as the story opens in the Story Bible and puts what happens later on the private timeline only planning reads, so answer with exactly one op, {"op":"${ORGANISE_NOTES_OP}"}, and write no Story Bible page or record from the notes yourself.`,
    ];
  }
  return ops.flatMap((op, index) =>
    writesPlansOnWriterPage(op)
      ? [
          `changeSet[${index}]: ${String(op['section'])}/${String(op['slug'])} holds plans for later on a page the chapter writer reads, so later events would leak into chapter prose. Keep that page to how things stand when the story opens, and put what happens later on the private timeline instead: bible_document.upsert ${TIMELINE_REF} (fetch it first when it exists), each event a "- " line under ${LATER_BAND_HEADINGS}.`,
        ]
      : [],
  );
}

/**
 * The turn as staged: a request to organise the notes stages the organise action alone, and a page of plans for later never reaches a
 * page the chapter writer reads. Each says so in the reply when it changed what the model proposed.
 */
export function withLaterPlansRouted<T extends TurnOutput>(output: T, organiseRequest: boolean): T {
  const { changeSet = [], ...rest } = output;
  if (organiseRequest) {
    if (onlyOrganises(changeSet)) return output;
    return { ...output, reply: `${output.reply}\n\n${ORGANISE_ROUTED_NOTE}`, changeSet: [{ op: ORGANISE_NOTES_OP }] };
  }
  const kept = changeSet.filter(op => !writesPlansOnWriterPage(op));
  if (kept.length === changeSet.length) return output;
  return { ...rest, reply: `${output.reply}\n\n${PLANS_WITHHELD_NOTE}`, ...(kept.length > 0 ? { changeSet: kept } : {}) } as T;
}
