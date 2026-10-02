import { isPlannerOnlyBibleDoc } from '../ai/context/bible-docs';

export const PLANNER_ONLY_LOOKUP_TOOL = 'get_bible_document';
export const AUTHOR_NOTES_LOOKUP_TOOL = 'get_notes';

/**
 * The warning a chat turn's cards carry when it read the author's notes, organised timeline or open questions. They name what happens
 * later in the book, and nothing backs them with a scheduled canon fact the writer's scrub could withhold, so a change drawn from them to
 * anything the chapter writer or a reader can see is reviewed by the author rather than applied on its own; only planner-side records still apply.
 */
export const PLANNER_ONLY_WARNING = [
  'This turn drew on your notes, organised timeline or open questions, which only planning steps read, so its changes to what the chapter writer or your readers could see wait for you.',
  'Check none carries later-story material into the story, a brief or a page they read.',
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
