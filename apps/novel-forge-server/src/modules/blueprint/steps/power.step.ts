import { Field, Schema } from '@shadow-library/class-schema';

import { AppErrorCode } from '@server/classes';
import { type Ledger } from '@server/database';

import { ENGINE_LINE_MAX, ENGINE_NAME_MAX, ENGINE_WRITER_LINE_MAX, LADDER_RUNGS_MAX } from '../../ai/schemas/blueprint-engine.schema';
import { type ContentOp } from '../../refinement/change-set';
import { type LockPlan, type SourcedScreenStep } from '../engine/blueprint-step.types';
import { promiseTailoringApplies } from '../stage/promise-tailoring';
import { loadPageBody, upsertPageSections } from './bible-page';
import { contentKey, lockedLinks, removedContentOps } from './content-keys';
import { ENGINE_STEP_KEY, type EngineOptions, type PowerSliceOptions } from './engine.step';
import { OPEN_FROM_CHAPTER, POWER_PAGE } from './world.step';

export const POWER_STEP_KEY = 'power';
export const POWER_TOPIC = 'world.power';
export const POWER_WHY_MAX = 400;

const LADDER_HEADING = 'The ladder';

@Schema()
export class LadderRungChoice {
  @Field({ optional: true, pattern: '^rg[0-9]+$' })
  optionId?: string;

  @Field({ minLength: 1, maxLength: ENGINE_NAME_MAX })
  name: string;

  @Field({ minLength: 1, maxLength: ENGINE_LINE_MAX, description: 'What this rung buys that the one below does not.' })
  buys: string;

  @Field({ minLength: 1, maxLength: ENGINE_LINE_MAX, description: 'What it costs, in the currency the cost rule names.' })
  cost: string;
}

@Schema()
export class PowerSelection {
  @Field(() => [LadderRungChoice], { minItems: 2, maxItems: LADDER_RUNGS_MAX, description: 'The ladder, cheapest rung first.' })
  rungs: LadderRungChoice[];

  @Field({ optional: true, maxLength: ENGINE_LINE_MAX, description: 'Where the protagonist stands on the ladder when the novel opens.' })
  note?: string;

  @Field({ optional: true, maxLength: POWER_WHY_MAX })
  why?: string;

  @Field({ minLength: 1, maxLength: ENGINE_WRITER_LINE_MAX, description: 'What the ladder means for whoever writes chapter one.' })
  writerLine: string;
}

interface KeyedRung {
  rung: LadderRungChoice;
  entityKey: string;
  factKey: string;
}

function keyRungs(rungs: LadderRungChoice[]): KeyedRung[] {
  const entities = new Set<string>();
  const facts = new Set<string>();
  return rungs.map(rung => ({ rung, entityKey: contentKey('rank', rung.name, entities), factKey: contentKey('rank', rung.name, facts) }));
}

function rungFact(rung: LadderRungChoice): string {
  return `${rung.name.trim()} buys ${rung.buys.trim()}, and costs ${rung.cost.trim()}.`;
}

function ladderBody(keyed: KeyedRung[], note: string | undefined): string {
  const rows = keyed.map(({ rung }) => `| ${rung.name.trim()} | ${rung.buys.trim()} | ${rung.cost.trim()} |`);
  const table = ['| Rank | Buys | Costs |', '| --- | --- | --- |', ...rows].join('\n');
  return [table, note?.trim() ? `*${note.trim()}*` : null].filter(Boolean).join('\n\n');
}

function assertSelection(selection: PowerSelection): void {
  const empty = selection.rungs.find(rung => !rung.name.trim() || !rung.buys.trim() || !rung.cost.trim());
  if (empty) throw AppErrorCode.BPR_004.create({ part: 'selection', issues: 'every rung needs a name, what it buys and what it costs' });
  if (!selection.writerLine.trim()) throw AppErrorCode.BPR_004.create({ part: 'selection', issues: 'say what the ladder means for whoever writes chapter one' });
  const names = selection.rungs.map(rung => rung.name.trim().toLowerCase());
  if (new Set(names).size !== names.length) throw AppErrorCode.BPR_004.create({ part: 'selection', issues: 'two rungs have the same name' });
}

export const powerStep: SourcedScreenStep<EngineOptions, PowerSliceOptions | null, PowerSelection> = {
  kind: 'screen',
  key: POWER_STEP_KEY,
  phase: 'world',
  required: true,
  completionTopics: [POWER_TOPIC],
  nudges: ['More rungs', 'Fewer rungs', 'Harsher costs', 'Slower climb'],
  appliesWhen: ledger => promiseTailoringApplies('power_ladder', ledger),
  selectionSchema: PowerSelection,
  source: { step: ENGINE_STEP_KEY, select: options => options.power ?? null },

  describeView(view) {
    return (view?.rungs ?? []).map(rung => ({ id: rung.id, label: `${rung.name} — ${rung.buys}` }));
  },

  chosenOptionIds(selection) {
    return selection.rungs.flatMap(rung => (rung.optionId ? [rung.optionId] : []));
  },

  /** The ladder shares the power page with the cost rule, so it merges its own section in rather than rewriting the page; its facts are open canon from chapter one. */
  async materialise(selection, { ledger, project, tx }) {
    assertSelection(selection);
    const keyed = keyRungs(selection.rungs);
    const body = upsertPageSections(await loadPageBody(tx, project.id, POWER_PAGE), 'Power and its cost', null, [
      { heading: LADDER_HEADING, body: ladderBody(keyed, selection.note) },
    ]);

    const links: Ledger.Links = { bibleDocuments: [POWER_PAGE], entityKeys: keyed.map(item => item.entityKey), factKeys: keyed.map(item => item.factKey) };
    const changeSet: ContentOp[] = [
      ...keyed.map(({ rung, entityKey }): ContentOp => ({ op: 'entity.upsert', entityKey, type: 'power_rule', name: rung.name.trim(), body: rungFact(rung) })),
      { op: 'bible_document.upsert', ...POWER_PAGE, body },
      ...keyed.map(({ rung, factKey, entityKey }): ContentOp => ({ op: 'fact.upsert', factKey, body: rungFact(rung), subjects: [entityKey], revealChapter: OPEN_FROM_CHAPTER })),
      ...removedContentOps(lockedLinks(ledger, POWER_STEP_KEY), links),
    ];

    const plan: LockPlan = {
      entries: [
        {
          kind: 'decision',
          topic: POWER_TOPIC,
          statement: keyed.map(({ rung }) => rung.name.trim()).join(' → '),
          why: selection.why?.trim() || null,
          writerLine: selection.writerLine.trim(),
          payload: {
            rungs: keyed.map(({ rung, factKey }) => ({ name: rung.name.trim(), buys: rung.buys.trim(), cost: rung.cost.trim(), factKey })),
            ...(selection.note?.trim() ? { note: selection.note.trim() } : {}),
          },
          links,
        },
      ],
      changeSet,
      summary: 'Blueprint: the power ladder',
    };
    return plan;
  },
};
