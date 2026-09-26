import { type SQL } from 'drizzle-orm';

import { type CatalogService } from '@modules/ai/context/catalog.service';
import { ContextAssembler } from '@modules/ai/context/context-assembler.service';
import { schema } from '@server/database';

import { bridgeSelect } from '../finalize-review/bridge-fixtures';
import { queryRows } from '../sql-filter';

type Row = Record<string, unknown>;

export const TRUTH = 'The keeper trades one memory for every hour the lamp burns.';
export const TERM = 'memory tithe';
export const KEY = 'lamp_memory_price';
export const CLUE = 'The keeper forgets small names after a long night.';
export const ENDING = 'The keeper lets the lamp go dark and the harbour floods.';
export const ENDING_QUESTION = 'Will the keeper keep the harbour lit through winter?';
export const V2_GOAL = 'The apprentice learns to light the lamp alone.';
export const V3_GOAL = 'The drowned town rises to claim its keeper at last.';
export const TIMELINE_LINE = 'The apprentice discovers the ledger of lost names in the cellar.';
export const OPEN_QUESTION = 'Does the apprentice ever learn who built the lamp?';

/** Every secret, planned text and clue at once, pasted into each writer-bound field of the fixture. */
export const PAYLOAD = [TRUTH, `Villagers whisper of the ${TERM}.`, `See ${KEY}.`, ENDING, ENDING_QUESTION, V2_GOAL, V3_GOAL, TIMELINE_LINE, OPEN_QUESTION, CLUE].join(' ');

export const FACT_MARKERS = [TRUTH, TERM, KEY] as const;
export const PLANNED_MARKERS = [ENDING, ENDING_QUESTION, V2_GOAL] as const;
export const PAGE_MARKERS = [TIMELINE_LINE, OPEN_QUESTION] as const;

/** `locked`: chapter 5 of volume v1, the lamp's price still locked. `unlocked`: the ending chapter, in volume v2, whose plan claims the unlocking milestone. */
export type Scenario = 'locked' | 'unlocked';

const CONTRACT = {
  pov: ['keeper'],
  learns: [
    { entityKey: 'keeper', factKey: KEY },
    { entityKey: 'keeper', factKey: 'pier_door' },
  ],
};

