import { type StreakTransition } from '@modules/rules';

/**
 * The one place a streak write and its shield-consumption audit land together: the command path's break and rollover's miss both bridge
 * through a shield, so both call this instead of writing `shield_consumptions` themselves.
 */
export async function applyStreakTransition(transition: StreakTransition, writeStreak: () => Promise<void>, insertShieldConsumption: () => Promise<void>): Promise<void> {
  if (transition.outcome === 'neutral') return;
  if (transition.shieldsConsumed > 0) await insertShieldConsumption();
  await writeStreak();
}
