import { type Refinement } from '@server/database';

import { isPlannerOnlyBibleDoc } from '../ai/context/bible-docs';

export const PLANNER_ONLY_LOOKUP_TOOL = 'get_bible_document';
export const AUTHOR_NOTES_LOOKUP_TOOL = 'get_notes';

/**
 * The warning a chat proposal carries when the turn read the author's notes, organised timeline or open questions. They name what happens
 * later in the book, and nothing backs them with a scheduled canon fact the writer's scrub could withhold, so a change drawn from them is
 * reviewed by the author rather than applied on its own.
 */
export const PLANNER_ONLY_WARNING = [
  'This change drew on your notes, organised timeline or open questions, which only planning steps read.',
  'Check it does not carry later-story material into a brief or page the chapter writer reads.',
].join(' ');

/** A lookup that returned the author's notes or a planner-only page's content. */
export function readsPlannerOnlyPage(tool: string, args: unknown): boolean {
  if (tool === AUTHOR_NOTES_LOOKUP_TOOL) return true;
  if (tool !== PLANNER_ONLY_LOOKUP_TOOL || typeof args !== 'object' || args === null) return false;
  const { section, slug } = args as { section?: unknown; slug?: unknown };
  return typeof section === 'string' && typeof slug === 'string' && isPlannerOnlyBibleDoc({ section: section as never, slug });
}

export function chatTurnWarnings(warnings: string[], readPlannerOnly: boolean): string[] {
  return readPlannerOnly && !warnings.includes(PLANNER_ONLY_WARNING) ? [...warnings, PLANNER_ONLY_WARNING] : warnings;
}

/** An auto-mode turn applies its proposal only when nothing on it asks for the author's review first. */
export function autoApplies(mode: Refinement.ChatSession['mode'], proposal: Pick<Refinement.Proposal, 'warnings'> | null): boolean {
  return mode === 'auto' && proposal !== null && (proposal.warnings?.length ?? 0) === 0;
}
