import { beforeAll, describe, expect, it } from 'bun:test';

import { chapterWriterRefs } from '@modules/ai/context/context-assembler.service';
import { countTokens } from '@modules/ai/context/token-budget';
import { NO_APPROVED_BRIDGE, NO_BRIDGE_SUMMARY } from '@modules/ai/isolation-read-policy';

import {
  artCall,
  chatCall,
  fillCall,
  type Outgoing,
  outlinePack,
  passageCall,
  previewParity,
  type PreviewParity,
  reviseCall,
  validationPack,
  writerCall,
  type WriterCall,
} from './outgoing-harness';
import {
  bell,
  BELL,
  BELL_CLUE,
  BELL_KEY,
  BELL_TERM,
  BELL_TRUTH,
  BRIDGE_PLACE,
  BRIDGE_SUMMARY,
  brief,
  coast,
  ENDING,
  ENDING_QUESTION,
  EVENT_EARLY,
  EVENT_LATE,
  isolatedFour,
  leakEverywhere,
  OPEN_QUESTION,
  origin,
  ORIGIN,
  ORIGIN_KEY,
  ORIGIN_TERM,
  ORIGIN_TRUTH,
  RAW,
  RAW_PROSE,
  RAW_SUMMARY,
  RAW_TITLE,
  TIMELINE_LINE,
  V1_GOAL,
  V2_GOAL,
  V3_GOAL,
  withBrief,
} from './outgoing-scenarios';
import { type BriefSpec, type WorldSpec } from './outgoing-world';

type Kind = 'writer' | 'fill' | 'chat' | 'art' | 'outline' | 'validation';

interface Scenario {
  name: string;
  kind: Kind;
  run: () => Promise<Outgoing>;
  forbidden: readonly string[];
  allowed: readonly string[];
}

const BELL_PAYLOAD = `${BELL_TRUTH} Sailors whisper of the ${BELL_TERM}. See ${BELL_KEY}.`;
const ORIGIN_PAYLOAD = `${ORIGIN_TRUTH} The ${ORIGIN_TERM} return. See ${ORIGIN_KEY}.`;
const PLANNED = [ENDING, ENDING_QUESTION, V2_GOAL, V3_GOAL] as const;
const FUTURE_SUMMARY = 'The council hangs Dace from the lighthouse gallery.';
const FUTURE_THREAD = 'The winter debt comes due with the ice.';
const PROVISIONAL_EVENT = 'Mira burns the harbour charter in a rage.';
const PRESENT_STATUS = 'deceased';
const PASSAGE = 'The tide turns late.';

const bellLeak = (spec: WorldSpec, chapter = 5): WorldSpec => leakEverywhere(spec, chapter, BELL_PAYLOAD);
const learnsBell = (extra: Partial<BriefSpec> = {}): Partial<BriefSpec> => ({ cast: ['mira'], learns: [['mira', BELL_KEY]], ...extra });
const through = (last: number) => Array.from({ length: last }, (_, index) => ({ number: index + 1 }));

function writer(name: string, spec: WorldSpec, forbidden: readonly string[], allowed: readonly string[], chapter = 5, call: WriterCall = {}): Scenario {
  return { name, kind: 'writer', run: () => writerCall(spec, chapter, call), forbidden, allowed };
}

const conjunction = (claims: string[]): WorldSpec =>
  bellLeak(
    withBrief(
      coast({
        facts: [bell({ unlock: { all: [{ milestone: 'lamp_rank' }, { milestone: 'storm_oath' }] } })],
        milestones: [{ key: 'lamp_rank', state: 'reached', reachedChapter: 2 }, { key: 'storm_oath' }],
      }),
      5,
      learnsBell({ claims }),
    ),
  );

const pooledCast = bellLeak(
  leakEverywhere(
    withBrief(
      coast({
        facts: [bell(), origin()],
        learned: [
          { entity: 'dace', fact: ORIGIN_KEY, chapter: 3 },
          { entity: 'vell', fact: BELL_KEY, chapter: 2 },
        ],
      }),
      5,
      { cast: ['mira', 'dace'], learns: [] },
    ),
    5,
    ORIGIN_PAYLOAD,
  ),
);

const COPIED_VARIANTS = [
  'Found in the harbour log: The *drowned bell* tolls only\nfor the keeper who **dies next**!',
  'THE DROWNED BELL TOLLS ONLY FOR THE KEEPER WHO DIES NEXT',
  '> - The drowned bell tolls only for the keeper who dies next.',
];

