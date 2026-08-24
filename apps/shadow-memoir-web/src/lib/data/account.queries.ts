import { useMutation, type UseMutationResult, useQuery, type UseQueryResult } from '@tanstack/react-query';

import {
  type AccountCommand,
  type AppSyncView,
  type BehaviourPreferences,
  type BillingView,
  type DayPreferences,
  type DeletionView,
  type ExportView,
  type NotificationSettings,
  type OnboardingStatus,
} from './account.types';
import { type SettledCommandResult } from './command.types';
import { useMemoirData } from './data-context';

export const accountKeys = {
  all: ['memoir', 'account'] as const,
  day: ['memoir', 'account', 'day'] as const,
  behaviour: ['memoir', 'account', 'behaviour'] as const,
  notifications: ['memoir', 'account', 'notifications'] as const,
  billing: ['memoir', 'account', 'billing'] as const,
  export: ['memoir', 'account', 'export'] as const,
  deletion: ['memoir', 'account', 'deletion'] as const,
  appSync: ['memoir', 'account', 'app-sync'] as const,
  onboarding: ['memoir', 'account', 'onboarding'] as const,
};

const EXPORT_POLL_MS = 3_000;

export function useDayPreferences(): UseQueryResult<DayPreferences> {
  const { account, queryClient } = useMemoirData();
  return useQuery({ queryKey: accountKeys.day, queryFn: () => account.getDay() }, queryClient);
}

export function useBehaviourPreferences(): UseQueryResult<BehaviourPreferences> {
  const { account, queryClient } = useMemoirData();
  return useQuery({ queryKey: accountKeys.behaviour, queryFn: () => account.getBehaviour() }, queryClient);
}

export function useNotificationSettings(): UseQueryResult<NotificationSettings> {
  const { account, queryClient } = useMemoirData();
  return useQuery({ queryKey: accountKeys.notifications, queryFn: () => account.getNotifications() }, queryClient);
}

export function useBilling(): UseQueryResult<BillingView> {
  const { account, queryClient } = useMemoirData();
  return useQuery({ queryKey: accountKeys.billing, queryFn: () => account.getBilling() }, queryClient);
}

/** An assembling archive is the one account read that polls: the job finishes on a worker, not on this request. */
export function useExportView(): UseQueryResult<ExportView> {
  const { account, queryClient } = useMemoirData();
  return useQuery(
    {
      queryKey: accountKeys.export,
      queryFn: () => account.getExport(),
      refetchInterval: query => (query.state.data?.job.stage === 'preparing' ? EXPORT_POLL_MS : false),
    },
    queryClient,
  );
}

export function useDeletion(): UseQueryResult<DeletionView> {
  const { account, queryClient } = useMemoirData();
  return useQuery({ queryKey: accountKeys.deletion, queryFn: () => account.getDeletion() }, queryClient);
}

export function useAppSync(): UseQueryResult<AppSyncView> {
  const { account, queryClient } = useMemoirData();
  return useQuery({ queryKey: accountKeys.appSync, queryFn: () => account.getAppSync() }, queryClient);
}

export function useOnboardingStatus(): UseQueryResult<OnboardingStatus> {
  const { account, queryClient } = useMemoirData();
  return useQuery({ queryKey: accountKeys.onboarding, queryFn: () => account.getOnboarding() }, queryClient);
}

export function useAccountCommand(): UseMutationResult<SettledCommandResult, Error, AccountCommand> {
  const { account, queryClient } = useMemoirData();
  return useMutation(
    { mutationFn: (command: AccountCommand) => account.dispatchCommand(command), onSuccess: () => void queryClient.invalidateQueries({ queryKey: accountKeys.all }) },
    queryClient,
  );
}
