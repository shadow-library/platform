/**
 * Importing npm packages
 */
import { randomUUID } from 'node:crypto';

import { Injectable, type OnModuleInit } from '@shadow-library/app';
import { Config, Logger } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { EntitlementService } from '@modules/billing';
import { InferenceClient } from '@modules/inference';
import { NotificationClient } from '@modules/notifications';
import { SchedulerService } from '@modules/scheduler';
import { APP_NAME } from '@server/constants';
import { type AiTask } from '@server/database';
import { logMetric } from '@server/telemetry';

import { AiWorkerRepository } from './ai-worker.repository';
import { applyGuardrails } from './guardrails';
import { buildPrompt, parseDraft } from './prompt-contract';
import { ReadAssemblyService } from './read-assembly.service';
import { ScheduledQueryRepository, scheduledTaskId } from './scheduled-query.repository';

/**
 * Defining types
 */

type Outcome = 'done' | 'failed' | 'retried' | 'held' | 'dropped';

/**
 * Declaring the constants
 */

const BATCH_SWEEP = 'ai-batch-window';
const RETRY_SWEEP = 'ai-retry-poll';
const STUCK_SWEEP = 'ai-stuck-running';
const RESUME_SWEEP = 'ai-held-upgrade-resume';
const MS_PER_MINUTE = 60_000;
const HELD_PAGE_SIZE = 200;

function minuteOfDay(value: string): number {
  const [hour, minute] = value.split(':');
  return Number(hour) * 60 + Number(minute);
}

/** A window that wraps past midnight (22:00 → 04:00) is the normal shape of a nightly batch, so containment is not a simple range test. */
function inWindow(now: Date, start: number, end: number): boolean {
  const current = now.getHours() * 60 + now.getMinutes();
  return start <= end ? current >= start && current < end : current >= start || current < end;
}

/**
 * The AI batch executor of ARCHITECTURE §15.2–§15.7, running on T-22's in-process scheduler and reading
 * through the dedicated `memoir_ai` pool. Four sweeps, each doing one thing:
 *
 * - the nightly window materializes scheduled queries and then drains the pending backlog;
 * - the retry poll picks up only tasks a previous attempt requeued, so a transient inference failure
 *   does not wait for the next night;
 * - the stuck sweep returns a claim whose worker died to `pending` (or fails it once attempts run out);
 * - the resume sweep releases `held_upgrade` tasks whose entitlement came back.
 *
 * §15.3's rule is the one that shapes everything else: the task row is a request, not an authorization.
 * Deletion, entitlement, consent, and tier scope are all re-derived here at execution time, from the
 * account's current state, never from anything the submission recorded.
 */
@Injectable()
export class AiExecutorService implements OnModuleInit {
  private readonly logger = Logger.getLogger(APP_NAME, AiExecutorService.name);
  private readonly workerId = `${APP_NAME}-${randomUUID().slice(0, 8)}`;

  constructor(
    private readonly scheduler: SchedulerService,
    private readonly repository: AiWorkerRepository,
    private readonly scheduledQueries: ScheduledQueryRepository,
    private readonly readAssembly: ReadAssemblyService,
    private readonly entitlements: EntitlementService,
    private readonly inference: InferenceClient,
    private readonly notifications: NotificationClient,
  ) {}

  /** No `memoir_ai` pool configured means no credential to run as; the sweeps stay unregistered rather than failing every tick, mirroring `EntitlementLapseService`. */
  onModuleInit(): void {
    if (!Config.get('database.postgres.ai-url')) return;

    this.scheduler.registerSweep(BATCH_SWEEP, Config.get('ai.batch-poll-interval-minutes') * MS_PER_MINUTE, () => this.runBatchWindow());
    this.scheduler.registerSweep(RETRY_SWEEP, Config.get('ai.retry-poll-interval-minutes') * MS_PER_MINUTE, () => this.runRetryPoll());
    this.scheduler.registerSweep(STUCK_SWEEP, Config.get('ai.stuck-sweep-interval-minutes') * MS_PER_MINUTE, async () => void (await this.recoverStuck()));
    this.scheduler.registerSweep(RESUME_SWEEP, Config.get('ai.held-resume-interval-minutes') * MS_PER_MINUTE, async () => void (await this.resumeHeld()));
  }

