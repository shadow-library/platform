import { eq } from 'drizzle-orm';

import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';

import { finalizePack } from './pack-finalize';
import { type PackOptions, type PackPolicyOptions } from './pack-options';
import { asStable, makeSection, renderPremise } from './pack-render';
import { type AssembledPack, type ContextPurpose, type ContextSection } from './sections';

export const PREMISE_BUDGET = 8_000;
export const AUDIT_BUDGET = 12_000;

export class PremisePackBuilder {
  constructor(private readonly db: PrimaryDatabase) {}

  /** Pack for premise enhancement; the bible audit reuses it with a fuller document inventory. */
  async forPremise(projectId: bigint, opts?: PackOptions): Promise<AssembledPack & { id: bigint | null }> {
    return this.build(projectId, 'premise', 1, opts?.budgetTokens ?? PREMISE_BUDGET, opts);
  }

  async forAudit(projectId: bigint, opts?: PackOptions): Promise<AssembledPack & { id: bigint | null }> {
    return this.build(projectId, 'audit', 5, opts?.budgetTokens ?? AUDIT_BUDGET, opts);
  }

  private async build(
    projectId: bigint,
    purpose: ContextPurpose,
    inventoryLines: number,
    budgetTokens: number,
    opts?: PackPolicyOptions,
  ): Promise<AssembledPack & { id: bigint | null }> {
    const [project, docs] = await Promise.all([
      this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) }),
      this.db.query.bibleDocuments.findMany({ where: eq(schema.bibleDocuments.projectId, projectId), orderBy: [schema.bibleDocuments.section, schema.bibleDocuments.slug] }),
    ]);

    const sections: ContextSection[] = [];
    if (project) sections.push(asStable(makeSection('premise', renderPremise(project), 'canonical', ['premise'])));
    if (docs.length > 0) {
      const inventory = docs.map(d => `${d.section}/${d.slug}:\n${(d.body ?? '').split('\n').slice(0, inventoryLines).join('\n')}`).join('\n\n');
      sections.push(asStable(makeSection('doc_inventory', inventory, 'canonical', [])));
    }

    return finalizePack(this.db, projectId, purpose, null, sections, [], budgetTokens, opts);
  }
}
