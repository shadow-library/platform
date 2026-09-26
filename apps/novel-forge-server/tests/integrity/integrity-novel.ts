import { schema } from '@server/database';

import { type IntegrityStore } from './integrity-store';

export const PROJECT_ID = 7n;

/** Marks every sentence of isolated prose, so any standard-readable copy of it is found by a plain search. */
export const VEILED = 'VEILED';

export const ENDING = 'The keeper floods the valley to save the harbour town.';
export const ENDING_QUESTION = 'Will the harbour town outlast the flood season?';
export const LATER_VOLUME_OBJECTIVE = 'Win back the drowned valley from the river lords.';
export const TIMELINE_BODY = 'In chapter nine the keeper sells the lighthouse to the river lords. The ferry never sails again after that night.';
export const TIMELINE_SENTENCES = ['In chapter nine the keeper sells the lighthouse to the river lords', 'The ferry never sails again after that night'];

export interface SecretFixture {
  factKey: string;
  text: string;
  terms: string[];
  milestone: string | null;
}

export const SECRETS: readonly SecretFixture[] = [
  { factKey: 'lantern_secret', text: 'The old lantern burns on borrowed memories.', terms: ['borrowed memories'], milestone: 'lantern_lit' },
  { factKey: 'causeway_truth', text: 'The causeway was built over the sunken hamlet.', terms: ['sunken hamlet'], milestone: 'causeway_crossed' },
  { factKey: 'tide_debt', text: 'The tide keeper owes the river a single name.', terms: ['owes the river'], milestone: null },
];

export const MILESTONES = ['lantern_lit', 'causeway_crossed'] as const;
export const ENTITIES = ['ada', 'bram'] as const;
export const LEARNS = [
  { entityKey: 'ada', factKey: 'tide_debt' },
  { entityKey: 'ada', factKey: 'lantern_secret' },
  { entityKey: 'bram', factKey: 'causeway_truth' },
] as const;
export const PLANNED_CHAPTERS = 6;

/** A small invented novel: two characters, two milestones, three secrets (two gated by a milestone), six chapter plans and a planner-only timeline page. */
export function seedNovel(store: IntegrityStore): void {
  store.seed(schema.projects, [
    {
      id: PROJECT_ID,
      title: 'The Harbour Keeper',
      storyCurrentChapter: 0,
      contentMode: 'standard',
      config: null,
      ending: ENDING,
      endingQuestion: ENDING_QUESTION,
    },
  ]);
  store.seed(
    schema.entities,
    ENTITIES.map(entityKey => ({ projectId: PROJECT_ID, entityKey, name: entityKey === 'ada' ? 'Ada' : 'Bram', type: 'character', origin: 'manual', status: 'active' })),
  );
  store.seed(schema.milestones, [
    { projectId: PROJECT_ID, milestoneKey: 'lantern_lit', label: 'Ada lights the old lantern', kind: 'custom', state: 'planned', plannedChapter: 2 },
    { projectId: PROJECT_ID, milestoneKey: 'causeway_crossed', label: 'Bram crosses the causeway', kind: 'custom', state: 'open' },
  ]);
  store.seed(
    schema.canonFacts,
    SECRETS.map(secret => ({
      projectId: PROJECT_ID,
      factKey: secret.factKey,
      text: secret.text,
      terms: secret.terms,
      source: 'manual',
      revealChapter: secret.milestone ? null : 2,
      unlock: secret.milestone ? { all: [{ milestone: secret.milestone }] } : null,
    })),
  );
  store.seed(schema.volumes, [
    { projectId: PROJECT_ID, volumeKey: 'v1', ordinal: 1, title: 'The Causeway', objective: 'Reach the causeway before the flood.', state: 'active' },
    { projectId: PROJECT_ID, volumeKey: 'v2', ordinal: 2, title: 'The Valley', objective: LATER_VOLUME_OBJECTIVE, state: 'not_started' },
  ]);
  store.seed(schema.bibleDocuments, [{ projectId: PROJECT_ID, section: 'project', slug: 'timeline', frontmatter: { title: 'Timeline' }, body: TIMELINE_BODY }]);
  store.seed(
    schema.briefs,
    Array.from({ length: PLANNED_CHAPTERS }, (_, index) => {
      const chapter = index + 1;
      const learns = chapter === 2 ? [{ entityKey: 'ada', factKey: 'lantern_secret' }] : chapter === 3 ? [{ entityKey: 'ada', factKey: 'tide_debt' }] : [];
      return {
        projectId: PROJECT_ID,
        chapter,
        volumeKey: 'v1',
        body: `Chapter ${chapter}: Ada and Bram keep the harbour through another tide.`,
        contentMode: 'standard',
        revision: 1,
        isEnding: false,
        claimedMilestones: chapter === 2 ? ['lantern_lit'] : null,
        knowledgeContract: { pov: ['ada'], learns },
      };
    }),
  );
}