  async runBatchWindow(now = new Date()): Promise<void> {
    if (!inWindow(now, minuteOfDay(Config.get('ai.batch-window-start')), minuteOfDay(Config.get('ai.batch-window-end')))) return;
    await this.materializeScheduledQueries(now);
    await this.drain();
  }

  async runRetryPoll(): Promise<void> {
    await this.drain(true);
  }

  /**
   * One claim at a time, until the backlog is empty or the batch size is spent — the loop is safe to
   * run in parallel with itself and with another replica's. A task this pass already requeued is not
   * retried within the same pass: the backoff between attempts is the poll cadence, and re-claiming it
   * immediately would burn every attempt against the same failing inference in one loop.
   */
  async drain(retriesOnly = false): Promise<number> {
    const limit = Config.get('ai.claim-batch-size');
    const attempted = new Set<string>();
    let executed = 0;

    while (executed < limit) {
      const task = await this.repository.claimNext(this.workerId, retriesOnly);
      if (!task) break;
      if (attempted.has(task.id)) {
        await this.repository.requeue(task.id);
        break;
      }
      attempted.add(task.id);
      executed++;
      await this.execute(task);
    }

    if (executed > 0) logMetric(this.logger, 'AI batch drain complete', 'ai.tasks_executed', executed, { retriesOnly });
    return executed;
  }

  /**
   * §15.3's revalidation, in its stated order. Each step is a reason the task cannot run *now*, and each
   * has its own terminal shape: deletion drops (and refunds), a lapse holds for upgrade, everything else
   * proceeds under the consent snapshot and tier window taken at this instant.
   */
  async execute(task: AiTask.Row): Promise<Outcome> {
    await this.repository.recordAudit(task.accountId, task.id, 'claimed');

    const account = await this.repository.findAccount(task.accountId);
    if (!account || account.deletionState !== 'none') {
      await this.repository.drop(task, 'account_deletion_pending');
      return 'dropped';
    }

    const tier = await this.entitlements.getTier(task.accountId);
    if (await this.requiresUpgrade(task, tier)) {
      await this.repository.hold(task.id);
      return 'held';
    }

    const now = new Date();
    const consents = await this.repository.consentSnapshot(task.accountId);
    const windowStart = this.readAssembly.windowStartFor(tier, now, Config.get('ai.free-history-months'));
    const assembly = await this.readAssembly.assemble({ account, tier, consents, now }, windowStart);
    await this.repository.recordAudit(task.accountId, task.id, 'read_scope', assembly.dataClasses, assembly.rowCounts);

    const draft = await this.inference
      .completeJson(buildPrompt(task.queryText, assembly.context))
      .then(parseDraft)
      .catch(error => {
        this.logger.warn('AI inference attempt failed', { taskId: task.id, error });
        return null;
      });
    if (!draft) return this.retryOrFail(task, 'inference_unavailable');

    const outcome = applyGuardrails({ queryText: task.queryText, sensitiveSources: assembly.sensitiveSources, allowedQuestIds: assembly.questIds, draft });
    if (outcome.status === 'blocked') {
      logMetric(this.logger, 'AI answer refused by the output guardrails', 'ai.guardrail_blocked', 1, { violations: outcome.violations });
      await this.repository.fail(task, `guardrail_blocked:${outcome.violations.join(',')}`);
      return 'failed';
    }

    const result = outcome.result;
    const aiResult = await this.repository.completeWithResult({
      accountId: task.accountId,
      taskId: task.id,
      answer: result.answer,
      patterns: result.patterns,
      suggestions: result.suggestions,
      citations: assembly.dataClasses,
      limitationNote: result.limitationNote,
      modelId: Config.get('ai.model'),
      promptVersion: Config.get('ai.prompt-version'),
    });
    await this.repository.recordAudit(task.accountId, task.id, 'finished');

    /** Content-free by construction (T-34): only the result's id and suggestion count ever leave this process, never the answer/patterns/suggestions text itself. Enqueue-only — a pulse outage never fails a completed AI task. */
    const suggestionCount = Array.isArray(aiResult.suggestions) ? aiResult.suggestions.length : 0;
    await this.notifications.enqueue(task.accountId, 'aiResultReady', `ai-result-${aiResult.id}`, { resultId: String(aiResult.id), suggestionCount });
    return 'done';
  }

