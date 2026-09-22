import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase } from '@server/database';

import { WorkflowRunService } from '../../ai/graphs/workflow-run.service';
import { ModelRouterService, type ProjectConfig } from '../../ai/model-router.service';
import { blueprintPremisePreviewPrompt } from '../../ai/prompts/blueprint-premise-preview.prompt';
import { type BlueprintPremisePreviewOutput } from '../../ai/schemas/blueprint-premise.schema';
import { PluginPolicyService } from '../../plugins/plugin-policy.service';
import { isActiveRound } from '../engine/blueprint-round';
import { BlueprintRoundService, presentRound } from '../engine/blueprint-round.service';
import { loadBlueprintProject } from '../engine/blueprint-step.service';
import { premiseStep } from './premise.step';

export const PREMISE_PREVIEW_GRAPH = 'blueprint-premise-preview';
export const PREMISE_PREVIEW_COOLDOWN_MS = 30_000;

/**
 * The throwaway opening paragraph. It is one short model call on the Idea-phase role, it stores nothing and it writes no ledger
 * entry, so the only thing holding its cost down is how often it may be asked for: one at a time, and one per cooldown per project.
 */
@Injectable()
export class PremisePreviewService {
  private readonly logger = Logger.getLogger(APP_NAME, PremisePreviewService.name);
  private readonly db: PrimaryDatabase;
  private readonly lastPreviewAt = new Map<bigint, number>();

  constructor(
    databaseService: DatabaseService,
    private readonly rounds: BlueprintRoundService,
    private readonly modelRouter: ModelRouterService,
    private readonly workflowRunService: WorkflowRunService,
    private readonly pluginPolicy: PluginPolicyService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  async preview(projectId: bigint, premise: string): Promise<string> {
    const project = await loadBlueprintProject(this.db, projectId);
    const latest = await this.rounds.latestForStep(projectId, premiseStep.key);
    if (latest && isActiveRound(presentRound(latest).status)) throw AppErrorCode.BPR_002.create();
    const released = this.claimCooldown(projectId);

    const prompt = blueprintPremisePreviewPrompt;
    const policy = await this.pluginPolicy.resolve(projectId, { role: 'blueprint', promptKey: prompt.key }, project);
    const input = { premise: premise.trim() };
    try {
      const { result } = await this.workflowRunService.runChain(projectId, PREMISE_PREVIEW_GRAPH, `premise:${projectId}`, input, async runId => {
        const telemetry = { projectId, runId, node: PREMISE_PREVIEW_GRAPH, promptKey: prompt.key, promptVersion: prompt.version, role: 'blueprint' };
        const output = await this.modelRouter.structured<BlueprintPremisePreviewOutput>(prompt, input, telemetry, project as ProjectConfig, policy);
        return output.paragraph.trim();
      });
      this.logger.info('premise preview written', { projectId, words: result.split(/\s+/).length });
      return result;
    } catch (err) {
      released();
      throw err;
    }
  }

  /**
   * Claims the project's next preview slot and hands back the undo. The stamp is taken before the call, so a double-click cannot
   * run two; a call that produced nothing gives it back, because making the author wait out a failure buys nothing.
   */
  private claimCooldown(projectId: bigint): () => void {
    const now = Date.now();
    const waited = now - (this.lastPreviewAt.get(projectId) ?? 0);
    if (waited < PREMISE_PREVIEW_COOLDOWN_MS) throw AppErrorCode.BPR_008.create({ seconds: Math.ceil((PREMISE_PREVIEW_COOLDOWN_MS - waited) / 1000) });

    this.prune(now);
    this.lastPreviewAt.set(projectId, now);
    return () => void this.lastPreviewAt.delete(projectId);
  }

  /** The map is per-process and would otherwise hold a row per project forever; a stamp past its cooldown says nothing. */
  private prune(now: number): void {
    for (const [projectId, at] of this.lastPreviewAt) {
      if (now - at >= PREMISE_PREVIEW_COOLDOWN_MS) this.lastPreviewAt.delete(projectId);
    }
  }
}
