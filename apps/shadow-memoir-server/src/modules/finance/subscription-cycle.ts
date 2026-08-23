/**
 * Importing npm packages
 */
import { AppError } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { addDays, addMonths, formatLocalDate, localDateOf, parseLocalDate } from '@modules/rules';
import { type Subscription } from '@server/database';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

const DEFAULT_CUSTOM_INTERVAL_DAYS = 30;

/**
 * The month-end clamping ARCHITECTURE §14.2 names lives entirely in `rules/time.addMonths`: it rebuilds
 * the target date from `billingDay` every cycle (rather than carrying `from`'s own day forward) so a
 * user editing `billingDay` mid-series takes effect on the very next advance.
 */
export function advanceDueDate(subscription: Pick<Subscription.Row, 'frequency' | 'billingDay' | 'customIntervalDays'>, from: string): string {
  const anchor = parseLocalDate(from);
  if (!anchor) throw AppError.internal(`invalid next_due_date '${from}' on subscription`);

  if (subscription.frequency === 'weekly') return formatLocalDate(addDays(anchor, 7));

  const rebased = localDateOf(anchor.year, anchor.month, subscription.billingDay);
  if (subscription.frequency === 'monthly') return formatLocalDate(addMonths(rebased, 1));
  if (subscription.frequency === 'quarterly') return formatLocalDate(addMonths(rebased, 3));
  if (subscription.frequency === 'yearly') return formatLocalDate(addMonths(rebased, 12));
  return formatLocalDate(addDays(anchor, subscription.customIntervalDays ?? DEFAULT_CUSTOM_INTERVAL_DAYS));
}