export function writerTables(scenario: Scenario): Map<string, Row[]> {
  const unlocked = scenario === 'unlocked';
  const doc = (id: bigint, section: string, slug: string, body: string): Row => ({ id, projectId: 7n, section, slug, body, frontmatter: null });
  const fact = (id: bigint, factKey: string, text: string, extra: Row = {}): Row => ({
    id,
    projectId: 7n,
    factKey,
    text,
    constraintNote: null,
    writerNote: null,
    terms: [],
    revealChapter: null,
    unlock: null,
    allowedClues: null,
    source: 'manual',
    plannedChapter: null,
    ...extra,
  });
  const done = (number: number, extra: Row = {}): Row => ({
    id: BigInt(number),
    projectId: 7n,
    number,
    status: 'done',
    isolated: false,
    title: null,
    content: 'A quiet day.',
    summary: 'A quiet day.',
    ...extra,
  });
  return new Map<string, Row[]>([
    [
      'projects',
      [
        {
          id: 7n,
          instructions: `Write close third. ${PAYLOAD}`,
          ending: ENDING,
          endingQuestion: ENDING_QUESTION,
          storyCurrentChapter: 4,
          premise: PAYLOAD,
          themes: null,
          contentMode: 'standard',
        },
      ],
    ],
    [
      'briefs',
      [
        {
          id: 1n,
          projectId: 7n,
          chapter: 5,
          body: `Open on the pier. ${PAYLOAD}`,
          volumeKey: unlocked ? 'v2' : 'v1',
          isEnding: unlocked,
          claimedMilestones: unlocked ? ['lamp_rank'] : [],
          knowledgeContract: CONTRACT,
          endingContract: { hookType: 'turn', emotionalBeat: `Dread of the ${TERM}`, handoffState: TRUTH },
          staleReason: null,
          pov: 'keeper',
          contextRefs: [
            'entity:apprentice',
            'entity:ghost',
            'world_fact:lamps',
            'thread:harbour_debt',
            'thread:winter_debt',
            'mystery:lamp_builder',
            'chapter:4',
            'chapter:7',
            'volume:v1',
            'volume:v2',
            'volume:v3',
            'fact:harbour_rule',
            'bible_doc:lore/harbour-notes',
            'bible_doc:project/timeline',
            'bible_doc:project/open-questions',
            'bible_doc:story_state/volume-plan',
          ],
        },
      ],
    ],
    ['milestones', [{ id: 1n, projectId: 7n, milestoneKey: 'lamp_rank', state: 'open', reachedChapter: null }]],
    [
      'volumes',
      [
        { id: 1n, projectId: 7n, volumeKey: 'v1', ordinal: 1, title: 'Spring', objective: `Keep the lamp lit. ${PAYLOAD}`, body: null },
        { id: 2n, projectId: 7n, volumeKey: 'v2', ordinal: 2, title: 'Summer', objective: V2_GOAL, body: null },
        { id: 3n, projectId: 7n, volumeKey: 'v3', ordinal: 3, title: 'Winter', objective: V3_GOAL, body: null },
      ],
    ],
    [
      'canonFacts',
      [
        fact(1n, KEY, TRUTH, {
          writerNote: `Keep the lamp's price off the page. ${V3_GOAL}`,
          terms: [TERM],
          revealChapter: 5,
          unlock: { all: [{ milestone: 'lamp_rank' }] },
          allowedClues: [CLUE],
        }),
        fact(2n, 'harbour_rule', `Harbour law holds. ${PAYLOAD}`, { revealChapter: 1 }),
        fact(3n, 'pier_door', `The pier hides a door. ${PAYLOAD}`, { revealChapter: 5 }),
      ],
    ],
    ['characterKnowledge', []],
    ['chapters', [done(1), done(2), done(3), done(4, { title: `The ${TERM}`, content: `Earlier prose. ${PAYLOAD}`, summary: PAYLOAD })]],
    [
      'drafts',
      [
        {
          id: 4n,
          projectId: 7n,
          chapter: 4,
          body: 'Draft body.',
          summary: PAYLOAD,
          isolated: false,
          staleReason: null,
          state: { [`${TERM} status`]: PAYLOAD, establishedFacts: [`The ${TERM} is paid.`, 'The pier is rotten.'] },
        },
      ],
    ],
    [
      'entities',
      [
        { id: 1n, projectId: 7n, entityKey: 'keeper', name: 'Oren', type: 'character', status: 'active', body: PAYLOAD, notes: null, aliases: [] },
        {
          id: 2n,
          projectId: 7n,
          entityKey: 'apprentice',
          name: 'Tam',
          type: 'character',
          status: 'active',
          body: PAYLOAD,
          notes: null,
          aliases: [{ alias: `Heir of the ${TERM}` }],
        },
      ],
    ],
    ['characterStates', [{ projectId: 7n, entityKey: 'keeper', location: 'Pier', conditions: [], immediateGoal: null, statusNote: PAYLOAD, lastUpdatedChapter: 4 }]],
    ['entityRelationships', [{ id: 1n, projectId: 7n, entityId: 1n, targetKey: 'apprentice', kind: 'mentor', note: PAYLOAD, chapter: 4 }]],
    ['worldFacts', [{ id: 1n, projectId: 7n, category: 'lamps', key: 'fuel', value: PAYLOAD }]],
    [
      'plotThreads',
      [
        { id: 1n, projectId: 7n, threadKey: 'harbour_debt', status: 'open', openedChapter: 1, closedChapter: null, summary: PAYLOAD },
        { id: 2n, projectId: 7n, threadKey: 'winter_debt', status: 'open', openedChapter: 7, closedChapter: null, summary: 'Planned for winter.' },
      ],
    ],
    ['mysteries', [{ id: 1n, projectId: 7n, mysteryKey: 'lamp_builder', status: 'open', openedChapter: 1, question: PAYLOAD }]],
    [
      'bibleDocuments',
      [
        doc(1n, 'lore', 'harbour-notes', `Copied from the timeline and the secrets page:\n\n${PAYLOAD}`),
        doc(2n, 'project', 'timeline', `## Later\n- ${TIMELINE_LINE}`),
        doc(3n, 'project', 'open-questions', `- ${OPEN_QUESTION}`),
        doc(4n, 'story_state', 'volume-plan', `Volume three: ${V3_GOAL}`),
      ],
    ],
    [
      'decisionLedgerEntries',
      [
        {
          id: 1n,
          projectId: 7n,
          kind: 'decision',
          topic: 'voice',
          statement: 'Quiet dread.',
          why: null,
          rejectedAlternatives: [],
          writerLine: PAYLOAD,
          decidedBy: 'author',
          supersededAt: null,
          links: {},
        },
      ],
    ],
    ['contextPacks', []],
  ]);
}

const TABLE_NAMES = new Map<unknown, string>([
  [schema.contextPacks, 'contextPacks'],
  [schema.workflowRuns, 'workflowRuns'],
]);

/** The drizzle query surface over in-memory rows, honouring `where` through `sql-filter`; context packs inserted through it can be read back. */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function writerDb(rows: Map<string, Row[]>) {
  const finder = (name: string) => ({
    findFirst: async (query?: { where?: SQL }) => queryRows(rows.get(name) ?? [], { where: query?.where })[0],
    findMany: async (query?: { where?: SQL }) => queryRows(rows.get(name) ?? [], { where: query?.where }),
  });
  let nextId = 100n;
  return {
    query: new Proxy({} as Record<string, ReturnType<typeof finder>>, { get: (_, name: string) => finder(name) }),
    select: bridgeSelect(() => ({ drafts: rows.get('drafts') ?? [], reviews: rows.get('finalizeReviews') ?? [], entities: rows.get('entities') ?? [] })),
    $count: async () => 0,
    insert: (table: unknown) => ({
      values: (values: Row) => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            const row = { id: nextId++, ...values };
            rows.get(TABLE_NAMES.get(table) ?? '')?.push(row);
            return [row];
          },
        }),
      }),
    }),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
  };
}

export function writerAssembler(db: ReturnType<typeof writerDb>): ContextAssembler {
  return new ContextAssembler({ getPostgresClient: () => db } as never, { render: async () => '' } as unknown as CatalogService);
}
