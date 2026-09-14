import { toISODate } from '@shadow-library/ui';

import { aiApi, type AiConsentResponseDto } from '@/lib/apis';
import {
  type AiConsent,
  type AiRequest,
  type AiRequestState,
  type AiResult,
  type CoachRefresh,
  type CoachView,
  commandRefusal,
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
  reviewWeekStart,
  type SettledCommandResult,
} from '@/lib/data';
import { accountDateOf, formatLocalDate, formatLocalTime } from '@/lib/format';

import { ignoreAccountBoundary } from './memoir-store';
import { type AiResultRow, type AiTaskRow, projectAiRows, projectEntitlement, projectHeroStanding, projectReflectSource } from './projection';
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
  held: 'Held until Coach is active on this account again. Nothing has been charged, and it runs as soon as the plan is back.',
};

const CANCEL_CONFLICT_COPY: Partial<Record<AiRequestState, string>> = {
  processing: 'It has already started, so it can’t be cancelled. The answer will be here when it finishes.',
  ready: 'It had already finished, so there was nothing to cancel. The answer is below.',
  failed: 'It had already stopped without an answer, so there was nothing to cancel.',
  cancelled: 'It was already cancelled, and the request went back to your quota.',
  held: 'It is held for the plan rather than queued, so it can’t be cancelled.',
};

const WAITING_STATES: AiRequestState[] = ['queued', 'processing', 'held'];

const CONSENT_DECIDED_ELSEWHERE = 'Your consents were already decided on another device, so nothing was changed. They are shown now.';

function applied(message: string): SettledCommandResult {
  return { status: 'applied', message, xpAwarded: 0, coinsAwarded: 0 };
}

function firstOfNextMonth(day: string): string {
  const [year, month] = day.split('-').map(Number);
  return toISODate(new Date(year ?? 1970, month ?? 1, 1));
}

function taskTitle(task: AiTaskRow | undefined): string {
  if (!task) return 'Your result';
  if (task.kind === 'scheduled') return 'Nightly summary';
  return task.queryText || 'Your question';
}

function when(task: AiTaskRow): string {
  const state = TASK_STATES[task.status];
  if (state === 'queued' || state === 'processing') return `submitted ${formatLocalTime(task.submittedAt)} · expected by ${formatLocalTime(task.expectedBy)}`;
  if (state === 'failed') return `${formatLocalDate(task.submittedAt)} · did not finish · no request used`;
  if (state === 'held') return `submitted ${formatLocalDate(task.submittedAt)} · waiting for Coach`;
  return formatLocalDate(task.submittedAt);
}

/** A failed run stays on top only until something newer is asked; an older failure behind a newer answer is history. */
function activeTask(tasks: AiTaskRow[]): AiTaskRow | undefined {
  const waiting = tasks.find(task => WAITING_STATES.includes(TASK_STATES[task.status]));
  if (waiting) return waiting;
  const newest = tasks[0];
  return newest && TASK_STATES[newest.status] === 'failed' ? newest : undefined;
}

function isDecided(consent: AiConsentResponseDto): boolean {
  return Boolean(consent.grantedAt ?? consent.withdrawnAt);
}

function toResult(row: AiResultRow, task: AiTaskRow | undefined): AiResult {
  return {
    id: row.id,
    title: taskTitle(task),
    meta: `Ready ${formatLocalDate(row.createdAt, { month: 'long', year: false })}, ${formatLocalTime(row.createdAt)}`,
    findings: [{ heading: 'Answer', body: row.answer }, ...row.patterns.map((pattern, index) => ({ heading: `Pattern ${index + 1}`, body: pattern }))],
    suggestions: row.suggestions.map((suggestion, index) => ({ id: `${row.id}:${index}`, index, label: suggestion.text, to: `/quests/${suggestion.questId}` })),
    limitationNote: row.limitationNote,
  };
}

/** `ReviewLocalState` plus the week it was recorded for, so a state left over from a previous week never leaks into the current one. */
interface StoredReview extends ReviewLocalState {
  weekStart: string;
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
  private review: StoredReview;
  private pending: Promise<void> = Promise.resolve();
  private readonly restored: Promise<void>;
  /** The id a question is submitted under until the server accepts it, so asking again after a lost answer finds the task instead of creating a second. */
  private submission: { queryText: string; id: string } | null = null;
  private readonly submitting = new Map<string, Promise<SettledCommandResult>>();

  constructor(private readonly sync: SyncEngine) {
    this.narrative = createReflectProvider({ today: sync.today, persona: 'active' });
    this.source = projectReflectSource(sync.domains(), sync.today);
    this.review = this.freshReview();
    this.restored = this.restoreReview().catch(ignoreAccountBoundary);
    // An unreadable store is reported by the store gate; `updateReview` still refuses to write over a review it could not read.
    this.restored.catch(() => undefined);
    sync.subscribeProjection(() => (this.pending = this.pending.then(() => this.reproject())));
  }

  private freshReview(): StoredReview {
    return { weekStart: reviewWeekStart(this.sync.today), answers: {}, complete: false };
  }