const copiedPage = withBrief(
  coast({
    facts: [bell()],
    pages: [{ section: 'lore', slug: 'keeper-lore', body: `What the old keepers wrote.\n\n${COPIED_VARIANTS.join('\n\n')}\n\nThe lamp oil is whale fat.` }],
  }),
  5,
  { refs: ['bible_doc:lore/keeper-lore'] },
);

const renamedAlias = withBrief(
  coast({
    facts: [origin()],
    entities: [
      { key: 'mira', name: 'Mira Solen', body: 'The keeper of the harbour lamp.' },
      { key: 'dace', name: 'Dace Orrin', body: 'An apprentice.', aliases: [`the ${ORIGIN_TERM} boy`] },
      { key: 'stranger', name: `The ${ORIGIN_TERM} Stranger`, body: `A drifter. ${ORIGIN_KEY}` },
    ],
  }),
  5,
  { refs: ['entity:dace', 'entity:stranger'] },
);

const plannerPages = withBrief(
  coast({
    pages: [
      { section: 'project', slug: 'timeline', body: `## Later\n- ${TIMELINE_LINE}` },
      { section: 'project', slug: 'open-questions', body: `- ${OPEN_QUESTION}` },
      { section: 'lore', slug: 'working-plan', body: `Copied from the plan pages:\n\n- ${TIMELINE_LINE}\n- ${OPEN_QUESTION}\n\nThe harbour bell is bronze.` },
    ],
  }),
  5,
  { refs: ['bible_doc:project/timeline', 'bible_doc:project/open-questions', 'bible_doc:lore/working-plan', 'bible_doc:story_state/volume-plan'] },
);

const futureRefs = withBrief(
  coast({
    chapters: [...through(4), { number: 7, summary: FUTURE_SUMMARY }],
    threads: [
      { key: 'winter_debt', summary: FUTURE_THREAD, openedChapter: 9 },
      { key: 'old_debt', summary: 'The harbour still owes the smugglers.', openedChapter: 2 },
    ],
    pages: [{ section: 'lore', slug: 'seasons', body: `The seasons turn.\n\n${V3_GOAL}` }],
  }),
  5,
  { refs: ['volume:v1', 'volume:v2', 'volume:v3', 'chapter:3', 'chapter:7', 'thread:winter_debt', 'thread:old_debt', 'bible_doc:lore/seasons'] },
);

const endingWorld = (chapter: number, isEndingAt: number | null): WorldSpec =>
  leakEverywhere(
    coast({
      cursor: chapter - 1,
      chapters: through(chapter - 1),
      briefs: Array.from({ length: chapter }, (_, index) => brief(index + 1, { isEnding: index + 1 === isEndingAt })),
    }),
    chapter,
    `${ENDING} ${ENDING_QUESTION}`,
  );

const endingSecret = (isEnding: boolean): WorldSpec => bellLeak(withBrief(coast({ facts: [bell({ unlock: { all: [{ ending: true }] } })] }), 5, learnsBell({ isEnding })));

const sixAfterIsolatedFour = (review?: Parameters<typeof isolatedFour>[0]): WorldSpec =>
  isolatedFour(review, coast({ cursor: 5, chapters: through(5), briefs: [1, 2, 3, 4, 5, 6].map(chapter => brief(chapter)) }));

const leakFindings = [`Continuity: ${BELL_TRUTH} (${BELL_TERM})`];
const judgeLeaks = [`Mira states that ${BELL_TRUTH.toLowerCase()} — this reveals ${BELL_KEY}`];

const artWorld = coast({
  premise: `A lamp keeper guards the coast. ${ENDING}`,
  facts: [bell()],
  entities: [
    {
      key: 'mira',
      name: 'Mira Solen',
      status: PRESENT_STATUS,
      body: `The keeper of the harbour lamp. ${BELL_TRUTH}`,
      appearance: `Grey oilskin coat. Marked by the ${BELL_TERM}.`,
    },
    { key: 'dace', name: 'Dace Orrin' },
  ],
  worldFacts: [{ category: 'bells', key: 'drowned', value: BELL_TRUTH }],
  events: [
    { entity: 'mira', chapter: 2, kind: 'status', after: EVENT_EARLY },
    { entity: 'mira', chapter: 3, kind: 'status', after: PROVISIONAL_EVENT, status: 'provisional' },
    { entity: 'mira', chapter: 6, kind: 'injury', after: EVENT_LATE },
  ],
});

