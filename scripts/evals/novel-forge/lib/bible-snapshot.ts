import { createHash } from 'node:crypto';

import { type ForgeApi } from './forge-api.ts';
import { type Project } from './forge.types.ts';
import { stringsIn } from './text.ts';

type BibleRecordKind = 'premise' | 'doc' | 'entity' | 'fact' | 'volume';

export interface BibleRecord {
  ref: string;
  kind: BibleRecordKind;
  text: string;
  plannerOnly?: boolean;
  ordinal?: number;
}

export interface RecordDiff {
  added: string[];
  changed: string[];
  removed: string[];
}

const PREMISE_FIELDS = ['brief', 'theme', 'ending', 'endingQuestion', 'readerPromise', 'opposition', 'protagonistKey'] as const satisfies readonly (keyof Project)[];

/** Everything the Story Bible holds as searchable text, one record per page, entity, fact, volume and story field. */
export async function captureBible(api: ForgeApi, projectId: string): Promise<BibleRecord[]> {
  const [project, docs, entities, facts, volumes] = await Promise.all([
    api.getProject(projectId),
    api.listBibleDocs(projectId),
    api.listEntities(projectId),
    api.listFacts(projectId),
    api.listVolumes(projectId),
  ]);
  const records: BibleRecord[] = PREMISE_FIELDS.flatMap(field => {
    const value = project[field];
    return typeof value === 'string' && value.trim() ? [{ ref: `premise:${field}`, kind: 'premise' as const, text: value }] : [];
  });
  for (const item of docs.filter(doc => !doc.isEmpty)) {
    const doc = await api.getBibleDoc(projectId, item.section, item.slug);
    records.push({
      ref: `doc:${item.section}/${item.slug}`,
      kind: 'doc',
      text: [item.title, doc.body ?? '', ...stringsIn(doc.frontmatter ?? {})].join('\n'),
      plannerOnly: item.plannerOnly,
    });
  }
  for (const entity of entities) records.push({ ref: `entity:${entity.entityKey}`, kind: 'entity', text: stringsIn(entity).join('\n') });
  for (const fact of facts) records.push({ ref: `fact:${fact.factKey}`, kind: 'fact', text: stringsIn(fact).join('\n') });
  for (const volume of volumes)
    records.push({ ref: `volume:${volume.volumeKey}`, kind: 'volume', text: [volume.title, volume.objective, volume.body].filter(Boolean).join('\n'), ordinal: volume.ordinal });
  return records;
}

function digest(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

export function diffRecords(before: readonly BibleRecord[], after: readonly BibleRecord[]): RecordDiff {
  const was = new Map(before.map(record => [record.ref, digest(record.text)]));
  const now = new Map(after.map(record => [record.ref, digest(record.text)]));
  return {
    added: [...now.keys()].filter(ref => !was.has(ref)),
    changed: [...now.keys()].filter(ref => was.has(ref) && was.get(ref) !== now.get(ref)),
    removed: [...was.keys()].filter(ref => !now.has(ref)),
  };
}

export function isEmptyDiff(diff: RecordDiff): boolean {
  return diff.added.length + diff.changed.length + diff.removed.length === 0;
}