  private currentReview(): StoredReview {
    return this.review.weekStart === reviewWeekStart(this.sync.today) ? this.review : this.freshReview();
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
    this.review = this.currentReview();
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

    const top = activeTask(ai.tasks);
    const active: AiRequest | null = top
      ? { id: top.id, question: taskTitle(top), state: TASK_STATES[top.status], when: when(top), body: REQUEST_COPY[TASK_STATES[top.status]], expectedBy: top.expectedBy }
      : null;

    const timeZone = projectHeroStanding(this.sync.domains()).timezone;
    const today = accountDateOf(new Date(), timeZone);
    const charged = ai.tasks.filter(task => task.quotaConsumed);
    const used = paid
      ? charged.filter(task => accountDateOf(new Date(task.submittedAt), timeZone) === today).length
      : charged.filter(task => task.quotaMonth === today.slice(0, 7)).length;
    const resultIds = new Map(ai.results.map(result => [result.taskId, result.id]));

    return Promise.resolve({
      consent,
      quota: {
        used,
        limit: paid ? null : FREE_MONTHLY_REQUESTS,
        planName: paid ? 'Coach' : 'Free',
        resetsOn: formatLocalDate(firstOfNextMonth(today), { month: 'long', year: false }),
        note: paid
          ? 'Coach has a daily allowance instead of a monthly count, reset at your local midnight.'
          : `Free includes ${FREE_MONTHLY_REQUESTS} requests a month. Coach adds a daily allowance, the nightly summary and a weekly deep read — and nothing else.`,
      },
      active,
      results: ai.results.map(result =>
        toResult(
          result,
          ai.tasks.find(task => task.id === result.taskId),
        ),
      ),
      history: ai.tasks.map(task => ({
        id: task.id,
        state: TASK_STATES[task.status],
        title: taskTitle(task),
        when: when(task),
        resultId: resultIds.get(task.id) ?? null,
      })),
    });
  }

  async refreshCoach(): Promise<CoachRefresh> {
    const { state, readiness } = this.sync.getSnapshot();
    if (state === 'offline' || state === 'signed-out' || readiness.kind !== 'ready') return 'skipped';
    await this.sync.sync({ background: true });
    const after = this.sync.getSnapshot().state;
    return after === 'online' || after === 'syncing' ? 'refreshed' : 'failed';
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
        return this.cancel(command.requestId);

      case 'ai.applySuggestion':
        try {
          await aiApi.applySuggestion(command.resultId, { suggestionIndex: command.suggestionIndex });
          await this.sync.sync();
          return applied('Recorded. The quest is unchanged until you make the edit yourself.');
        } catch (error) {
          return commandRefusal(error, 'That offer could not be recorded.');
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
    const stored = await this.sync.store.readMeta<StoredReview>(SYNC_META_KEYS.weeklyReview);
    if (stored && stored.weekStart === this.review.weekStart) this.review = stored;
  }

  private async updateReview(next: (current: ReviewLocalState) => ReviewLocalState, message: string): Promise<SettledCommandResult> {
    await this.restored;
    const current = this.currentReview();
    this.review = { weekStart: current.weekStart, ...next(current) };
    await this.sync.store.writeMeta(SYNC_META_KEYS.weeklyReview, this.review);
    return applied(message);
  }

  private async cancel(requestId: string): Promise<SettledCommandResult> {
    try {
      await aiApi.cancelTask(requestId);
      await this.sync.sync();
      return applied('Cancelled, and the request went back to your quota.');
    } catch (error) {
      const refusal = commandRefusal(error, 'That request could not be cancelled.');
      if (refusal.error?.code !== 'AI_004') return refusal;
      await this.sync.sync();
      const task = projectAiRows(this.sync.domains()).tasks.find(candidate => candidate.id === requestId);
      const copy = task ? CANCEL_CONFLICT_COPY[TASK_STATES[task.status]] : undefined;
      return copy ? { ...refusal, message: copy } : refusal;
    }
  }

  private async setConsent(consent: { journal: boolean; health: boolean }): Promise<SettledCommandResult> {
    try {
      if (await this.consentDecidedElsewhere()) {
        await this.sync.sync();
        return { status: 'rejected', message: CONSENT_DECIDED_ELSEWHERE };
      }
      await aiApi.putConsents({
        grants: [
          { dataClass: 'journal_reflection_reason', granted: consent.journal },
          { dataClass: 'health', granted: consent.health },
        ],
      });
      await this.sync.sync();
      return applied('Saved. Either consent can be withdrawn on its own, and withdrawing one excludes it from future reads.');
    } catch (error) {
      return commandRefusal(error, 'That consent could not be saved.');
    }
  }

  /** A mirror that has not pulled since another device decided must not overwrite that decision. */
  private async consentDecidedElsewhere(): Promise<boolean> {
    if (projectAiRows(this.sync.domains()).decidedClasses.size > 0) return false;
    const { consents } = await aiApi.getConsents();
    return consents.some(isDecided);
  }

  private submit(question: string): Promise<SettledCommandResult> {
    const queryText = question.trim();
    if (queryText.length === 0) return Promise.resolve({ status: 'rejected', message: 'A question is needed before anything is queued.' });

    const inFlight = this.submitting.get(queryText);
    if (inFlight) return inFlight;
    const request = this.send(queryText).finally(() => this.submitting.delete(queryText));
    this.submitting.set(queryText, request);
    return request;
  }

  private async send(queryText: string): Promise<SettledCommandResult> {
    const id = this.unansweredSubmissionId(queryText) ?? uuidv7(Date.now());
    this.submission = { queryText, id };
    try {
      await aiApi.submitTask({ id, queryText });
      this.submission = null;
      await this.sync.sync();
      return applied('Queued. The answer will be here within a few hours.');
    } catch (error) {
      const refusal = commandRefusal(error, 'That request could not be queued.');
      if (refusal.error?.kind === 'refusal') this.submission = null;
      return refusal;
    }
  }

  /** A task already mirrored under the pending id was accepted, so the same words asked again are a new question. */
  private unansweredSubmissionId(queryText: string): string | null {
    const pending = this.submission;
    if (pending?.queryText !== queryText) return null;
    return projectAiRows(this.sync.domains()).tasks.some(task => task.id === pending.id) ? null : pending.id;
  }
}
