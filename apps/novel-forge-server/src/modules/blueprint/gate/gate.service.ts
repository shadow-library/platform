import { and, asc, eq, gte, lte } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type Generation, type Ledger, type Plan, type PrimaryDatabase, type PrimaryTransaction, schema } from '@server/database';

import { GATE_TOPIC } from '../blueprint-phase';
import { BlueprintRoundService } from '../engine/blueprint-round.service';
import { loadBlueprintProject } from '../engine/blueprint-step.service';
import { LedgerService } from '../ledger/ledger.service';
import { type BlueprintPhaseProgress } from '../stage/blueprint-stage';
import { BlueprintStageService } from '../stage/blueprint-stage.service';
import { ARCS_STEP_KEY } from '../steps/arcs.step';
import { arcOne, BRIEFS_STEP_KEY, BRIEFS_TOPIC } from '../steps/briefs.step';
import { CHECK_STEP_KEY } from '../steps/check.step';
import {
  arcBriefRangeWarning,
  briefedArc,
  GATE_STATEMENT,
  type GateStepGap,
  type GateWarning,
  outdatedCheckWarning,
  staleArcWarning,
  staleBriefWarning,
  stepsDecidedAfterCheck,
  unfinishedRequiredSteps,
} from './gate';

export interface GateReadiness {
  ready: boolean;
  opened: boolean;
  unfinished: GateStepGap[];
  warnings: GateWarning[];
}

/** The advisory-lock name the gate serialises on; it shares the step namespace, where no step is called `gate`. */
const GATE_LOCK_KEY = GATE_TOPIC;

@Injectable()
export class BlueprintGateService {
  private readonly logger = Logger.getLogger(APP_NAME, BlueprintGateService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    databaseService: DatabaseService,
    private readonly stage: BlueprintStageService,
    private readonly ledger: LedgerService,
    private readonly rounds: BlueprintRoundService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  /** Readiness is data alone — no model runs here, and nothing is written. */
  async readiness(projectId: bigint): Promise<GateReadiness> {
    const project = await loadBlueprintProject(this.db, projectId);
    const [progress, history] = await Promise.all([this.stage.progress(project), this.history(projectId)]);
    return this.assess(projectId, progress?.phases ?? [], history);
  }

  /**
   * Writing the gate is serialised on its own advisory lock and guarded by a partial unique index, because a
   * second gate entry could never be taken back down: the ledger refuses to retire one.
   */
  async open(projectId: bigint): Promise<Ledger.Entry> {
    const project = await loadBlueprintProject(this.db, projectId);
    const progress = await this.stage.progress(project);

    return this.db.transaction(async tx => {
      await this.rounds.lockStep(projectId, GATE_LOCK_KEY, tx);
      const history = await this.history(projectId, tx);
      const readiness = await this.assess(projectId, progress?.phases ?? [], history, tx);
      if (!readiness.ready) throw AppErrorCode.BPR_009.create({ phases: [...new Set(readiness.unfinished.map(gap => gap.phaseLabel))].join(', ') });

      const existing = history.find(entry => entry.kind === 'system' && entry.topic === GATE_TOPIC && entry.supersededAt === null);
      if (existing) return existing;

      const [entry] = await this.ledger.append(projectId, [{ kind: 'system', phase: null, topic: GATE_TOPIC, statement: GATE_STATEMENT, decidedBy: 'system' }], tx);
      if (!entry) throw AppErrorCode.S001.create();
      this.logger.info('workspace opened', { projectId, entryId: entry.id, warnings: readiness.warnings.map(warning => warning.kind) });
      return entry;
    });
  }

  /** The whole ledger, retired entries included: a revisit that only takes a decision down is still a change the final check never saw. */
  private history(projectId: bigint, executor: PrimaryDatabase | PrimaryTransaction = this.db): Promise<Ledger.Entry[]> {
    const table = schema.decisionLedgerEntries;
    return executor.query.decisionLedgerEntries.findMany({ where: eq(table.projectId, projectId), orderBy: [asc(table.createdAt), asc(table.id)] });
  }

  private async assess(projectId: bigint, phases: BlueprintPhaseProgress[], history: Ledger.Entry[], executor?: PrimaryTransaction): Promise<GateReadiness> {
    const active = history.filter(entry => entry.supersededAt === null);
    const unfinished = unfinishedRequiredSteps(phases);
    const opened = active.some(entry => entry.kind === 'system' && entry.topic === GATE_TOPIC);
    const warnings = [...(await this.planWarnings(projectId, active, executor)), outdatedCheckWarning(stepsDecidedAfterCheck(history, CHECK_STEP_KEY), CHECK_STEP_KEY)];
    return { ready: unfinished.length === 0, opened, unfinished, warnings: warnings.filter((warning): warning is GateWarning => warning !== null) };
  }

  private async planWarnings(projectId: bigint, active: Ledger.Entry[], executor: PrimaryDatabase | PrimaryTransaction = this.db): Promise<(GateWarning | null)[]> {
    const planned = arcOne(active);
    if (!planned) return [];

    const arcs: Pick<Plan.Arc, 'arcKey' | 'title' | 'staleReason' | 'chapterStart' | 'chapterEnd'>[] = await executor
      .select({
        arcKey: schema.arcs.arcKey,
        title: schema.arcs.title,
        staleReason: schema.arcs.staleReason,
        chapterStart: schema.arcs.chapterStart,
        chapterEnd: schema.arcs.chapterEnd,
      })
      .from(schema.arcs)
      .where(and(eq(schema.arcs.projectId, projectId), eq(schema.arcs.volumeKey, planned.volumeKey)))
      .orderBy(asc(schema.arcs.ordinal), asc(schema.arcs.id));

    const arcRow = arcs[0];
    const staleBriefs: Pick<Generation.Brief, 'chapter' | 'staleReason'>[] =
      arcRow?.chapterStart == null || arcRow.chapterEnd == null
        ? []
        : await executor
            .select({ chapter: schema.briefs.chapter, staleReason: schema.briefs.staleReason })
            .from(schema.briefs)
            .where(and(eq(schema.briefs.projectId, projectId), gte(schema.briefs.chapter, arcRow.chapterStart), lte(schema.briefs.chapter, arcRow.chapterEnd)))
            .orderBy(asc(schema.briefs.chapter));

    return [
      staleArcWarning(arcs, ARCS_STEP_KEY),
      arcBriefRangeWarning(arcRow, briefedArc(active, BRIEFS_STEP_KEY, BRIEFS_TOPIC), BRIEFS_STEP_KEY),
      staleBriefWarning(staleBriefs, BRIEFS_STEP_KEY),
    ];
  }
}
