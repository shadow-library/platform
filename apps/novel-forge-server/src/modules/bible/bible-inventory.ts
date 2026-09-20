import { countWords } from '@modules/eval/deterministic-metrics';

import { type Knowledge } from '@server/database';

export interface InventoryDoc {
  section: string;
  slug: string;
  revision: number;
  body: string | null;
}

export interface InventoryEntity {
  entityKey: string;
  name: string;
  type: Knowledge.EntityType;
}

export function firstLine(body: string | null): string {
  const line = (body ?? '')
    .split('\n')
    .map(part => part.trim())
    .find(part => part.length > 0 && !part.startsWith('#'));
  if (!line) return '(empty)';
  return line.length > 200 ? `${line.slice(0, 200)}…` : line;
}

export function renderDocInventory(docs: readonly InventoryDoc[]): string {
  if (docs.length === 0) return 'none';
  return docs.map(doc => `${doc.section}/${doc.slug} (revision ${doc.revision}, ${countWords(doc.body ?? '')} words) — ${firstLine(doc.body)}`).join('\n');
}

export function countEntitiesByType(entities: readonly InventoryEntity[]): Map<Knowledge.EntityType, number> {
  const counts = new Map<Knowledge.EntityType, number>();
  for (const entity of entities) counts.set(entity.type, (counts.get(entity.type) ?? 0) + 1);
  return counts;
}

export function renderEntityInventory(entities: readonly InventoryEntity[]): string {
  if (entities.length === 0) return 'none — no entity records exist for this project';
  const byType = new Map<Knowledge.EntityType, InventoryEntity[]>();
  for (const entity of entities) {
    const bucket = byType.get(entity.type);
    if (bucket) bucket.push(entity);
    else byType.set(entity.type, [entity]);
  }
  return [...byType].map(([type, members]) => `${type} (${members.length}): ${members.map(member => `${member.entityKey} "${member.name}"`).join(', ')}`).join('\n');
}
