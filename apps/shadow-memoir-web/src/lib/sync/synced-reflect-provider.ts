import { isApiError } from '@shadow-library/web';

import { aiApi } from '@/lib/apis';
import {
  type AiConsent,
  type AiRequest,
  type AiRequestState,
  type AiResult,
  type CoachView,
  createReflectProvider,
  deriveHistory,
  deriveInsights,
  deriveRecord,
  deriveReview,
  type HistoryDetail,
  type HistoryFilter,
  type HistoryView,
  type InsightPeriod,
  type InsightsView,
  type ReflectCommand,
  type ReflectProvider,
  type ReflectSource,
  type ReviewLocalState,
  type ReviewView,
  type SettledCommandResult,
} from '@/lib/data';

import { type AiResultRow, type AiTaskRow, projectAiRows, projectEntitlement, projectReflectSource } from './projection';
import { type SyncEngine } from './sync-engine';
import { SYNC_META_KEYS } from './sync.types';
import { uuidv7 } from './uuid';

/** `quotas.ai-free-monthly`'s shipped default. Display copy only — the server refuses the third request whatever this says. */
const FREE_MONTHLY_REQUESTS = 2;

const TASK_STATES: Record<AiTaskRow['status'], AiRequestState> = {
  pending: 'queued',
  running: 'processing',
  done: 'ready',
  failed: 'failed',
  cancelled: 'cancelled',
  held_upgrade: 'held',
};

const REQUEST_COPY: Record<AiRequestState, string> = {
  queued: 'Nothing is running yet. Cancelling while it is queued returns the request to your quota.',
  processing: 'Reading your history now. You can close the app — the result will be waiting here.',
  ready: 'The answer is below.',
  failed: 'The run could not finish. Nothing was charged against your quota, and asking again is safe.',
  cancelled: 'The request was returned to your quota.',
  held: 'Held until the plan question is settled. Nothing has been charged.',
};

/** The states worth showing at the top of the screen; a finished task is represented by its result instead. */
const ACTIVE_STATES: AiRequestState[] = ['queued', 'processing', 'failed', 'held'];

function applied(message: string): SettledCommandResult {
  return { status: 'applied', message, xpAwarded: 0, coinsAwarded: 0 };
}

function currentQuotaMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function nextMonthLabel(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });
}

function when(task: AiTaskRow): string {
  const state = TASK_STATES[task.status];
  if (state === 'queued' || state === 'processing') return `submitted ${task.submittedAt.slice(11, 16)} · expected by ${task.expectedBy.slice(11, 16)}`;
  if (state === 'failed') return `did not finish · no request used${task.error ? ` · ${task.error}` : ''}`;
  return task.submittedAt.slice(0, 10);
}

function toResult(row: AiResultRow, task: AiTaskRow | undefined): AiResult {
  return {
    id: row.id,
    title: task?.kind === 'scheduled' ? 'Last night’s summary' : (task?.queryText ?? 'Your result'),
    meta: `Ready ${row.createdAt.slice(0, 16).replace('T', ' ')}`,
    findings: [{ heading: 'Answer', body: row.answer }, ...row.patterns.map((pattern, index) => ({ heading: `Pattern ${index + 1}`, body: pattern }))],
    suggestions: row.suggestions.map((suggestion, index) => ({ id: `${row.id}:${index}`, index, label: suggestion.text, to: `/quests/${suggestion.questId}` })),
    limitationNote: row.limitationNote,
  };
}

/**
 * The coaching surface, live. Tasks, results and consents are written over HTTP and read back through the
 * delta mirror, so a submitted request appears on the next pull rather than being invented locally — the
 * worker owns everything after the submission and nothing here can honestly guess its outcome.
 *
 * History, insights and the weekly review are derivations over the same mirror: the server has no read model
 * for any of the three, so they are computed locally from the rows the delta pull already landed. The
 * review's own answers stay local for the same reason — there is no server model to write them to, so they
 * live in the store's metadata beside the mirror.
 */
export class SyncedReflectProvider implements ReflectProvider {
  private readonly narrative: ReflectProvider;
  private source: ReflectSource;
  private review: ReviewLocalState = { answers: {}, complete: false };
  private pending: Promise<void> = Promise.resolve();
  private readonly restored: Promise<void>;

  constructor(private readonly sync: SyncEngine) {
    this.narrative = createReflectProvider({ today: sync.today, persona: 'active' });
    this.source = projectReflectSource(sync.domains(), sync.today);
    this.restored = this.restoreReview();
    sync.subscribeWorld(() => void (this.pending = this.pending.then(() => this.reproject())));
  }

  async reproject(): Promise<void> {
    const queuedIds = (await this.sync.outbox.pending()).flatMap(entry => {
      const id = (entry.payload as Record<string, unknown>)['id'];
      return typeof id === 'string' ? [id] : [];
    });
    this.source = projectReflectSource(this.sync.domains(), this.sync.today, queuedIds);
  }

  getHistory(filter: HistoryFilter, query: string, page = 1): Promise<HistoryView> {
    return Promise.resolve(deriveHistory(this.source, filter, query, page));
  }

  getRecord(recordId: string): Promise<HistoryDetail> {
    return Promise.resolve(deriveRecord(this.source, recordId));
  }

  getInsights(period: InsightPeriod): Promise<InsightsView> {
    return Promise.resolve(deriveInsights(this.source, period));
  }

