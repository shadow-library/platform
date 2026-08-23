import { useMutation, type UseMutationResult, useQuery, type UseQueryResult } from '@tanstack/react-query';

import { type SettledCommandResult } from './command.types';
import { useMemoirData } from './data-context';
import { type HeroCommand, type HeroDeck, type RecoveryView } from './hero.types';

export const heroKeys = {
  all: ['memoir', 'hero'] as const,
  deck: ['memoir', 'hero', 'deck'] as const,
  recovery: ['memoir', 'hero', 'recovery'] as const,
};

export function useHeroDeck(): UseQueryResult<HeroDeck> {
  const { hero, queryClient } = useMemoirData();
  return useQuery({ queryKey: heroKeys.deck, queryFn: () => hero.getDeck() }, queryClient);
}

export function useRecovery(): UseQueryResult<RecoveryView> {
  const { hero, queryClient } = useMemoirData();
  return useQuery({ queryKey: heroKeys.recovery, queryFn: () => hero.getRecovery() }, queryClient);
}

export function useHeroCommand(): UseMutationResult<SettledCommandResult, Error, HeroCommand> {
  const { hero, queryClient } = useMemoirData();
  return useMutation(
    { mutationFn: (command: HeroCommand) => hero.dispatchCommand(command), onSuccess: () => void queryClient.invalidateQueries({ queryKey: heroKeys.all }) },
    queryClient,
  );
}