const coverWorld = (endingFinal: boolean): WorldSpec =>
  coast({
    cursor: endingFinal ? 5 : 4,
    chapters: through(endingFinal ? 5 : 4),
    briefs: [1, 2, 3, 4, 5].map(chapter => brief(chapter, { isEnding: chapter === 5 })),
    premise: `A lamp keeper guards the coast. ${BELL_TRUTH} ${ENDING} ${ENDING_QUESTION} ${ORIGIN_TRUTH}\n\n${TIMELINE_LINE}\n\n${V3_GOAL}`,
    facts: [bell({ revealChapter: 8 }), origin({ revealChapter: 2 })],
    pages: [
      { section: 'project', slug: 'timeline', body: `- ${TIMELINE_LINE}` },
      { section: 'project', slug: 'open-questions', body: `- ${OPEN_QUESTION}` },
      { section: 'project', slug: 'art-style', body: `Muted sea greens.\n\n${OPEN_QUESTION}\n\nThe ${BELL_TERM} shows as rust.` },
    ],
  });

const chapterArtWorld = coast({
  ending: ENDING,
  facts: [bell({ revealChapter: 4 }), origin({ revealChapter: 2 })],
  pages: [{ section: 'project', slug: 'timeline', body: `- ${TIMELINE_LINE}` }],
  chapters: [1, 2]
    .map(number => ({ number }))
    .concat(
      [3, 4].map(number => ({ number, title: 'The Tower', summary: `Mira climbs the lamp tower. ${BELL_TRUTH} ${ORIGIN_TRUTH} ${ENDING} ${TIMELINE_LINE}` })),
    ) as WorldSpec['chapters'],
});

const describedWorld = coast({ facts: [bell()] });

const chatWorld = (review?: Parameters<typeof isolatedFour>[0]): WorldSpec =>
  isolatedFour(review, coast({ premise: `A lamp keeper guards the coast. ${BELL_TRUTH}`, facts: [bell()] }));

