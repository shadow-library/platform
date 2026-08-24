import { type SettledCommandResult } from './command.types';
import { type Persona } from './fixtures';
import { deriveHistory, deriveInsights, deriveRecord, deriveReview, type ReflectSource } from './reflect.derive';
import { reflectSeed } from './reflect.fixtures';
import {
  type AiConsent,
  type AiRequest,
  type AiResult,
  type CoachView,
  type HistoryDetail,
  type HistoryFilter,
  type HistoryView,
  type InsightPeriod,
  type InsightsView,
  type ReflectCommand,
  type ReviewView,
} from './reflect.types';

export interface ReflectProvider {
  getHistory(filter: HistoryFilter, query: string, page?: number): Promise<HistoryView>;
  getRecord(recordId: string): Promise<HistoryDetail>;
  getInsights(period: InsightPeriod): Promise<InsightsView>;
  getReview(): Promise<ReviewView>;
  getCoach(): Promise<CoachView>;
  dispatchCommand(command: ReflectCommand): Promise<SettledCommandResult>;
}

const RESULT: AiResult = {
  id: 'result-nightly',
  title: 'Last night’s result',
  meta: 'Nightly summary · ready 06:02 · read quests, planning and money',
  findings: [
    {
      heading: 'Thursdays are structurally overloaded',
      body: 'Five occurrences and about 2h 20m, against a fourteen-day median of 1h 40m. Four of your six misses this fortnight were Thursday evenings, and all four carry the reason work emergency.',
    },
    {
      heading: 'Mornings are load-bearing',
      body: 'The morning run sits at 86% and has never been missed on a day the plan was locked the night before. Locking the plan is doing more work than the schedule itself.',
    },
    {
      heading: 'Food spend tracks one quest',
      body: 'Every euro of the €62 over your food average lands on a day No takeaway today was skipped. Nothing to change in the budget; one quest explains it.',
    },
  ],
  suggestions: [
    { id: 'result-nightly:0', index: 0, label: 'Move the strength session off Thursday', to: '/quests' },
    { id: 'result-nightly:1', index: 1, label: 'Drop the evening stretch to five days a week', to: '/quests' },
  ],
  limitationNote: null,
};

const REQUEST_COPY: Record<AiRequest['state'], { when: string; body: string }> = {
  queued: {
    when: 'submitted a moment ago · position 2',
    body: 'Nothing is running yet. Cancelling while it is queued returns the request to your quota.',
  },
  processing: {
    when: 'started a few minutes ago · usually under an hour',
    body: 'Reading the window you chose. You can close the app — the result will be waiting here, and a notification arrives only if you asked for one.',
  },
  ready: { when: 'ready', body: 'The answer is below.' },
  held: { when: 'waiting on a plan change', body: 'The request is held until the plan question is settled. Nothing has been charged.' },
  failed: {
    when: 'failed · no request used',
    body: 'The run could not finish. Nothing was charged against your quota and none of your data was left half-read. Retrying is safe.',
  },
  cancelled: { when: 'cancelled while queued · no request used', body: 'The request was returned to your quota.' },
};

const HISTORY_ENTRIES: CoachView['history'] = [
  { id: 'h1', state: 'ready', title: 'Nightly summary · quests, planning, money', when: 'Today 06:02' },
  { id: 'h2', state: 'ready', title: 'What is my Thursday problem?', when: '19 Aug' },
  { id: 'h3', state: 'failed', title: 'Weekly deep read · week 33', when: '18 Aug · no request used' },
  { id: 'h4', state: 'cancelled', title: 'Is my food spend unusual?', when: '15 Aug · cancelled while queued' },
  { id: 'h5', state: 'ready', title: 'Weekly deep read · week 32', when: '11 Aug' },
];

interface ReflectFixtureState {
  persona: Persona;
  today: string;
  source: ReflectSource;
  consent: AiConsent;
  quotaUsed: number;
  active: AiRequest | null;
  answers: Record<string, string>;
  reviewComplete: boolean;
}

