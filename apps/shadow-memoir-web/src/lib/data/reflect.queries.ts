import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { type CommandHook, legacySettledResult, readSettledResult, useDomainCommand } from './command-runner';
import { type SettledCommandResult } from './command.types';
import { useMemoirData } from './data-context';
import { type ReflectProvider } from './reflect.provider';
import {
  type AiRequest,
  type CoachView,
  type HistoryDetail,
  type HistoryFilter,
  type HistoryView,
  type InsightPeriod,
  type InsightsView,
  type ReflectCommand,
  type ReviewView,
} from './reflect.types';

export const COACH_POLL_INTERVAL_MS = 20_000;
export const COACH_QUEUED_POLL_INTERVAL_MS = 5 * 60_000;
export const COACH_POLL_MAX_BACKOFF_MS = 5 * 60_000;

/** A queued task waits for the nightly batch, so after one early check (a worker with spare capacity may take it at once) it is checked slowly until the time it is expected by. */
export function coachPollDelay(request: Pick<AiRequest, 'state' | 'expectedBy'>, now: number, failures: number, checkedEarly = true): number | null {
  if (request.state !== 'queued' && request.state !== 'processing') return null;
  const untilExpected = request.state === 'queued' && checkedEarly ? Date.parse(request.expectedBy) - now : Number.NaN;
  const base = untilExpected > COACH_POLL_INTERVAL_MS ? Math.min(COACH_QUEUED_POLL_INTERVAL_MS, untilExpected) : COACH_POLL_INTERVAL_MS;
  if (failures === 0) return base;
  return Math.min(COACH_POLL_MAX_BACKOFF_MS, Math.max(base, COACH_POLL_INTERVAL_MS * 2 ** failures));
}

export interface CoachOptions {
  /** Off while nothing may be refreshed, e.g. an account being deleted. @default true */
  refresh?: boolean;
}

const reflectKeys = {
  all: ['memoir', 'reflect'] as const,
  history: (filter: HistoryFilter, query: string, page: number) => ['memoir', 'reflect', 'history', filter, query, page] as const,
  record: (recordId: string) => ['memoir', 'reflect', 'record', recordId] as const,
  insights: (period: InsightPeriod) => ['memoir', 'reflect', 'insights', period] as const,
  review: ['memoir', 'reflect', 'review'] as const,
  coach: ['memoir', 'reflect', 'coach'] as const,
};

export function useHistory(filter: HistoryFilter, query: string, page: number): UseQueryResult<HistoryView> {
  const { reflect, queryClient } = useMemoirData();
  return useQuery({ queryKey: reflectKeys.history(filter, query, page), queryFn: () => reflect.getHistory(filter, query, page), placeholderData: keepPreviousData }, queryClient);
}

export function useHistoryRecord(recordId: string): UseQueryResult<HistoryDetail> {
  const { reflect, queryClient } = useMemoirData();
  return useQuery({ queryKey: reflectKeys.record(recordId), queryFn: () => reflect.getRecord(recordId) }, queryClient);
}

export function useInsights(period: InsightPeriod): UseQueryResult<InsightsView> {
  const { reflect, queryClient } = useMemoirData();
  return useQuery({ queryKey: reflectKeys.insights(period), queryFn: () => reflect.getInsights(period), placeholderData: keepPreviousData }, queryClient);
}

export function useReview(): UseQueryResult<ReviewView> {
  const { reflect, queryClient } = useMemoirData();
  return useQuery({ queryKey: reflectKeys.review, queryFn: () => reflect.getReview() }, queryClient);
}

export function useCoach({ refresh = true }: CoachOptions = {}): UseQueryResult<CoachView> {
  const { reflect, queryClient } = useMemoirData();
  const coach = useQuery({ queryKey: reflectKeys.coach, queryFn: () => reflect.getCoach() }, queryClient);
  useCoachRefresh(reflect, refresh ? (coach.data?.active ?? null) : null);
  return coach;
}

function useCoachRefresh(reflect: ReflectProvider, request: AiRequest | null): void {
  const id = request?.id;
  const state = request?.state;
  const expectedBy = request?.expectedBy ?? '';
  const checkedEarly = useRef(new Set<string>());

  useEffect(() => {
    if (!id || (state !== 'queued' && state !== 'processing')) return undefined;
    const checked = checkedEarly.current;
    let failures = 0;
    let timer: number | undefined;
    let running = false;
    let stopped = false;

    const schedule = (): void => {
      window.clearTimeout(timer);
      const delay = coachPollDelay({ state, expectedBy }, Date.now(), failures, checked.has(id));
      if (delay !== null) timer = window.setTimeout(tick, delay);
    };
    const refresh = async (): Promise<void> => {
      if (running) return;
      running = true;
      const outcome = await reflect.refreshCoach().catch((): 'failed' => 'failed');
      running = false;
      if (outcome !== 'skipped') checked.add(id);
      if (stopped) return;
      if (outcome === 'failed') failures += 1;
      if (outcome === 'refreshed') failures = 0;
      schedule();
    };
    const tick = (): void => {
      if (document.visibilityState !== 'hidden') void refresh();
    };
    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') return;
      failures = 0;
      void refresh();
    };

    schedule();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [reflect, id, state, expectedBy]);
}

export type ReflectCommandHook = CommandHook<ReflectCommand, SettledCommandResult, SettledCommandResult>;

export function useReflectCommand(): ReflectCommandHook {
  const { reflect, queryClient } = useMemoirData();
  return useDomainCommand({
    queryClient,
    dispatch: command => reflect.dispatchCommand(command),
    read: readSettledResult,
    legacy: legacySettledResult,
    refresh: () => queryClient.invalidateQueries({ queryKey: reflectKeys.all }),
  });
}