const SCENARIOS: Scenario[] = [
  writer('an undated secret no plan has revealed', bellLeak(coast({ facts: [bell()] })), [...BELL, ...PLANNED], [BELL_CLUE, 'Mira walks the pier at night.']),
  writer(
    'an undated secret an earlier plan revealed on the page',
    bellLeak(coast({ facts: [bell()], learned: [{ entity: 'mira', fact: BELL_KEY, chapter: 3, source: 'brief' }] })),
    PLANNED,
    [BELL_TRUTH, BELL_TERM],
  ),
  writer(
    "an undated secret a character knows only by the author's own ledger note",
    bellLeak(coast({ facts: [bell()], learned: [{ entity: 'mira', fact: BELL_KEY, chapter: 3, source: 'manual' }] })),
    BELL,
    [BELL_CLUE],
  ),
  writer('a dated secret before its reveal chapter', bellLeak(coast({ facts: [bell({ revealChapter: 8 })] })), BELL, [BELL_CLUE]),
  writer('a dated secret at its reveal chapter', bellLeak(coast({ facts: [bell({ revealChapter: 5 })] })), PLANNED, [BELL_TRUTH]),
  writer('a milestone conjunction with one milestone still unreached', conjunction([]), BELL, [BELL_CLUE]),
  writer('a milestone conjunction the plan completes', conjunction(['storm_oath']), PLANNED, [`[${BELL_KEY}] ${BELL_TRUTH}`]),
  writer(
    'out-of-order ranks: a later rank reached and claimed never implies an earlier one',
    bellLeak(
      withBrief(
        coast({
          facts: [bell({ unlock: { all: [{ milestone: 'rank_two' }] } })],
          milestones: [{ key: 'rank_two' }, { key: 'rank_three', state: 'reached', reachedChapter: 3 }, { key: 'rank_four' }],
        }),
        5,
        learnsBell({ claims: ['rank_four'] }),
      ),
    ),
    BELL,
    [BELL_CLUE],
  ),
  writer(
    "out-of-order ranks: a later chapter's claim does not reach back",
    bellLeak(
      coast({
        facts: [bell({ unlock: { all: [{ milestone: 'rank_two' }] } })],
        milestones: [{ key: 'rank_two' }],
        briefs: [1, 2, 3, 4].map(chapter => brief(chapter)).concat([brief(5, learnsBell()), brief(9, { claims: ['rank_two'] })]),
      }),
    ),
    BELL,
    [BELL_CLUE],
  ),
  writer("multi-POV: the cast pools what each member learned before the chapter, never a non-POV character's secret", pooledCast, BELL, [
    `[${ORIGIN_KEY}] ${ORIGIN_TRUTH}`,
    BELL_CLUE,
  ]),
  writer(
    'multi-POV: a cited non-POV character who knows the secret carries none of it',
    withBrief(
      coast({
        facts: [bell()],
        learned: [{ entity: 'vell', fact: BELL_KEY, chapter: 2 }],
        entities: [
          { key: 'mira', name: 'Mira Solen' },
          { key: 'vell', name: 'Captain Vell', body: `A smuggler. He knows: ${BELL_TRUTH} He calls it the ${BELL_TERM}.` },
        ],
      }),
      5,
      { cast: ['mira'], learns: [], refs: ['entity:vell'] },
    ),
    BELL,
    ['A smuggler.'],
  ),
  writer(
    'late-scene learn: rewriting the chapter a secret was learned in, once its plan dropped the learn',
    bellLeak(withBrief(coast({ facts: [bell({ revealChapter: 5 })], learned: [{ entity: 'mira', fact: BELL_KEY, chapter: 5 }] }), 5, { cast: ['mira'], learns: [] })),
    BELL,
    [BELL_CLUE],
  ),
  writer(
    'late-scene learn: the chapter before the one that learns it',
    bellLeak(
      coast({ cursor: 3, chapters: through(3), facts: [bell({ revealChapter: 5 })], briefs: [brief(1), brief(2), brief(3), brief(4, { cast: ['mira'] }), brief(5, learnsBell())] }),
      4,
    ),
    BELL,
    [BELL_CLUE],
    4,
  ),
  writer('late-scene learn: a planned learn the reveal rule refuses', bellLeak(withBrief(coast({ facts: [bell({ revealChapter: 9 })] }), 5, learnsBell())), BELL, [BELL_CLUE]),
  writer('future volume refs and a page copying a later goal', futureRefs, [V2_GOAL, V3_GOAL, ENDING], [V1_GOAL, 'The seasons turn.']),
  writer('a future chapter and a thread not yet opened', futureRefs, [FUTURE_SUMMARY, FUTURE_THREAD], ['Chapter 3 passes quietly.', 'The harbour still owes the smugglers.']),
  writer(
    'a page copying the secret re-wrapped, emphasised, re-cased and quoted',
    copiedPage,
    [...BELL, 'dies next', 'drowned bell*'],
    ['What the old keepers wrote.', 'The lamp oil is whale fat.'],
  ),
  writer('an alias and an entity name carrying a give-away term', renamedAlias, ORIGIN, ['A drifter.', 'Dace Orrin']),
  writer('planner-only pages cited and copied into a page', plannerPages, [TIMELINE_LINE, OPEN_QUESTION, V3_GOAL], ['The harbour bell is bronze.']),
  writer('the ending before the chapter planned as the ending', endingWorld(5, null), [ENDING, ENDING_QUESTION], ['Mira walks the pier at night.']),
  writer('is_ending: the chapter planned as the ending', endingWorld(5, 5), [V2_GOAL, V3_GOAL], [ENDING, ENDING_QUESTION]),
  writer('is_ending: an epilogue after the ending chapter', endingWorld(6, 5), [V2_GOAL, V3_GOAL], [ENDING, ENDING_QUESTION], 6),
  writer('an ending-conditioned secret before the ending chapter', endingSecret(false), BELL, [BELL_CLUE]),
  writer('an ending-conditioned secret on the ending chapter', endingSecret(true), [V3_GOAL], [`[${BELL_KEY}] ${BELL_TRUTH}`]),
  writer('an isolated neighbour with no bridge', isolatedFour(), [...RAW, BRIDGE_SUMMARY, BRIDGE_PLACE], [NO_APPROVED_BRIDGE]),
  writer('an isolated neighbour crossing through its approved bridge', isolatedFour({}), RAW, [BRIDGE_SUMMARY, BRIDGE_PLACE]),
  writer('an isolated neighbour the plan cites by ref, with no bridge', withBrief(isolatedFour(), 5, { refs: ['chapter:4'] }), [...RAW, BRIDGE_SUMMARY], [NO_APPROVED_BRIDGE]),
  writer(
    'an isolated neighbour still a draft mid-batch, with no bridge',
    { ...isolatedFour(), chapters: through(3), cursor: 3 },
    [...RAW, BRIDGE_SUMMARY, BRIDGE_PLACE],
    [NO_APPROVED_BRIDGE, '[DRAFT — not yet canon]'],
  ),
  writer('an isolated neighbour still a draft mid-batch, crossing through its bridge', { ...isolatedFour({}), chapters: through(3), cursor: 3 }, RAW, [
    BRIDGE_SUMMARY,
    BRIDGE_PLACE,
  ]),
  writer('an isolated neighbour whose bridge is still unanswered', isolatedFour({ decision: null }), [...RAW, BRIDGE_SUMMARY, BRIDGE_PLACE], [NO_APPROVED_BRIDGE]),
  writer('an isolated neighbour whose bridge the author skipped', isolatedFour({ decision: 'skipped' }), [...RAW, BRIDGE_SUMMARY, BRIDGE_PLACE], [NO_APPROVED_BRIDGE]),
  writer(
    'an isolated neighbour whose bridge read text since rewritten',
    isolatedFour({ body: 'An earlier version.' }),
    [...RAW, BRIDGE_SUMMARY, BRIDGE_PLACE],
    [NO_APPROVED_BRIDGE],
  ),
  writer('an isolated chapter two back, in the recent summaries', sixAfterIsolatedFour({}), RAW, [BRIDGE_SUMMARY], 6),
  writer('an isolated chapter two back with no bridge', sixAfterIsolatedFour(), [...RAW, BRIDGE_SUMMARY], [NO_BRIDGE_SUMMARY], 6),
  writer('a reverted finalize keeps its approved bridge (P4-48)', isolatedFour({ status: 'reverted' }), RAW, [BRIDGE_SUMMARY]),
  writer(
    'a restored plan that no longer claims the unlocking milestone',
    bellLeak(
      withBrief(
        coast({ facts: [bell({ unlock: { all: [{ milestone: 'storm_oath' }] } })], milestones: [{ key: 'storm_oath', state: 'planned' }] }),
        5,
        learnsBell({ claims: [], revision: 3 }),
      ),
    ),
    BELL,
    [BELL_CLUE],
  ),
  writer(
    'the repair pass with judge findings quoting the secret',
    bellLeak(coast({ facts: [bell()] })),
    BELL,
    ['cut anything that states or implies', 'Keep the bell ominous and unexplained.'],
    5,
    { node: 'repair', findings: leakFindings, judgeLeaks },
  ),
  writer(
    'the rewrite pass with author guidance and findings quoting the secret',
    bellLeak(coast({ facts: [bell()] })),
    BELL,
    [BELL_CLUE, 'cut anything that states or implies'],
    5,
    { node: 'rewrite', guidance: `Lean into it: ${BELL_PAYLOAD}`, findings: leakFindings, judgeLeaks },
  ),
  writer('a plugin context section quoting the secret', coast({ facts: [bell()] }), BELL, [BELL_CLUE, 'Coast notes'], 5, { plugin: { section: `Plugin lore. ${BELL_PAYLOAD}` } }),
  writer('the title helper on an untitled draft, with a plugin system message quoting the secret', bellLeak(coast({ facts: [bell()] })), BELL, ['Plugin tone.'], 5, {
    untitled: true,
    plugin: { systemMessage: `Plugin tone. ${BELL_PAYLOAD}` },
  }),
  {
    name: 'a passage rewrite with the secret in a plugin system message, the surrounding chapter context and the request',
    kind: 'writer',
    run: () =>
      passageCall(bellLeak(coast({ facts: [bell()], drafts: [{ chapter: 5, body: `The keeper counts the ships. ${PASSAGE} The ferry waits.` }] })), 5, {
        passage: PASSAGE,
        request: `Make it tense. ${BELL_PAYLOAD}`,
        plugin: { systemMessage: `Plugin tone. ${BELL_PAYLOAD}` },
      }),
    forbidden: [...BELL, ...PLANNED],
    allowed: [BELL_CLUE, 'Plugin tone.', 'Make it tense.', `[[PASSAGE]]${PASSAGE}[[/PASSAGE]]`],
  },
  writer('a plugin system message quoting the secret', coast({ facts: [bell()] }), BELL, [BELL_CLUE, 'Plugin tone.'], 5, {
    plugin: { systemMessage: `Plugin tone. ${BELL_PAYLOAD}` },
  }),
  {
    name: 'an author-requested revision with a note and a plugin system message quoting the secret',
    kind: 'writer',
    run: () => reviseCall(bellLeak(coast({ facts: [bell()] })), 5, { note: `Slow down. ${BELL_PAYLOAD}`, plugin: { systemMessage: `Plugin tone. ${BELL_PAYLOAD}` } }),
    forbidden: [...BELL, ...PLANNED],
    allowed: [BELL_CLUE, 'Slow down.', 'Plugin tone.'],
  },
  {
    name: 'an unrestricted fill with a plugin system message and guidance quoting the secret',
    kind: 'fill',
    run: () => fillCall(bellLeak(coast({ facts: [bell()] })), 5, { guidance: `Go darker. ${BELL_PAYLOAD}`, plugin: { systemMessage: `Plugin tone. ${BELL_PAYLOAD}` } }),
    forbidden: [...BELL, ...PLANNED],
    allowed: [BELL_CLUE, 'Go darker.', 'Plugin tone.'],
  },
  {
    name: 'the chat turn reads secrets as the author wrote them and an isolated chapter only through its bridge, lookups included',
    kind: 'chat',
    run: () => chatCall(chatWorld({}), { lookups: [{ tool: 'get_draft', args: { chapter: 4 } }] }),
    forbidden: RAW,
    allowed: [BELL_TRUTH, ENDING, BRIDGE_SUMMARY, 'get_draft'],
  },
  {
    name: 'the chat turn over an isolated chapter with no approved bridge',
    kind: 'chat',
    run: () => chatCall(chatWorld({ decision: null }), { lookups: [{ tool: 'get_draft', args: { chapter: 4 } }] }),
    forbidden: [...RAW, BRIDGE_SUMMARY],
    allowed: [NO_BRIDGE_SUMMARY, NO_APPROVED_BRIDGE],
  },
  {
    name: 'art of an entity as of chapter 3',
    kind: 'art',
    run: () => artCall(artWorld, { entity: 'mira', asOf: 3 }),
    forbidden: [...BELL, ENDING, EVENT_LATE, PROVISIONAL_EVENT, PRESENT_STATUS],
    allowed: [EVENT_EARLY, 'Grey oilskin coat.', 'as of chapter 3'],
  },
  {
    name: 'cover art: the latest final chapter decides, and planner pages and the ending never reach it (P4-51)',
    kind: 'art',
    run: () => artCall(coverWorld(false), { cover: true }, { referenceNote: `Moodboard. ${BELL_PAYLOAD}` }),
    forbidden: [...BELL, ENDING, ENDING_QUESTION, TIMELINE_LINE, OPEN_QUESTION, V3_GOAL],
    allowed: ['A lamp keeper guards the coast.', 'Muted sea greens.', 'Moodboard.', ORIGIN_TRUTH],
  },
  {
    name: 'cover art once the ending chapter is final still carries no ending (P4-51)',
    kind: 'art',
    run: () => artCall(coverWorld(true), { cover: true }),
    forbidden: [...BELL, ENDING, ENDING_QUESTION, TIMELINE_LINE, OPEN_QUESTION],
    allowed: ['A lamp keeper guards the coast.', ORIGIN_TRUTH],
  },
  {
    name: "chapter art uses that chapter's policy: a secret revealed later stays out (P4-51)",
    kind: 'art',
    run: () => artCall(chapterArtWorld, { chapter: 3 }, { referenceNote: `Pose note. ${BELL_PAYLOAD}` }),
    forbidden: [...BELL, ENDING, TIMELINE_LINE],
    allowed: ['Mira climbs the lamp tower.', 'Pose note.', ORIGIN_TRUTH],
  },
  {
    name: "chapter art uses that chapter's policy: a secret revealed by then is drawn (P4-51)",
    kind: 'art',
    run: () => artCall(chapterArtWorld, { chapter: 4 }),
    forbidden: [ENDING, TIMELINE_LINE],
    allowed: [BELL_TRUTH],
  },
  {
    name: 'a cover whose attached reference note and portrait name carry the secret (P4-51)',
    kind: 'art',
    run: () => artCall(coverWorld(false), { cover: true }, { referenceNote: `Moodboard. ${BELL_PAYLOAD}`, referenceName: `Keeper of the ${BELL_TERM}` }),
    forbidden: [...BELL, ENDING],
    allowed: ['Keeper of the [withheld]'],
  },
  {
    name: 'a chapter image whose attached reference portrait name carries the secret (P4-51)',
    kind: 'art',
    run: () => artCall(chapterArtWorld, { chapter: 3 }, { referenceNote: `Pose note. ${BELL_PAYLOAD}`, referenceName: `Keeper of the ${BELL_TERM}` }),
    forbidden: [...BELL, ENDING],
    allowed: ['Keeper of the [withheld]'],
  },
  {
    name: 'refining a stored cover derives its art policy from the latest final chapter (P4-51)',
    kind: 'art',
    run: () => artCall(coverWorld(false), { cover: true }, { refine: true, referenceNote: `Moodboard. ${BELL_PAYLOAD}`, referenceName: `Keeper of the ${BELL_TERM}` }),
    forbidden: BELL,
    allowed: ['Keeper of the [withheld]', 'Warmer light.'],
  },
  {
    name: 'refining a stored chapter image derives its art policy from that chapter (P4-51)',
    kind: 'art',
    run: () => artCall(chapterArtWorld, { chapter: 3 }, { refine: true, referenceName: `Keeper of the ${BELL_TERM}`, referenceNote: 'Pose note.' }),
    forbidden: BELL,
    allowed: ['Keeper of the [withheld]'],
  },
  {
    name: 'a cover compose call with a plugin system message quoting the secret',
    kind: 'art',
    run: () => artCall(coverWorld(false), { cover: true }, { plugin: { systemMessage: `Plugin palette. ${BELL_PAYLOAD}` } }),
    forbidden: BELL,
    allowed: ['Plugin palette.'],
  },
  {
    name: 'a vision description of the likeness reference carrying the secret',
    kind: 'art',
    run: () => artCall(describedWorld, { entity: 'dace', asOf: 4 }, { described: `Salt-cracked hands. Marked by the ${BELL_TERM}. ${BELL_TRUTH}` }),
    forbidden: BELL,
    allowed: ['Salt-cracked hands.'],
  },
  {
    name: 'art of an isolated chapter',
    kind: 'art',
    run: () => artCall(isolatedFour({}), { chapter: 4 }),
    forbidden: RAW,
    allowed: [BRIDGE_SUMMARY],
  },
  {
    name: 'the outline pack beside an isolated chapter with an approved bridge',
    kind: 'outline',
    run: () => outlinePack(isolatedFour({}), 5),
    forbidden: RAW,
    allowed: [BRIDGE_SUMMARY, '[unrestricted]'],
  },
  {
    name: 'the outline pack beside an isolated chapter with no bridge',
    kind: 'outline',
    run: () => outlinePack(isolatedFour(), 5),
    forbidden: [...RAW, BRIDGE_SUMMARY],
    allowed: [NO_BRIDGE_SUMMARY],
  },
  {
    name: 'the validation window over an isolated chapter',
    kind: 'validation',
    run: () => validationPack(isolatedFour({}), 1, 4),
    forbidden: RAW,
    allowed: [BRIDGE_SUMMARY],
  },
];

