import { Field, Schema } from '@shadow-library/class-schema';

import { AppErrorCode } from '@server/classes';
import { OPEN_FROM_CHAPTER } from '@server/common';
import { type Ledger } from '@server/database';

import { ENGINE_LINE_MAX, ENGINE_TEXT_MAX, ENGINE_WRITER_LINE_MAX, WORLD_RULES_MAX } from '../../ai/schemas/blueprint-engine.schema';
import { type ContentOp } from '../../refinement/change-set';
import { type LockPlan, type PlannedLedgerEntry, type SourcedScreenStep } from '../engine/blueprint-step.types';
import { mergeLedgerLinks } from '../ledger/ledger-entries';
import { loadPageBody, type PageRef, upsertPageSections } from './bible-page';
import { contentKey, lockedLinks, removedContentOps, shortName } from './content-keys';
import { ENGINE_STEP_KEY, type EngineOptions, type WorldSliceOptions } from './engine.step';

export const WORLD_STEP_KEY = 'world';
export const WORLD_RULES_TOPIC = 'world.rules';
export const WORLD_COST_TOPIC = 'world.cost';
export const WORLD_WHY_MAX = 400;
export const WORLD_PAGE: PageRef = { section: 'world', slug: 'setting-overview' };
export const POWER_PAGE: PageRef = { section: 'power', slug: 'system-and-limits' };
export const COST_RULE_KEY = 'cost_of_power';

const COST_HEADING = 'The cost of power';

@Schema()
export class WorldCostChoice {
  @Field({ optional: true, pattern: '^cr[0-9]+$' })
  optionId?: string;

  @Field({ minLength: 1, maxLength: ENGINE_LINE_MAX, description: 'What power costs, concrete enough that a chapter can pay it on the page.' })
  rule: string;

  @Field({ optional: true, maxLength: ENGINE_LINE_MAX })
  why?: string;

  @Field({ minLength: 1, maxLength: ENGINE_WRITER_LINE_MAX, description: 'What the cost means for whoever writes chapter one; it rides every chapter pack.' })
  writerLine: string;
}

@Schema()
export class WorldRuleChoice {
  @Field({ optional: true, pattern: '^wr[0-9]+$' })
  optionId?: string;

  @Field({ minLength: 1, maxLength: ENGINE_LINE_MAX, description: 'A hard rule. It becomes a canon fact, so it is what the chapter writer is held to.' })
  rule: string;

  @Field({ optional: true, maxLength: ENGINE_LINE_MAX })
  why?: string;
}

@Schema()
export class WorldSocietyChoice {
  @Field({ minLength: 1, maxLength: ENGINE_TEXT_MAX })
  order: string;

  @Field({ minLength: 1, maxLength: ENGINE_TEXT_MAX })
  economy: string;
}

@Schema()
export class WorldSelection {
  @Field({ minLength: 1, maxLength: ENGINE_LINE_MAX, description: 'How this world works, in one line.' })
  summary: string;

  @Field(() => WorldCostChoice, { description: 'The cost rule. An identity decision: chosen from what was offered or written in the author’s own words.' })
  cost: WorldCostChoice;

  @Field(() => [WorldRuleChoice], { minItems: 1, maxItems: WORLD_RULES_MAX })
  rules: WorldRuleChoice[];

  @Field(() => WorldSocietyChoice, { optional: true, description: 'Asked for instead of a power ladder when progression does not drive the novel.' })
  society?: WorldSocietyChoice;

  @Field({ optional: true, maxLength: WORLD_WHY_MAX })
  why?: string;

  @Field({ minLength: 1, maxLength: ENGINE_WRITER_LINE_MAX, description: 'What these rules mean for whoever writes chapter one.' })
  writerLine: string;
}

interface KeyedRule {
  rule: WorldRuleChoice;
  entityKey: string;
  factKey: string;
}

function keyRules(rules: WorldRuleChoice[]): KeyedRule[] {
  const entities = new Set<string>();
  const facts = new Set<string>();
  return rules.map(rule => ({ rule, entityKey: contentKey('world_rule', rule.rule, entities), factKey: contentKey('world_rule', rule.rule, facts) }));
}

function ruleLine(rule: WorldRuleChoice): string {
  const why = rule.why?.trim();
  return `- ${rule.rule.trim()}${why ? ` — *${why}*` : ''}`;
}

function worldBody(current: string | null, selection: WorldSelection, keyed: KeyedRule[]): string {
  const society = selection.society;
  return upsertPageSections(current, 'The world', selection.summary.trim(), [
    { heading: 'Rules', body: keyed.map(({ rule }) => ruleLine(rule)).join('\n') },
    { heading: 'Society and economy', body: society ? `${society.order.trim()}\n\n${society.economy.trim()}` : '' },
  ]);
}

function costBody(current: string | null, selection: WorldSelection): string {
  const why = selection.cost.why?.trim();
  const body = [selection.cost.rule.trim(), why ? `*${why}*` : null, `**Means for the writer:** ${selection.cost.writerLine.trim()}`].filter(Boolean).join('\n\n');
  return upsertPageSections(current, 'Power and its cost', null, [{ heading: COST_HEADING, body }]);
}

/**
 * Rules are open canon, not spoilers. A fact with no reveal chapter is one no chapter may state until a brief reveals it on the page, so
 * these are scheduled for chapter one: the writer is held to them from the first word rather than having them withheld as a secret.
 */
function factOp(factKey: string, body: string, why: string | undefined, subject: string): ContentOp {
  return { op: 'fact.upsert', factKey, body, subjects: [subject], revealChapter: OPEN_FROM_CHAPTER, ...(why?.trim() ? { constraintNote: why.trim() } : {}) };
}

