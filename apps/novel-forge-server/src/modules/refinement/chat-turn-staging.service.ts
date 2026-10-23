import { eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, type Refinement, schema } from '@server/database';

import { HUB_ALLOWED_OPS } from '../ai/prompts';
import { type ChatRefineOutput } from '../ai/schemas';
import { ActionExecutorRegistry } from './action-registry';
import { type ChangeOp, parseOptionalChangeSet } from './change-set';
import { loadRejectedIdeas } from './idea-rejections';
import { ORGANISE_NOTES_OP, type OrganiseRouting } from './later-plans-guard';
import { anchorPassageRewrites, droppedRewritesNote } from './passage-rewrite';
import { ProposalApplyService } from './proposal-apply.service';
import { ProposalService } from './proposal.service';
import { IDEAS_DROPPED_NOTE, splitTurnChangeSet, stageTurnChangeSet, startNotesOrganise, turnHold, type TurnProposalPort, type TurnStaging } from './turn-proposals';

export interface StagingContext {
  justDiscussing: boolean;
  organise: OrganiseRouting;
  /** The passage comments the author sent this turn, which tell a rewrite's passage apart when its words occur more than once. */
  contexts: readonly Refinement.ChatPassageContext[];
}

@Injectable()
export class ChatTurnStagingService {
  private readonly logger = Logger.getLogger(APP_NAME, ChatTurnStagingService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    databaseService: DatabaseService,
    private readonly proposalService: ProposalService,
    private readonly proposalApplyService: ProposalApplyService,
    private readonly actionRegistry: ActionExecutorRegistry,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  /** A rewrite that cannot be placed in its chapter is left out before the split, and the reply says which and why. */
  async stageChangeSet(
    projectId: bigint,
    session: Refinement.ChatSession,
    message: Refinement.ChatMessage,
    authorMessage: string,
    output: ChatRefineOutput,
    runId: string,
    warnings: string[],
    staging: StagingContext,
  ): Promise<TurnStaging & { replyNote?: string }> {
    const proposed = parseOptionalChangeSet(output.changeSet, HUB_ALLOWED_OPS);
    if (proposed.length === 0) return { appliedProposal: null, cardProposal: null };
    const { ops, dropped } = await anchorPassageRewrites(this.db, projectId, proposed, staging.contexts);
    if (dropped.length > 0) this.logger.info('chat turn: left out passage rewrites it could not place', { projectId, runId, dropped });
    const staged: TurnStaging & { replyNote?: string } =
      ops.length === 0
        ? { appliedProposal: null, cardProposal: null }
        : await this.stageAnchored(projectId, session, message, authorMessage, output, ops, runId, warnings, staging);
    const replyNote = [staged.replyNote, droppedRewritesNote(dropped)].filter(Boolean).join('\n\n');
    return { ...staged, ...(replyNote ? { replyNote } : {}) };
  }

  /** Splits the change-set by the write policy and stages it as at most two proposals: what applies in the turn, and the rest as cards. */
  private async stageAnchored(
    projectId: bigint,
    session: Refinement.ChatSession,
    message: Refinement.ChatMessage,
    authorMessage: string,
    output: ChatRefineOutput,
    ops: ChangeOp[],
    runId: string,
    warnings: string[],
    { justDiscussing, organise }: StagingContext,
  ): Promise<TurnStaging & { replyNote?: string }> {
    const stage: TurnProposalPort['stage'] = (changeSet, stageWarnings, options) =>
      this.proposalService
        .create(projectId, {
          sessionId: session.id,
          messageId: message.id,
          scopeType: session.scopeType,
          scopeRef: session.scopeRef,
          kind: session.scopeType === 'project' ? 'hub' : 'chat',
          summary: output.reply.split('\n', 1)[0]?.slice(0, 300),
          changeSet,
          allowedOps: HUB_ALLOWED_OPS,
          entityMaterialization: options.entityMaterialization,
          runId,
          warnings: stageWarnings,
        })
        .catch((err: unknown) => {
          this.logger.warn('chat turn: staging a proposal failed', { projectId, runId, err });
          throw err;
        });

    const organiseOnly = ops.length === 1 && ops[0]?.op === ORGANISE_NOTES_OP;
    if (organise === 'start' && organiseOnly && turnHold(warnings) !== 'turn') {
      const started = await startNotesOrganise(
        {
          stage,
          refusal: action => this.actionRegistry.refusal(projectId, action),
          accept: proposalId => this.proposalApplyService.apply(projectId, proposalId),
        },
        warnings,
      );
      this.logger.info('chat turn: organising the notes the author asked for', { projectId, runId, started: started.cardProposal === null, note: started.note });
      return { appliedProposal: null, cardProposal: started.cardProposal, replyNote: started.note };
    }

    const rejectedIdeas = (ideaIds: string[]) =>
      loadRejectedIdeas(this.db, projectId, ideaIds).catch((err: unknown) => {
        this.logger.warn('chat turn: reading turned-down ideas failed — every idea stays a card', { projectId, runId, err });
        throw err;
      });
    const split = await splitTurnChangeSet(this.db, projectId, ops, { authorMessage, mode: session.mode, justDiscussing, warnings, rejectedIdeas });
    this.logger.debug('chat turn: write policy', { projectId, runId, dispositions: split.dispositions });
    if (split.droppedIdeas.length > 0) this.logger.info('chat turn: dropped suggestions the author turned down', { projectId, runId, ideaIds: split.droppedIdeas });
    if (split.ops.length === 0) return { appliedProposal: null, cardProposal: null, applyNote: IDEAS_DROPPED_NOTE };

    const port: TurnProposalPort = {
      stage,
      apply: (proposalId, opSources) => this.proposalApplyService.apply(projectId, proposalId, { autoApplied: true, opSources }),
      linkApplied: proposal =>
        this.linkMessage(message, { appliedProposalId: proposal.id }).catch((err: unknown) => {
          this.logger.warn('chat turn: linking the applied proposal to its reply failed', { projectId, runId, proposalId: proposal.id, err });
          throw err;
        }),
      discard: proposalId =>
        this.proposalService.discard(projectId, proposalId).catch(err => this.logger.warn('chat turn: discarding an unapplied proposal failed', { projectId, proposalId, err })),
    };
    const staged = await stageTurnChangeSet(port, split, warnings);
    const staging = split.droppedIdeas.length > 0 ? { ...staged, applyNote: [staged.applyNote, IDEAS_DROPPED_NOTE].filter(Boolean).join(' ') } : staged;
    if (staging.applyNote) this.logger.info('chat turn: staging left a note for the author', { projectId, runId, note: staging.applyNote });
    return staging;
  }

  async linkMessage(message: Refinement.ChatMessage, link: Pick<Refinement.ChatMessage, 'proposalId'> | Pick<Refinement.ChatMessage, 'appliedProposalId'>): Promise<void> {
    await this.db.update(schema.chatMessages).set(link).where(eq(schema.chatMessages.id, message.id));
    Object.assign(message, link);
  }
}
