import { eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { AppError, Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type DbExecutor, type PrimaryDatabase, type Refinement, schema } from '@server/database';

import { type ApplyResult, ProposalApplyService } from '../proposal-apply.service';
import { ProposalService } from '../proposal.service';
import { analyseBibleForTidy, composeTidyChangeSet, type TidyDoc, type TidyItem, type TidySelection } from './bible-tidy';

@Injectable()
export class BibleTidyService {
  private readonly logger = Logger.getLogger(APP_NAME, BibleTidyService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    databaseService: DatabaseService,
    private readonly proposalService: ProposalService,
    private readonly proposalApplyService: ProposalApplyService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  async preview(projectId: bigint): Promise<TidyItem[]> {
    const { items } = await this.analyse(this.db, projectId);
    return items;
  }

  /**
   * Re-analyses the bible and stages only the chosen items as one proposal, then applies it — so the result sits in the
   * change history and one revert undoes it. An id the fresh analysis no longer yields means its content moved since the
   * preview, and nothing is applied.
   */
  async apply(projectId: bigint, selections: readonly TidySelection[]): Promise<ApplyResult> {
    const unique = [...new Map(selections.map(selection => [selection.id, selection])).values()];
    // One snapshot for the analysis and the proposal baseline: an edit landing in between would otherwise enter the
    // baseline, pass the apply-time conflict check, and be overwritten by a change-set computed from the older text.
    const proposal = await this.db.transaction(tx => this.stage(tx, projectId, unique), { isolationLevel: 'repeatable read' });

    try {
      return await this.proposalApplyService.apply(projectId, proposal.id);
    } catch (err) {
      await this.proposalService.discard(projectId, proposal.id).catch((discardErr: unknown) => this.logger.warn('tidy: could not discard a failed proposal', { discardErr }));
      if (AppError.is(err) && err.code === AppErrorCode.RFN_003.code) throw AppErrorCode.DOC_002.create();
      throw err;
    }
  }

  private async stage(executor: DbExecutor, projectId: bigint, selections: readonly TidySelection[]): Promise<Refinement.Proposal> {
    const { docs, items } = await this.analyse(executor, projectId);
    const byId = new Map(items.map(item => [item.id, item]));
    const selected = selections.map(selection => {
      const item = byId.get(selection.id);
      if (!item) throw AppErrorCode.DOC_002.create();
      return item.kind === 'split' && selection.entityType ? { ...item, entityTypeOverride: selection.entityType } : item;
    });

    const changeSet = composeTidyChangeSet(docs, selected);
    const proposal = await this.proposalService.create(
      projectId,
      {
        scopeType: 'novel',
        kind: 'bible_audit',
        summary: `Story Bible tidy-up: ${selected.length} change${selected.length === 1 ? '' : 's'}`,
        changeSet,
        entityMaterialization: false,
      },
      executor,
    );
    this.logger.info('tidy: staged', { projectId, proposalId: proposal.id, items: selected.length, ops: changeSet.length });
    return proposal;
  }

  private async analyse(executor: DbExecutor, projectId: bigint): Promise<{ docs: TidyDoc[]; items: TidyItem[] }> {
    const project = await executor.query.projects.findFirst({ where: eq(schema.projects.id, projectId), columns: { id: true } });
    if (!project) throw AppErrorCode.PRJ_001.create();

    const rows = await executor.query.bibleDocuments.findMany({
      where: eq(schema.bibleDocuments.projectId, projectId),
      columns: { section: true, slug: true, frontmatter: true, body: true },
      orderBy: [schema.bibleDocuments.section, schema.bibleDocuments.slug],
    });
    const entities = await executor.query.entities.findMany({ where: eq(schema.entities.projectId, projectId), columns: { entityKey: true, name: true } });
    const docs = rows.map(row => ({ ...row, frontmatter: (row.frontmatter as Record<string, unknown> | null) ?? null }));
    return { docs, items: analyseBibleForTidy(docs, entities) };
  }
}
