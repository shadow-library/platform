/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

export type TimeUnit = 'ms' | 's' | 'm' | 'h';

/**
 * Declaring the constants
 */
const TimeUnitMultiplier: Record<TimeUnit, number> = {
  ms: 1,
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
};

class TemporalUtils {
  sleep(duration: number, unit: TimeUnit = 'ms'): Promise<void> {
    const multiplier = TimeUnitMultiplier[unit] ?? 1;
    const ms = duration * multiplier;
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const temporalUtils = new TemporalUtils();