  async getReview(): Promise<ReviewView> {
    await this.restored;
    return deriveReview(this.source, this.review);
  }

  getCoach(): Promise<CoachView> {
    const ai = projectAiRows(this.sync.domains());
    const paid = projectEntitlement(this.sync.domains()).tier === 'paid';

    const consent: AiConsent = {
      journal: ai.grantedClasses.has('journal_reflection_reason'),
      health: ai.grantedClasses.has('health'),
      decided: ai.decidedClasses.size > 0,
    };

    const activeTask = ai.tasks.find(task => ACTIVE_STATES.includes(TASK_STATES[task.status]));
    const active: AiRequest | null = activeTask
      ? { id: activeTask.id, question: activeTask.queryText, state: TASK_STATES[activeTask.status], when: when(activeTask), body: REQUEST_COPY[TASK_STATES[activeTask.status]] }
      : null;

    const latestResult = ai.results[0];
    const month = currentQuotaMonth();
    const used = ai.tasks.filter(task => task.quotaConsumed && task.quotaMonth === month).length;

    return Promise.resolve({
      consent,
      quota: {
        used,
        limit: paid ? null : FREE_MONTHLY_REQUESTS,
        planName: paid ? 'Coach' : 'Free',
        resetsOn: nextMonthLabel(),
        note: paid
          ? 'Coach replaces the monthly count with a daily allowance, reset at your local midnight.'
          : `Free includes ${FREE_MONTHLY_REQUESTS} requests a month. Coach adds a daily allowance, the nightly summary and a weekly deep read — and nothing else.`,
      },
      active,
      latest: latestResult
        ? toResult(
            latestResult,
            ai.tasks.find(task => task.id === latestResult.taskId),
          )
        : null,
      history: ai.tasks.map(task => ({
        id: task.id,
        state: TASK_STATES[task.status],
        title: task.kind === 'scheduled' ? 'Nightly summary' : task.queryText,
        when: when(task),
      })),
    });
  }

  async dispatchCommand(command: ReflectCommand): Promise<SettledCommandResult> {
    switch (command.type) {
      case 'ai.setConsent':
        return this.setConsent(command.consent);

      case 'ai.submit':
        return this.submit(command.question);

      case 'ai.retry': {
        const task = projectAiRows(this.sync.domains()).tasks.find(candidate => candidate.id === command.requestId);
        if (!task) return { status: 'rejected', message: 'That request is no longer here.' };
        return this.submit(task.queryText);
      }

      case 'ai.cancel':
        try {
          await aiApi.cancelTask(command.requestId);
          await this.sync.sync();
          return applied('Cancelled, and the request went back to your quota.');
        } catch (error) {
          return this.refusal(error, 'That request could not be cancelled.');
        }

      case 'ai.applySuggestion':
        try {
          await aiApi.applySuggestion(command.resultId, { suggestionIndex: command.suggestionIndex });
          await this.sync.sync();
          return applied('Recorded. The quest is unchanged until you make the edit yourself.');
        } catch (error) {
          return this.refusal(error, 'That offer could not be recorded.');
        }

      case 'review.answer':
        return this.updateReview(
          current => ({ ...current, answers: { ...current.answers, [command.promptId]: command.answer } }),
          'Saved with the review. Reflections stay on this device until the server has somewhere to put them.',
        );

      case 'review.complete':
        return this.updateReview(current => ({ ...current, complete: true }), 'Week closed. The summary is kept locally alongside your mirrored history.');

      default:
        return this.narrative.dispatchCommand(command);
    }
  }

  private async restoreReview(): Promise<void> {
    const stored = await this.sync.store.readMeta<ReviewLocalState>(SYNC_META_KEYS.weeklyReview);
    if (stored) this.review = stored;
  }

  private async updateReview(next: (current: ReviewLocalState) => ReviewLocalState, message: string): Promise<SettledCommandResult> {
    await this.restored;
    this.review = next(this.review);
    await this.sync.store.writeMeta(SYNC_META_KEYS.weeklyReview, this.review);
    return applied(message);
  }

  private async setConsent(consent: { journal: boolean; health: boolean }): Promise<SettledCommandResult> {
    try {
      await aiApi.putConsents({
        grants: [
          { dataClass: 'journal_reflection_reason', granted: consent.journal },
          { dataClass: 'health', granted: consent.health },
        ],
      });
      await this.sync.sync();
      return applied('Saved. Either consent can be withdrawn on its own, and withdrawing one excludes it from future reads.');
    } catch (error) {
      return this.refusal(error, 'That consent could not be saved.');
    }
  }

  private async submit(question: string): Promise<SettledCommandResult> {
    const queryText = question.trim();
    if (queryText.length === 0) return { status: 'rejected', message: 'A question is needed before anything is queued.' };

    try {
      await aiApi.submitTask({ id: uuidv7(Date.now()), queryText });
      await this.sync.sync();
      return applied('Queued. The answer will be here within a few hours.');
    } catch (error) {
      return this.refusal(error, 'That request could not be queued.');
    }
  }

  /** `AI_001` is the paywall, and it is a plan question rather than a failure — the screen turns it into a link. */
  private refusal(error: unknown, fallback: string): SettledCommandResult {
    if (!isApiError(error)) return { status: 'rejected', message: fallback };
    if (error.code === 'AI_001') return { status: 'rejected', message: 'Both requests this month are used. Coach raises the allowance, and the count resets on its own.' };
    return { status: 'rejected', message: error.message };
  }
}
