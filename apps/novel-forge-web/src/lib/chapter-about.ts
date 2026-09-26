import { type BriefResponse, type FinalizeReviewCategory, type FinalizeReviewItemResponse, type FinalizeReviewResponse } from '@/lib/apis';

export interface Appearance {
  key: string;
  name: string;
  /** "point of view, scenes 1, 3" — the scenes the plan gives them. */
  role: string;
}

function sceneList(scenes: readonly number[]): string {
  if (scenes.length === 0) return 'point of view';
  return scenes.length === 1 ? `point of view, scene ${scenes[0]}` : `point of view, scenes ${scenes.join(', ')}`;
}

/** Who tells the chapter, from its plan: each scene's point of view, falling back to the chapter's own when no scene names one. */
export function whoAppears(brief: Pick<BriefResponse, 'pov' | 'scenes'> | undefined, names: ReadonlyMap<string, string>): Appearance[] {
  if (!brief) return [];
  const scenes = new Map<string, number[]>();
  (brief.scenes ?? []).forEach((scene, index) => {
    const pov = scene.pov ?? brief.pov;
    if (pov) scenes.set(pov, [...(scenes.get(pov) ?? []), index + 1]);
  });
  if (scenes.size === 0 && brief.pov) scenes.set(brief.pov, []);
  return [...scenes.entries()].map(([key, numbers]) => ({ key, name: names.get(key) ?? key, role: sceneList(numbers) }));
}

export type AboutSectionKey = 'changed' | 'world' | 'promises' | 'milestones';

export interface AboutLine {
  id: string;
  text: string;
  /** Read between the lines rather than stated in the prose. */
  inferred: boolean;
}

export interface AboutSection {
  key: AboutSectionKey;
  title: string;
  lines: AboutLine[];
}

const SECTION_OF: Record<FinalizeReviewCategory, AboutSectionKey | undefined> = {
  appearance: undefined,
  summary: undefined,
  character_state: 'changed',
  relationship: 'changed',
  knowledge: 'changed',
  entity: 'world',
  promise: 'promises',
  milestone: 'milestones',
};

const SECTION_TITLES: Record<AboutSectionKey, string> = {
  changed: 'What changed for them',
  world: 'New in the world',
  promises: 'Promises',
  milestones: 'Milestones',
};

const ORDER: readonly AboutSectionKey[] = ['changed', 'world', 'promises', 'milestones'];

/** The Story Bible updates read from the approved text, minus the ones the author skipped; appearances and the summary already show in their own sections. */
export function aboutSections(review: Pick<FinalizeReviewResponse, 'consequential' | 'routine'> | undefined): AboutSection[] {
  if (!review) return [];
  const items: FinalizeReviewItemResponse[] = [...review.consequential, ...review.routine].filter(item => item.decision !== 'skipped');
  return ORDER.map(key => ({
    key,
    title: SECTION_TITLES[key],
    lines: items.filter(item => SECTION_OF[item.category] === key).map(item => ({ id: item.id, text: item.claim, inferred: item.basis === 'inferred' })),
  })).filter(section => section.lines.length > 0);
}

export type AboutUpdatesNote = 'suggestions' | 'kept' | 'preparing' | 'unread' | 'none';

export function aboutUpdatesNote(review: Pick<FinalizeReviewResponse, 'status' | 'current'> | undefined): AboutUpdatesNote {
  if (!review || !review.current) return 'unread';
  if (review.status === 'preparing') return 'preparing';
  if (review.status === 'applied') return 'kept';
  if (review.status === 'failed' || review.status === 'reverted') return 'none';
  return 'suggestions';
}