  /**
   * §15.7. The task id is derived, so the sweep is idempotent across restarts without reading what it
   * already wrote, and eligibility is re-derived per account from server time rather than trusted from
   * the projection column — a subscription that expired an hour ago must not get tonight's run.
   */
  async materializeScheduledQueries(now = new Date()): Promise<number> {
    const date = now.toISOString().slice(0, 10);
    const scheduled = await this.scheduledQueries.listActive();
    let materialized = 0;

    for (const row of scheduled) {
      const tier = await this.entitlements.getTier(row.accountId);
      if (tier !== 'paid') continue;
      const created = await this.scheduledQueries.materialize(scheduledTaskId(row.accountId, date), row.accountId, row.queryText, now);
      if (created) materialized++;
    }

    if (materialized > 0) logMetric(this.logger, 'Scheduled AI queries materialized', 'ai.scheduled_materialized', materialized, { candidates: scheduled.length });
    return materialized;
  }

  /** §15.2's crashed-claim recovery, with the same attempt ceiling a live failure obeys. */
  async recoverStuck(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - Config.get('ai.task-timeout-minutes') * MS_PER_MINUTE);
    const stuck = await this.repository.findStuck(cutoff, Config.get('ai.claim-batch-size'));
    for (const task of stuck) await this.retryOrFail(task, 'stuck_running');
    if (stuck.length > 0) logMetric(this.logger, 'Stale AI claims recovered', 'ai.stuck_recovered', stuck.length);
    return stuck.length;
  }

  /**
   * The restore side of §15.1's `held_upgrade`. It lives here rather than on the billing webhook because
   * `memoir_billing` holds no privilege on `ai_tasks` at all (§5.4) — the worker role is the only one
   * that can move a task back to `pending`, so the worker owns the resume.
   */
  async resumeHeld(): Promise<number> {
    const held = await this.repository.listHeld(HELD_PAGE_SIZE);
    let resumed = 0;

    for (const task of held) {
      const tier = await this.entitlements.getTier(task.accountId);
      if (await this.requiresUpgrade(task, tier)) continue;
      await this.repository.requeue(task.id);
      resumed++;
    }

    if (resumed > 0) logMetric(this.logger, 'Held AI tasks resumed on entitlement restore', 'ai.tasks_resumed', resumed);
    return resumed;
  }

  /**
   * "Lapsed at claim" is not a flag anyone wrote down — the task row records no tier (§15.3: it is a
   * request, not an authorization), so eligibility is recomputed: a scheduled run is paid-only, and an
   * ad-hoc task still runs on the free tier as long as it sits inside the free monthly allowance. A paid
   * user's eleventh question of the month therefore holds for upgrade when they lapse, while a free
   * user's own two never do.
   */
  private async requiresUpgrade(task: AiTask.Row, tier: string): Promise<boolean> {
    if (tier === 'paid') return false;
    if (task.kind === 'scheduled') return true;
    if (!task.quotaConsumed) return false;
    return (await this.repository.quotaRank(task)) > Config.get('quotas.ai-free-monthly');
  }

  private async retryOrFail(task: AiTask.Row, reason: string): Promise<Outcome> {
    const attempts = await this.repository.attempts(task.id);
    if (attempts >= Config.get('ai.max-attempts')) {
      await this.repository.fail(task, reason);
      return 'failed';
    }
    await this.repository.requeue(task.id);
    return 'retried';
  }
}
