import { Injectable } from '@shadow-library/app';

import { NOTIFICATION_CATEGORIES, type NotificationCategory, type NotificationCategoryVariables } from './notification.types';
import { NotificationOutboxRepository } from './notification-outbox.repository';

/**
 * The single choke point every notification producer calls through; the opt-out-by-default rule is enforced here once. `category` is typed
 * against the closed `NotificationCategoryVariables` union, so no method lets a caller send a category outside the three templates.
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
