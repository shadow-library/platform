import { eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { AppError, Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type Blueprint, type PrimaryDatabase, schema } from '@server/database';

import { type CatalogOptions } from '../../ai/context/catalog.service';
import { ContextAssembler } from '../../ai/context/context-assembler.service';
import { WorkflowRunService } from '../../ai/graphs/workflow-run.service';
import { ModelRouterService, type ProjectConfig } from '../../ai/model-router.service';
import { parseSchema } from '../../ai/schemas/validate';
import { PluginPolicyService } from '../../plugins/plugin-policy.service';
import { loadActiveLedger } from '../ledger/ledger-entries';
import { renderRoundInput, stepMessages, viewOf } from './blueprint-round';
import { BlueprintRoundService, type RoundOutcome } from './blueprint-round.service';
import { BlueprintStepRegistry } from './blueprint-step.registry';
import { type AnyGeneratingStep, isGenerating, isSourced, type RoundAuthorInput } from './blueprint-step.types';

export const BLUEPRINT_RUN_GRAPH = 'blueprint-step';

export interface BlueprintJob {
  id: string;
  projectId: bigint;
  payload: unknown;
}

export interface BlueprintJobPayload {
  roundId: string;
}

export function blueprintJobTarget(round: Pick<Blueprint.Round, 'stepKey' | 'round'>): string {
  return `${round.stepKey}#${round.round}`;
}

function roundInput(round: Blueprint.Round): RoundAuthorInput {
  return { steer: round.steer, nudges: round.nudges, keepAsDirection: round.keepAsDirection, feedback: round.feedback, input: round.input, focus: round.focus };
}

function failureMessage(err: unknown): string {
  return AppError.is(err) && !err.isInternal ? err.message : 'The round failed. Try again.';
}

@Injectable()
export class BlueprintRoundRunner {
  private readonly logger = Logger.getLogger(APP_NAME, BlueprintRoundRunner.name);
  private readonly db: PrimaryDatabase;

  constructor(
    databaseService: DatabaseService,
    private readonly rounds: BlueprintRoundService,
    private readonly registry: BlueprintStepRegistry,
    private readonly contextAssembler: ContextAssembler,
    private readonly modelRouter: ModelRouterService,
    private readonly workflowRunService: WorkflowRunService,
    private readonly pluginPolicy: PluginPolicyService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  async run(job: BlueprintJob): Promise<void> {
    const { roundId } = (job.payload ?? {}) as Partial<BlueprintJobPayload>;
    const round = roundId ? await this.rounds.get(job.projectId, BigInt(roundId)) : undefined;
    if (!round) throw AppError.internal(`blueprint job ${job.id} names no round of project ${job.projectId}`);
    if (!(await this.rounds.markRunning(round.id))) {
      this.logger.warn('blueprint round already settled — nothing to run', { jobId: job.id, roundId: round.id, status: round.status });
      return;
    }

    try {
      const outcome = await this.generate(this.generatorOf(round.stepKey), round, job.id);
      await this.rounds.markReady(round.id, outcome);
      this.logger.info('blueprint round ready', { projectId: job.projectId, stepKey: round.stepKey, round: round.round });
    } catch (err) {
      const cancelled = await this.rounds.cancelRequested(job.id);
      await this.rounds.settle(round.id, cancelled ? 'cancelled' : 'failed', cancelled ? null : failureMessage(err));
      throw err;
    }
  }

  private generatorOf(stepKey: string): AnyGeneratingStep {
    const step = this.registry.get(stepKey);
    if (!isGenerating(step)) throw AppError.internal(`blueprint round names "${stepKey}", which generates nothing`);
    return step;
  }

  /** A focused pass round may rework only the focused screen's slice; `toRound` is code, so a moved slice is a bug in the step, not the model. */
  private assertUnfocusedSlicesKept(step: AnyGeneratingStep, focus: string | null, previous: unknown, next: unknown): void {
    if (step.kind !== 'pass' || focus === null || previous === null) return;
    const screens = this.registry.all.filter(screen => isSourced(screen) && screen.source.step === step.key && screen.key !== focus);
    const moved = screens.find(screen => !Bun.deepEquals(viewOf(screen, previous), viewOf(screen, next)));
    if (moved) throw AppError.internal(`pass "${step.key}" changed the "${moved.key}" slice in a round focused on "${focus}"`);
  }

  private async generate(step: AnyGeneratingStep, round: Blueprint.Round, jobId: string): Promise<RoundOutcome> {
    const projectId = round.projectId;
    const [project, ledger, earlier] = await Promise.all([
      this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) }),
      loadActiveLedger(this.db, projectId),
      this.rounds.recentForStep(projectId, round.stepKey, round.round),
    ]);
    if (!project) throw AppErrorCode.PRJ_001.create();

    const lastReady = earlier.find(previous => previous.status === 'ready' && previous.options !== null);
    const previous = lastReady?.options ?? null;
    const offered = previous === null ? [] : step.describeOptions(previous);
    const role = step.prompt.role ?? 'blueprint';
    const policy = await this.pluginPolicy.resolve(projectId, { role, promptKey: step.prompt.key }, project);
    const catalog = (options?: CatalogOptions): Promise<string> => this.contextAssembler.catalog(projectId, options);
    const inputs = (await step.inputs?.({ projectId, project, ledger, db: this.db, previous, focus: round.focus, catalog })) ?? [];
    const pack = await this.contextAssembler.forBlueprint(
      projectId,
      ledger,
      { inputs, thread: stepMessages(earlier, round.focus), roundInput: renderRoundInput(step, roundInput(round), offered) },
      { policy, budgetTokens: step.budgetTokens },
    );

    const target = blueprintJobTarget(round);
    const { result } = await this.workflowRunService.runChain(
      projectId,
      BLUEPRINT_RUN_GRAPH,
      target,
      { roundId: String(round.id) },
      async runId => {
        await this.workflowRunService.linkContextPack(runId, pack.id);
        const telemetry = { projectId, runId, node: `blueprint:${step.key}`, promptKey: step.prompt.key, promptVersion: step.prompt.version, role };
        const output = await this.modelRouter.structured(
          step.prompt,
          { stableContext: pack.renderedStable, volatileContext: pack.renderedVolatile },
          telemetry,
          project as ProjectConfig,
          policy,
        );
        const { options, coachMessage } = step.toRound(output, { previous, input: round.input, focus: round.focus, ledger });
        if (!parseSchema(step.optionsSchema, options).success) throw AppErrorCode.AI_001.create();
        this.assertUnfocusedSlicesKept(step, round.focus, previous, options);
        return { options, coachMessage };
      },
      jobId,
    );
    return result;
  }
}
