import { useMutation, type UseMutationResult, useQuery, type UseQueryResult } from '@tanstack/react-query';

import { type SettledCommandResult } from './command.types';
import { useMemoirData } from './data-context';
import {
  type CoachView,
  type HistoryDetail,
  type HistoryFilter,
  type HistoryView,
  type InsightPeriod,
  type InsightsView,
  type ReflectCommand,
  type ReviewView,
} from './reflect.types';

export const reflectKeys = {
  all: ['memoir', 'reflect'] as const,
  history: (filter: HistoryFilter, query: string) => ['memoir', 'reflect', 'history', filter, query] as const,
  record: (recordId: string) => ['memoir', 'reflect', 'record', recordId] as const,
  insights: (period: InsightPeriod) => ['memoir', 'reflect', 'insights', period] as const,
  review: ['memoir', 'reflect', 'review'] as const,
  coach: ['memoir', 'reflect', 'coach'] as const,
};

export function useHistory(filter: HistoryFilter, query: string): UseQueryResult<HistoryView> {
  const { reflect, queryClient } = useMemoirData();
  return useQuery({ queryKey: reflectKeys.history(filter, query), queryFn: () => reflect.getHistory(filter, query) }, queryClient);
}

export function useHistoryRecord(recordId: string): UseQueryResult<HistoryDetail> {
  const { reflect, queryClient } = useMemoirData();
  return useQuery({ queryKey: reflectKeys.record(recordId), queryFn: () => reflect.getRecord(recordId) }, queryClient);
}

export function useInsights(period: InsightPeriod): UseQueryResult<InsightsView> {
  const { reflect, queryClient } = useMemoirData();
  return useQuery({ queryKey: reflectKeys.insights(period), queryFn: () => reflect.getInsights(period) }, queryClient);
}

export function useReview(): UseQueryResult<ReviewView> {
  const { reflect, queryClient } = useMemoirData();
  return useQuery({ queryKey: reflectKeys.review, queryFn: () => reflect.getReview() }, queryClient);
}

export function useCoach(): UseQueryResult<CoachView> {
  const { reflect, queryClient } = useMemoirData();
  return useQuery({ queryKey: reflectKeys.coach, queryFn: () => reflect.getCoach() }, queryClient);
}

export function useReflectCommand(): UseMutationResult<SettledCommandResult, Error, ReflectCommand> {
  const { reflect, queryClient } = useMemoirData();
  return useMutation(
    { mutationFn: (command: ReflectCommand) => reflect.dispatchCommand(command), onSuccess: () => void queryClient.invalidateQueries({ queryKey: reflectKeys.all }) },
    queryClient,
  );
}
