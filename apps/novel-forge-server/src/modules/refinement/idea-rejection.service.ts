import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type Ledger, type PrimaryDatabase, type PrimaryTransaction } from '@server/database';

import { ideaTopic } from '../ledger/ledger-sections';
import { LedgerService } from '../ledger/ledger.service';
import { type SupersedingEntry } from '../ledger/ledger.types';
import { type ChangeOp, changeSetRefs, isActionOp } from './change-set';
import { ideaIdOf, ideaLabel } from './idea-id';
import { loadRejectionContext, rejectionAnchor } from './idea-rejections';
import { ProposalService } from './proposal.service';

export interface IdeaRejectionInput {
  scope: Ledger.RejectionScope;
  why?: string;
}

@Injectable()
export class IdeaRejectionService {
  private readonly logger = Logger.getLogger(APP_NAME, IdeaRejectionService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    databaseService: DatabaseService,
    private readonly proposalService: ProposalService,
    private readonly ledgerService: LedgerService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  /**
   * Records the author turning down one op of a card as a Notebook rejection keyed by its idea, anchored to what the scope is measured
   * against now. Turning the same idea down again replaces the earlier scope rather than stacking a second entry. With `tx` it records
   * inside the caller's transaction, anchored to what that transaction has written so far.
   */
  async reject(projectId: bigint, proposalId: bigint, opIndex: number, input: IdeaRejectionInput, tx?: PrimaryTransaction): Promise<Ledger.Entry> {
    const proposal = await this.proposalService.get(projectId, proposalId);
    const op = (proposal.changeSet as ChangeOp[])[opIndex];
    if (!op) throw AppErrorCode.LDG_006.create({ opIndex: String(opIndex) });
    if (isActionOp(op)) throw AppErrorCode.LDG_007.create();
    const refs = changeSetRefs([op]);
    if (input.scope === 'not_this_version' && refs.length === 0) throw AppErrorCode.LDG_008.create();

    const ideaId = ideaIdOf(op);
    const context = input.scope === 'never' ? null : await loadRejectionContext(tx ?? this.db, projectId, [], input.scope === 'not_this_version' ? refs : []);
    const entry: SupersedingEntry = {
      kind: 'rejected',
      decidedBy: 'author',
      statement: ideaLabel(op),
      why: input.why,
      idea: { ideaId, scope: input.scope, anchor: context ? rejectionAnchor(input.scope, context, refs) : null },
    };

    const topic = ideaTopic(ideaId);
    // A savepoint inside the caller's transaction, so a refused insert leaves it usable for the fallback below.
    const attempt = tx ? tx.transaction(savepoint => this.record(projectId, topic, entry, savepoint)) : this.record(projectId, topic, entry);
    const recorded = await attempt.catch(async (err: unknown) => {
      // The unique active-idea index refuses a second first-time rejection racing this one; the winner's entry is then superseded.
      const [winner] = await this.ledgerService.listActive(projectId, { topics: [topic] });
      if (!winner) throw err;
      return this.ledgerService.supersede(projectId, winner.id, entry, tx);
    });
    this.logger.info('idea turned down', { projectId, proposalId, opIndex, ideaId, scope: input.scope, entryId: recorded.id });
    return recorded;
  }

  /** Takes back the author's rejection of an idea they have since adopted, so it stops steering the model away from what the book now holds. */
  async withdrawRejection(projectId: bigint, op: ChangeOp, reason: string, tx?: PrimaryTransaction): Promise<Ledger.Entry | null> {
    const [active] = await this.ledgerService.listActive(projectId, { topics: [ideaTopic(ideaIdOf(op))] });
    if (!active) return null;
    const withdrawn = await this.ledgerService.withdraw(projectId, active.id, reason, tx);
    this.logger.info('idea rejection withdrawn', { projectId, ideaId: active.ideaId, entryId: withdrawn.id });
    return withdrawn;
  }

  private async record(projectId: bigint, topic: string, entry: SupersedingEntry, tx?: PrimaryTransaction): Promise<Ledger.Entry> {
    const [active] = await this.ledgerService.listActive(projectId, { topics: [topic] });
    if (active) return this.ledgerService.supersede(projectId, active.id, entry, tx);
    const [appended] = await this.ledgerService.append(projectId, [{ ...entry, topic }], tx);
    return appended as Ledger.Entry;
  }
}
