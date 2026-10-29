import { type RecordFields } from './artifact-state';
import { type ChangeOp, changeSetRefs } from './change-set';

export interface ProposalOpCurrent {
  index: number;
  exists: boolean;
  values: Record<string, unknown>;
}

const CURRENT_OPS: readonly ChangeOp['op'][] = [
  'premise.update',
  'bible_document.upsert',
  'entity.upsert',
  'fact.upsert',
  'volume.upsert',
  'milestone.upsert',
  'promise.create',
  'promise.update',
];

const NON_CONTENT_KEYS = new Set(['op', 'entityKey', 'section', 'slug', 'key', 'factKey', 'volumeKey', 'milestoneKey', 'rationale', 'quote', 'startedEmpty', 'ideaId']);

export function currentRefs(changeSet: readonly ChangeOp[]): string[] {
  return changeSetRefs(changeSet.filter(op => CURRENT_OPS.includes(op.op)));
}

function currentValues(op: ChangeOp, record: RecordFields): Record<string, unknown> {
  if (op.op === 'bible_document.upsert') return { frontmatter: record['frontmatter'], body: record['body'] };
  const promise = op.op === 'promise.create' || op.op === 'promise.update';
  const carried = Object.keys(op).filter(key => !NON_CONTENT_KEYS.has(key) && !(promise && key === 'kind') && key in record);
  return Object.fromEntries(carried.map(key => [key, record[key]]));
}

export function proposalCurrent(changeSet: readonly ChangeOp[], records: ReadonlyMap<string, RecordFields>): ProposalOpCurrent[] {
  return changeSet.flatMap((op, index) => {
    if (!CURRENT_OPS.includes(op.op)) return [];
    const record = records.get(changeSetRefs([op])[0] ?? '');
    return [record ? { index, exists: true, values: currentValues(op, record) } : { index, exists: false, values: {} }];
  });
}