function assertSelection(selection: WorldSelection): void {
  if (!selection.summary.trim()) throw AppErrorCode.BPR_004.create({ part: 'selection', issues: 'say how this world works, in one line' });
  if (!selection.cost.rule.trim()) throw AppErrorCode.BPR_004.create({ part: 'selection', issues: 'the cost rule is empty' });
  if (!selection.cost.writerLine.trim()) throw AppErrorCode.BPR_004.create({ part: 'selection', issues: 'say what the cost rule means for whoever writes chapter one' });
  if (!selection.writerLine.trim()) throw AppErrorCode.BPR_004.create({ part: 'selection', issues: 'say what the rules mean for whoever writes chapter one' });
  if (selection.rules.every(rule => !rule.rule.trim())) throw AppErrorCode.BPR_004.create({ part: 'selection', issues: 'name at least one rule the world runs on' });
}

export const worldStep: SourcedScreenStep<EngineOptions, WorldSliceOptions | null, WorldSelection> = {
  kind: 'screen',
  key: WORLD_STEP_KEY,
  phase: 'world',
  required: true,
  completionTopics: [WORLD_COST_TOPIC, WORLD_RULES_TOPIC],
  nudges: ['Harsher costs', 'A loophole', 'What do commoners use?', 'Plainer words'],
  selectionSchema: WorldSelection,
  source: { step: ENGINE_STEP_KEY, select: options => options.world ?? null },

  describeView(view) {
    return [...(view?.costRules ?? []).map(cost => ({ id: cost.id, label: cost.rule })), ...(view?.rules ?? []).map(rule => ({ id: rule.id, label: rule.rule }))];
  },

  chosenOptionIds(selection) {
    return [...(selection.cost.optionId ? [selection.cost.optionId] : []), ...selection.rules.flatMap(rule => (rule.optionId ? [rule.optionId] : []))];
  },

  /**
   * Two decisions: the cost of power, which is an identity decision, and the rules the world runs on. Each rule also becomes a canon
   * fact, because a fact is what the chapter writer is held to and a page is only what they are told.
   */
  async materialise(selection, { round, ledger, project, tx }) {
    assertSelection(selection);
    const keyed = keyRules(selection.rules.filter(rule => rule.rule.trim()));
    const [worldPage, powerPage] = await Promise.all([loadPageBody(tx, project.id, WORLD_PAGE), loadPageBody(tx, project.id, POWER_PAGE)]);

    const costLinks: Ledger.Links = { bibleDocuments: [POWER_PAGE], entityKeys: [COST_RULE_KEY], factKeys: [COST_RULE_KEY] };
    const ruleLinks: Ledger.Links = {
      bibleDocuments: [WORLD_PAGE],
      entityKeys: keyed.map(item => item.entityKey),
      factKeys: keyed.map(item => item.factKey),
    };

    const changeSet: ContentOp[] = [
      { op: 'entity.upsert', entityKey: COST_RULE_KEY, type: 'power_rule', name: COST_HEADING, body: selection.cost.rule.trim() },
      ...keyed.map(({ rule, entityKey }): ContentOp => ({ op: 'entity.upsert', entityKey, type: 'concept', name: shortName(rule.rule), body: ruleLine(rule) })),
      { op: 'bible_document.upsert', ...WORLD_PAGE, body: worldBody(worldPage, selection, keyed) },
      { op: 'bible_document.upsert', ...POWER_PAGE, body: costBody(powerPage, selection) },
      factOp(COST_RULE_KEY, selection.cost.rule.trim(), selection.cost.why, COST_RULE_KEY),
      ...keyed.map(({ rule, factKey, entityKey }) => factOp(factKey, rule.rule.trim(), rule.why, entityKey)),
      ...removedContentOps(lockedLinks(ledger, WORLD_STEP_KEY), mergeLedgerLinks(costLinks, ruleLinks)),
    ];

    const offered = round?.options ?? null;
    const keptOfferedRules = keyed.every(
      ({ rule }) => rule.optionId !== undefined && offered?.rules.some(option => option.id === rule.optionId && option.rule === rule.rule.trim()),
    );
    const cost: PlannedLedgerEntry = {
      kind: 'decision',
      topic: WORLD_COST_TOPIC,
      statement: selection.cost.rule.trim(),
      why: selection.cost.why?.trim() || null,
      writerLine: selection.cost.writerLine.trim(),
      rejectedAlternatives: (offered?.costRules ?? []).map(option => option.rule).filter(rule => rule.trim() !== selection.cost.rule.trim()),
      payload: { ownWords: selection.cost.optionId === undefined },
      links: costLinks,
    };
    const rules: PlannedLedgerEntry = {
      kind: 'decision',
      topic: WORLD_RULES_TOPIC,
      statement: selection.summary.trim(),
      why: selection.why?.trim() || null,
      writerLine: selection.writerLine.trim(),
      payload: {
        rules: keyed.map(({ rule, factKey }) => ({ rule: rule.rule.trim(), ...(rule.why?.trim() ? { why: rule.why.trim() } : {}), factKey })),
        ...(selection.society ? { society: { order: selection.society.order.trim(), economy: selection.society.economy.trim() } } : {}),
        ...(offered?.honoured.length && keptOfferedRules ? { honoured: offered.honoured } : {}),
      },
      links: ruleLinks,
    };

    const plan: LockPlan = { entries: [cost, rules], changeSet, summary: 'Blueprint: how the world works' };
    return plan;
  },
};
