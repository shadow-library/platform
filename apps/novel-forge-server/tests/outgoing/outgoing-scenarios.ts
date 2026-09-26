import { type BridgeReviewOptions } from '../finalize-review/bridge-fixtures';
import { type BriefSpec, type FactSpec, type WorldSpec } from './outgoing-world';

export const ENDING = 'Mira lets the lamp go dark and the tide carries her out past the reef.';
export const ENDING_QUESTION = 'Will Mira keep the coast lit through the long winter?';
export const V1_GOAL = 'Keep the harbour lamp burning through the spring gales.';
export const V2_GOAL = 'Mira sails north to find the maker of the lamp.';
export const V3_GOAL = 'The sea floods the lower town and claims the lighthouse stones.';
export const TIMELINE_LINE = 'Dace betrays the harbour council on the night of the eclipse.';
export const OPEN_QUESTION = 'Does anyone survive the flooding of the lower town?';

export const BELL_TRUTH = 'The drowned bell tolls only for the keeper who dies next.';
export const BELL_TERM = 'bell debt';
export const BELL_KEY = 'drowned_bell_price';
export const BELL_CLUE = 'The gulls fall silent an hour before the storms.';
export const BELL = [BELL_TRUTH, BELL_TERM, BELL_KEY] as const;

export const ORIGIN_TRUTH = 'Dace was born in the sunken town beneath the reef.';
export const ORIGIN_TERM = 'reef-born';
export const ORIGIN_KEY = 'dace_sunken_origin';
export const ORIGIN = [ORIGIN_TRUTH, ORIGIN_TERM, ORIGIN_KEY] as const;

export const RAW_TITLE = 'Crimson Undertow';
export const RAW_SUMMARY = 'Vell and Mira spend a feverish night aboard the wreck.';
export const RAW_PROSE = 'The lantern swung while Vell pressed Mira against the wet mast of the wreck.';
export const RAW_STATE = 'Vell hid the brass key beneath the wreck hull.';
export const RAW = [RAW_TITLE, RAW_SUMMARY, RAW_PROSE, RAW_STATE] as const;
export const BRIDGE_SUMMARY = 'Mira and Vell shelter on the wreck until the storm passes.';
export const BRIDGE_PLACE = 'the wreck of the Gannet';

export const EVENT_EARLY = 'Mira takes the keeper oath at the lamp.';
export const EVENT_LATE = 'Mira loses her left hand to the reef.';

/** Every writer-bound field of the world at once: a locked secret pasted here must come out of every one of them. */
export function leakEverywhere(spec: WorldSpec, chapter: number, payload: string): WorldSpec {
  const previous = chapter - 1;
  const cited = ['entity:dace', 'world_fact:tides', 'bible_doc:lore/coast-notes', 'thread:harbour_debt'];
  return {
    ...spec,
    instructions: `Write close third person. ${payload}`,
    briefs: (spec.briefs ?? []).map(brief =>
      brief.chapter === chapter ? { ...brief, body: `${brief.body ?? 'Mira walks the pier at night.'} ${payload}`, refs: [...(brief.refs ?? []), ...cited] } : brief,
    ),
    chapters: (spec.chapters ?? []).map(row =>
      row.number === previous && !row.isolated ? { ...row, content: `The storm broke at last. ${payload}`, summary: `Mira mends the lamp. ${payload}` } : row,
    ),
    drafts: [
      ...(spec.drafts ?? []),
      ...((spec.drafts ?? []).some(draft => draft.chapter === previous) || (spec.chapters ?? []).some(row => row.number === previous && row.isolated)
        ? []
        : [{ chapter: previous, body: 'The storm broke at last.', summary: 'Mira mends the lamp.', state: { lastBeat: payload, establishedFacts: ['The pier is rotten.'] } }]),
    ],
    entities: (spec.entities ?? []).map(entity => (entity.key === 'dace' ? { ...entity, body: `An apprentice with salt-cracked hands. ${payload}` } : entity)),
    worldFacts: [...(spec.worldFacts ?? []), { category: 'tides', key: 'spring_tide', value: `The spring tide runs high. ${payload}` }],
    pages: [...(spec.pages ?? []), { section: 'lore', slug: 'coast-notes', body: `Notes on the coast.\n\n${payload}` }],
    threads: [...(spec.threads ?? []), { key: 'harbour_debt', summary: `The harbour owes the council. ${payload}`, openedChapter: 1 }],
    ledger: [...(spec.ledger ?? []), { topic: 'voice', statement: 'Quiet dread.', writerLine: `Keep the dread quiet. ${payload}` }],
  };
}

export function bell(extra: Partial<FactSpec> = {}): FactSpec {
  return { key: BELL_KEY, truth: BELL_TRUTH, terms: [BELL_TERM], clues: [BELL_CLUE], writerNote: 'Keep the bell ominous and unexplained.', ...extra };
}

export function origin(extra: Partial<FactSpec> = {}): FactSpec {
  return { key: ORIGIN_KEY, truth: ORIGIN_TRUTH, terms: [ORIGIN_TERM], ...extra };
}

export function brief(chapter: number, extra: Partial<BriefSpec> = {}): BriefSpec {
  return { chapter, volumeKey: 'v1', pov: 'mira', body: 'Mira walks the pier at night.', ...extra };
}

/** Chapters 1 to 4 finalized, chapter 5 planned in volume one; the ending and three volumes set. */
export function coast(extra: Partial<WorldSpec> = {}): WorldSpec {
  return {
    cursor: 4,
    ending: ENDING,
    endingQuestion: ENDING_QUESTION,
    volumes: [
      { key: 'v1', ordinal: 1, title: 'Spring', objective: V1_GOAL },
      { key: 'v2', ordinal: 2, title: 'Summer', objective: V2_GOAL },
      { key: 'v3', ordinal: 3, title: 'Winter', objective: V3_GOAL },
    ],
    entities: [
      { key: 'mira', name: 'Mira Solen', body: 'The keeper of the harbour lamp.' },
      { key: 'dace', name: 'Dace Orrin', body: 'An apprentice with salt-cracked hands.' },
      { key: 'vell', name: 'Captain Vell', body: 'A smuggler who owes the harbour.' },
    ],
    chapters: [1, 2, 3, 4].map(number => ({ number })),
    briefs: [brief(1), brief(2), brief(3), brief(4), brief(5)],
    ...extra,
  };
}

export function withBrief(spec: WorldSpec, chapter: number, extra: Partial<BriefSpec>): WorldSpec {
  return { ...spec, briefs: (spec.briefs ?? []).map(row => (row.chapter === chapter ? { ...row, ...extra } : row)) };
}

/** Chapter 4 written in the unrestricted mode: its finalized row and its draft isolated, with `review` answering its bridge. */
export function isolatedFour(review?: Partial<BridgeReviewOptions>, spec: WorldSpec = coast()): WorldSpec {
  return {
    ...spec,
    chapters: (spec.chapters ?? []).map(row => (row.number === 4 ? { number: 4, isolated: true, title: RAW_TITLE, content: RAW_PROSE, summary: RAW_SUMMARY } : row)),
    drafts: [...(spec.drafts ?? []), { chapter: 4, body: RAW_PROSE, summary: RAW_SUMMARY, title: RAW_TITLE, isolated: true, state: { establishedFacts: [RAW_STATE] } }],
    reviews: review ? [{ chapter: 4, revision: 1, body: RAW_PROSE, summary: BRIDGE_SUMMARY, positions: [{ entityKey: 'mira', location: BRIDGE_PLACE }], ...review }] : [],
  };
}
