import { Injectable } from '@shadow-library/app';

import { type Ledger } from '@server/database';

import { type IdeaRejectionInput, IdeaRejectionService } from './idea-rejection.service';
import { type OpToggleResult, ProposalRevertService } from './proposal-revert.service';

export interface OpUndoResult extends OpToggleResult<Ledger.Entry | null> {
  rejection: Ledger.Entry | null;
}

const REDONE_REASON = 'The author brought the change back after undoing it.';

/** Per-change undo/redo of a chat turn; the Notebook write (an undone idea is turned down, a redone one adopted) commits in the same transaction, and a no-op writes nothing. */
@Injectable()
export class ProposalOpUndoService {
  constructor(
    private readonly proposalRevertService: ProposalRevertService,
    private readonly ideaRejectionService: IdeaRejectionService,
  ) {}

  async undo(projectId: bigint, proposalId: bigint, opIndex: number, input: Partial<IdeaRejectionInput> = {}): Promise<OpUndoResult> {
    const scope = { scope: input.scope ?? 'not_now', why: input.why };
    const result = await this.proposalRevertService.undoOp(projectId, proposalId, opIndex, (tx, change) =>
      change.source === 'idea' ? this.ideaRejectionService.reject(projectId, proposalId, opIndex, scope, tx) : Promise.resolve(null),
    );
    return { ...result, rejection: result.followUp ?? null };
  }

  redo(projectId: bigint, proposalId: bigint, opIndex: number): Promise<OpToggleResult<Ledger.Entry | null>> {
    return this.proposalRevertService.redoOp(projectId, proposalId, opIndex, (tx, change) =>
      change.source === 'idea' ? this.ideaRejectionService.withdrawRejection(projectId, change.op, REDONE_REASON, tx) : Promise.resolve(null),
    );
  }
}