function hits(texts: readonly string[], markers: readonly string[]): string[] {
  const lowered = texts.map(text => text.toLowerCase());
  return markers.filter(marker => lowered.some(text => text.includes(marker.toLowerCase())));
}

describe('the outgoing package', () => {
  beforeAll(async () => {
    countTokens('warm');
    await writerCall(coast(), 5);
    await chatCall(coast());
  });

  it.each(SCENARIOS.map(scenario => [scenario.kind, scenario.name, scenario] as const))('should send %s calls no forbidden truth for %s', async (_, __, scenario) => {
    const out = await scenario.run();

    expect(out.texts.length).toBeGreaterThan(0);
    expect(hits(out.texts, scenario.forbidden)).toEqual([]);
    if (scenario.kind === 'art') expect(out.imagePrompts?.length).toBe(1);
    if (scenario.kind === 'art') expect(hits(out.imagePrompts ?? [], scenario.forbidden)).toEqual([]);
    expect(scenario.allowed.filter(marker => !hits(out.texts, [marker]).length)).toEqual([]);
  });

  it.each(SCENARIOS.filter(scenario => scenario.kind === 'writer' || scenario.kind === 'chat').map(scenario => [scenario.name, scenario] as const))(
    'should store exactly the messages the model received for %s',
    async (_, scenario) => {
      const out = await scenario.run();
      const [stored, sent] = scenario.kind === 'writer' ? [out.snapshots[0]?.['messages'], out.attempt] : [out.snapshots, out.wire];

      expect(sent.length).toBeGreaterThan(0);
      expect(stored).toEqual(sent);
    },
  );
});

