/**
 * Importing npm packages
 */
import { type Logger } from '@shadow-library/common';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

/**
 * The one shape every operational counter log line takes (ARCHITECTURE §24): a `metric` name, a numeric
 * `value`, and whatever identifying context the caller wants alongside it. Alerting hooks off the
 * `metric` field at the cluster log layer — see `docs/observability.md` for the threshold per name.
 */
export function logMetric(
  logger: Pick<Logger, 'info' | 'warn'>,
  message: string,
  metric: string,
  value: number,
  extra: Record<string, unknown> = {},
  level: 'info' | 'warn' = 'info',
): void {
  logger[level](message, { metric, value, ...extra });
}
