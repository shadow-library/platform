import { OPEN_QUESTIONS_DOC, ORGANISED_TIMELINE_DOC } from '../../ai/context/bible-docs';
import { type BlueprintInputSection, ORGANISED_TIMELINE_SECTION } from '../../ai/context/blueprint-sections';
import { organisedTimelineState, renderOrganisedTimeline } from '../../ai/context/organised-timeline';
import { type StepInputContext } from '../engine/blueprint-step.types';
import { loadPageBody, type PageRef } from './bible-page';

export const ORGANISE_STEP_KEY = 'organise';
export const TIMELINE_PAGE: PageRef = ORGANISED_TIMELINE_DOC;
export const OPEN_QUESTIONS_PAGE: PageRef = OPEN_QUESTIONS_DOC;

/**
 * Read only once an organise lock has written the timeline: the address is reserved and planner-only whoever writes it, but only that
 * lock makes the page the author's checked timeline.
 */
export async function organisedTimelineInput(context: Pick<StepInputContext, 'ledger' | 'db' | 'projectId'>): Promise<BlueprintInputSection[]> {
  const state = organisedTimelineState(context.ledger);
  if (!state) return [];
  const body = (await loadPageBody(context.db, context.projectId, TIMELINE_PAGE))?.trim();
  return body ? [{ key: ORGANISED_TIMELINE_SECTION, content: renderOrganisedTimeline(body, state), required: true }] : [];
}
