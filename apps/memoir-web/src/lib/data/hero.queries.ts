import { useMutation, type UseMutationResult, useQuery, type UseQueryResult } from '@tanstack/react-query';

import { type CommandHandle, readSettledResult, useDomainCommand } from './command-runner';
import { type SettledCommandResult } from './command.types';
import { useMemoirData } from './data-context';
import { themeAccentKey } from './hero.provider';
import { type AccentKey, type ComingBack, type HeroCommand, type HeroDeck, type RecoveryView } from './hero.types';

const heroKeys = {
  all: ['memoir', 'hero'] as const,
  deck: ['memoir', 'hero', 'deck'] as const,
  recovery: ['memoir', 'hero', 'recovery'] as const,
  comingBack: ['memoir', 'hero', 'coming-back'] as const,
};

export function useHeroDeck(): UseQueryResult<HeroDeck> {
  const { hero, queryClient } = useMemoirData();
  return useQuery({ queryKey: heroKeys.deck, queryFn: () => hero.getDeck() }, queryClient);
}

/** Shares the deck query's cache entry but only re-renders its caller when the selected accent id changes. */
export function useEquippedThemeAccentKey(): AccentKey | null {
  const { hero, queryClient } = useMemoirData();
  const query = useQuery({ queryKey: heroKeys.deck, queryFn: () => hero.getDeck(), select: deck => themeAccentKey(deck.cosmetics) }, queryClient);
  return query.data ?? null;
}

export function useRecovery(): UseQueryResult<RecoveryView> {
  const { hero, queryClient } = useMemoirData();
  return useQuery({ queryKey: heroKeys.recovery, queryFn: () => hero.getRecovery() }, queryClient);
}

export function useComingBack(): UseQueryResult<ComingBack> {
  const { hero, queryClient } = useMemoirData();
  return useQuery({ queryKey: heroKeys.comingBack, queryFn: () => hero.getComingBack() }, queryClient);
}

export function useDismissComingBack(): UseMutationResult<void, unknown, void> {
  const { hero, queryClient } = useMemoirData();
  return useMutation({ mutationFn: () => hero.dismissComingBack(), onSuccess: () => queryClient.invalidateQueries({ queryKey: heroKeys.all }) }, queryClient);
}

export type HeroCommandHook = CommandHandle<HeroCommand, SettledCommandResult>;

export function useHeroCommand(): HeroCommandHook {
  const { hero, queryClient } = useMemoirData();
  return useDomainCommand({
    dispatch: (command, options) => hero.dispatchCommand(command, options),
    read: readSettledResult,
    queryClient,
    queryKey: heroKeys.all,
  });
}