describe('the chapter title helper', () => {
  const titled = coast({
    facts: [bell()],
    chapters: [
      { number: 1, title: 'The Salt Road' },
      { number: 2, title: `The ${BELL_TERM}` },
      { number: 3, title: RAW_TITLE, isolated: true },
      { number: 4, title: 'Low Tide' },
    ],
  });

  it('should run the real title prompt on an untitled draft under the scrubbed chapter policy', async () => {
    const out = await writerCall(titled, 5, { untitled: true, plugin: { systemMessage: `Plugin tone. ${BELL_PAYLOAD}` } });
    const title = out.calls.find(call => call[0]?.content.startsWith('You are titling')) ?? [];
    const text = title.map(message => message.content);

    expect(text.join('\n')).toContain('Plugin tone.');
    expect(text.join('\n')).toContain('- Ch 1: The Salt Road\n- Ch 2: The [withheld]\n- Ch 4: Low Tide');
    expect(text.join('\n')).toContain('Chapter summary:\nThe keeper waits out the storm.');
    expect(hits(text, [...BELL, RAW_TITLE])).toEqual([]);
  });
});

const packRefs = ({ pack }: PreviewParity): Set<string> =>
  new Set(pack.sections.flatMap(section => [...section.sourceRefs, ...(section.key.startsWith('ref:') ? [section.key.slice('ref:'.length)] : [])]));

