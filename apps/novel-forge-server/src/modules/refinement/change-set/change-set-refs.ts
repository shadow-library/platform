import { type ChangeOp } from './change-set.types';
import { isActionOp } from './op-specs';

/** The decisions a change-set's actions stage, so a restaged plan or approval replaces its card: one per chat for a plan, else one per action and target. */
export function actionDecisionKeys(ops: ChangeOp[]): string[] {
  const keys = ops.filter(isActionOp).map(op => {
    if (op.op === 'action.plan_chapter') return op.op;
    if ('chapter' in op && typeof op.chapter === 'number') return `${op.op}:${op.chapter}`;
    if ('volumeKey' in op) return `${op.op}:${op.volumeKey}`;
    return op.op;
  });
  return [...new Set(keys)];
}

/** The artifact refs a change-set touches — the keys used for baselines, conflict checks, and supersession. Actions touch none. */
export function changeSetRefs(ops: ChangeOp[]): string[] {
  const refs = ops.flatMap(op => {
    if (isActionOp(op)) return [];
    if (op.op === 'premise.update') return ['premise'];
    if (op.op === 'bible_document.upsert' || op.op === 'bible_document.remove') return [`doc:${op.section}/${op.slug}`];
    if (op.op === 'volume.upsert' || op.op === 'volume.remove') return [`volume:${op.volumeKey}`];
    if (op.op === 'entity.upsert' || op.op === 'entity.remove') return [`entity:${op.entityKey}`];
    if (op.op === 'fact.upsert' || op.op === 'fact.remove') return [`fact:${op.factKey}`];
    if (op.op === 'milestone.upsert' || op.op === 'milestone.remove') return [`milestone:${op.milestoneKey}`];
    if (op.op === 'promise.create' || op.op === 'promise.update' || op.op === 'promise.set_payoff' || op.op === 'promise.drop') return [`promise:${op.kind}:${op.key}`];
    if (op.op === 'organise.rule') return [];
    if (op.op === 'draft.update' || op.op === 'draft.remove' || op.op === 'draft.rewrite_passage') return [`draft:${op.chapter}`];
    return [`chapter:${op.chapter}`];
  });
  return [...new Set(refs)];
}