export interface ReflectFixtureOptions {
  today: string;
  persona?: Persona;
}

/** Free carries two requests a month; the third must meet the paywall before a task is ever written (PRD §6.8). */
const FREE_MONTHLY_REQUESTS = 2;

function applied(message: string): SettledCommandResult {
  return { status: 'applied', message, xpAwarded: 0, coinsAwarded: 0 };
}

/** The fixture reflection seam, kept for stories and component tests. */
export function createReflectProvider({ today, persona = 'active' }: ReflectFixtureOptions): ReflectProvider {
  const state: ReflectFixtureState = {
    persona,
    today,
    source: reflectSeed(today, persona),
    consent: { journal: false, health: false, decided: false },
    quotaUsed: persona === 'new' ? 0 : 1,
    active: null,
    answers: {},
    reviewComplete: false,
  };

  const coach = (): CoachView => ({
    consent: { ...state.consent },
    quota: {
      used: state.quotaUsed,
      limit: FREE_MONTHLY_REQUESTS,
      planName: 'Free',
      resetsOn: '1 September',
      note: `Free includes ${FREE_MONTHLY_REQUESTS} requests a month. Coach adds sixty a month, the nightly summary and a weekly deep read — and nothing else.`,
    },
    active: state.active,
    latest: state.consent.decided && state.persona !== 'new' ? RESULT : null,
    history: state.persona === 'new' ? [] : HISTORY_ENTRIES,
  });

  return {
    getHistory: (filter, query, page = 1) => Promise.resolve(deriveHistory(state.source, filter, query, page)),
    getRecord: recordId => Promise.resolve(deriveRecord(state.source, recordId)),
    getInsights: period => Promise.resolve(deriveInsights(state.source, period)),
    getReview: () => Promise.resolve(deriveReview(state.source, { answers: state.answers, complete: state.reviewComplete })),
    getCoach: () => Promise.resolve(coach()),
    dispatchCommand: command => {
      if (command.type === 'ai.setConsent') {
        state.consent = { ...command.consent, decided: true };
        return Promise.resolve(applied('Saved. You can withdraw either consent at any time.'));
      }

      if (command.type === 'ai.submit') {
        if (command.question.trim().length === 0) return Promise.resolve({ status: 'rejected', message: 'A question is needed before anything is queued.' });
        if (state.quotaUsed >= FREE_MONTHLY_REQUESTS)
          return Promise.resolve({
            status: 'rejected',
            message: `Free covers ${FREE_MONTHLY_REQUESTS} requests a month and both are used. The count resets on 1 September, and Coach raises it.`,
          });
        state.quotaUsed += 1;
        state.active = { id: `req-${state.quotaUsed}`, question: command.question.trim(), state: 'queued', ...REQUEST_COPY.queued };
        return Promise.resolve(applied('Queued. The answer will be here within a few hours.'));
      }

      if (command.type === 'ai.cancel') {
        state.quotaUsed = Math.max(0, state.quotaUsed - 1);
        state.active = state.active ? { ...state.active, state: 'cancelled', ...REQUEST_COPY.cancelled } : null;
        return Promise.resolve(applied('Cancelled, and the request went back to your quota.'));
      }

      if (command.type === 'ai.retry') {
        state.active = state.active ? { ...state.active, state: 'processing', ...REQUEST_COPY.processing } : null;
        return Promise.resolve(applied('Running again. Nothing extra is charged for a retry.'));
      }

      if (command.type === 'ai.applySuggestion') {
        const suggestion = RESULT.suggestions[command.suggestionIndex];
        return Promise.resolve(applied(suggestion ? 'Recorded. Opening the quest so you can make the change yourself.' : 'Nothing to apply.'));
      }

      if (command.type === 'review.answer') {
        state.answers[command.promptId] = command.answer;
        return Promise.resolve(applied('Saved with the review.'));
      }

      state.reviewComplete = true;
      return Promise.resolve(applied('Week closed and saved as a journal entry.'));
    },
  };
}
