/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { NOTIFICATION_CATEGORIES, type NotificationCategory, type NotificationCategoryVariables } from './notification.types';
import { NotificationOutboxRepository } from './notification-outbox.repository';

/**
 * Declaring the constants
 */

/**
 * The single choke point every notification producer (the AI-completion hook, the billing-due sweep,
 * the digest-assembly sweep) calls through — ARCHITECTURE §17's opt-out-by-default rule is enforced
 * here, once, rather than re-checked at each call site. `category` is typed against the closed
 * `NotificationCategoryVariables` union, so there is no method on this class a caller could use to send
 * a category outside the three T-05 templates.
 */
@Injectable()
export class NotificationClient {
  constructor(private readonly outbox: NotificationOutboxRepository) {}

  async enqueue<K extends NotificationCategory>(accountId: bigint, category: K, dedupeKey: string, variables: NotificationCategoryVariables[K]): Promise<void> {
    const definition = NOTIFICATION_CATEGORIES[category];
    const prefs = await this.outbox.notificationPrefs(accountId);
    if (prefs[definition.prefKey] !== true) return;

    await this.outbox.enqueue({
      accountId,
      category: definition.dbCategory,
      templateKey: definition.templateKey,
      dedupeKey,
      variables: variables as unknown as Record<string, unknown>,
    });
  }
}