const PREVIEW_WORLD = withBrief(
  coast({
    facts: [bell({ unlock: { all: [{ milestone: 'storm_oath' }] } }), origin()],
    milestones: [{ key: 'storm_oath' }],
    chapters: [...through(4), { number: 7, summary: FUTURE_SUMMARY }],
    pages: [
      { section: 'project', slug: 'timeline', body: `- ${TIMELINE_LINE}` },
      { section: 'lore', slug: 'coast-notes', body: 'Notes on the coast.' },
    ],
  }),
  5,
  {
    refs: [
      'entity:dace',
      'entity:ghost',
      'volume:v1',
      'volume:v3',
      'chapter:4',
      'chapter:7',
      `fact:${BELL_KEY}`,
      `fact:${ORIGIN_KEY}`,
      'bible_doc:project/timeline',
      'bible_doc:lore/coast-notes',
    ],
  },
);

describe('the writer preview against the pack its card produces', () => {
  const cases = [
    ['a card that keeps the secret locked', { body: 'Mira climbs the tower.' }],
    [
      'a card whose claim unlocks the secret it reveals',
      { body: 'Mira climbs the tower.', claimedMilestones: ['storm_oath'], knowledgeContract: { pov: ['mira'], learns: [{ entityKey: 'mira', factKey: BELL_KEY }] } },
    ],
  ] as const;

  it.each(cases)('should list exactly the refs the pack carries, withholds and misses for %s', async (_, card) => {
    const parity = await previewParity(PREVIEW_WORLD, 5, card);
    const refs = [...new Set(['entity:mira', ...chapterWriterRefs(PREVIEW_WORLD.briefs?.find(row => row.chapter === 5) ? { contextRefs: PREVIEW_WORLD.briefs[4]?.refs } : null)])];
    const carried = packRefs(parity);

    expect(parity.preview.included.map(item => item.ref).sort()).toEqual(refs.filter(ref => carried.has(ref)).sort());
    expect(parity.preview.unresolved.map(item => item.ref).sort()).toEqual([...parity.pack.unresolvedRefs].sort());
    expect(parity.pack.withheldRefs?.every(ref => parity.preview.kept.some(item => item.key === ref))).toBe(true);
  });

  it.each(cases)('should name what it keeps back without its text for %s', async (_, card) => {
    const { previewText } = await previewParity(PREVIEW_WORLD, 5, card);

    expect(hits([previewText], [BELL_TRUTH, BELL_TERM, ORIGIN_TRUTH, ORIGIN_TERM, ...PLANNED, TIMELINE_LINE, FUTURE_SUMMARY])).toEqual([]);
  });

  it('should show a cited locked secret as a writing constraint and keep its truth out of the pack while the card leaves it locked', async () => {
    const parity = await previewParity(PREVIEW_WORLD, 5, cases[0][1]);

    expect(parity.preview.included).toContainEqual({ ref: `fact:${BELL_KEY}`, label: 'Drowned bell price', constraint: true });
    expect(parity.preview.kept.map(item => item.key)).toContain(`fact:${ORIGIN_KEY}`);
    expect(hits([parity.pack.rendered], [BELL_TRUTH, BELL_TERM])).toEqual([]);
    expect(parity.pack.rendered).toContain('Keep the bell ominous and unexplained.');
  });

  it('should hand the pack the secret the card unlocks and stop listing it as kept', async () => {
    const parity = await previewParity(PREVIEW_WORLD, 5, cases[1][1]);

    expect(parity.preview.unlocks.map(item => item.factKey)).toEqual([BELL_KEY]);
    expect(parity.preview.kept.map(item => item.key)).not.toContain(`fact:${BELL_KEY}`);
    expect(parity.pack.rendered).toContain(BELL_TRUTH);
    expect(hits([parity.pack.rendered], [ORIGIN_TRUTH, ORIGIN_TERM, RAW_PROSE, RAW_SUMMARY, RAW_TITLE])).toEqual([]);
  });
});
