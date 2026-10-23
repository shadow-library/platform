import { type Logger } from '@shadow-library/common';

/** The shape of every operational counter log line; alerting hooks off the `metric` field at the cluster log layer. */
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
