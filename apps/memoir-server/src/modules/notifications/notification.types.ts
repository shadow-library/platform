import { type NotificationOutbox } from '@server/database';

interface AiResultReadyVariables {
  resultId: string;
  suggestionCount: number;
}

export interface WeeklyDigestVariables {
  weekStartDate: string;
  weekEndDate: string;
  questsCompletedCount: number;
  questsScheduledCount: number;
  netAmount: number;
  currencyCode: string;
  reasonTagCode?: string;
}

interface BillingReminderVariables {
  state: string;
  expiresAtDate: string;
  amount?: number;
  currencyCode?: string;
}

export interface NotificationCategoryVariables {
  aiResultReady: AiResultReadyVariables;
  weeklyDigest: WeeklyDigestVariables;
  billingReminder: BillingReminderVariables;
}

export type NotificationCategory = keyof NotificationCategoryVariables;

export interface NotificationCategoryDefinition {
  dbCategory: NotificationOutbox.Category;
  templateKey: string;
  prefKey: 'aiReadiness' | 'weeklyDigest' | 'billingReminders';
}

/**
 * The closed set of notification categories this app may send. `NotificationClient.enqueue` accepts only a key of this object,
 * so a category outside the three-item allow-list (re-engagement, "we miss you", streak-loss framing) is unrepresentable at the call site.
 */
export const NOTIFICATION_CATEGORIES: Readonly<Record<NotificationCategory, NotificationCategoryDefinition>> = {
  aiResultReady: { dbCategory: 'ai_result_ready', templateKey: 'memoir-ai-result-ready', prefKey: 'aiReadiness' },
  weeklyDigest: { dbCategory: 'weekly_digest', templateKey: 'memoir-weekly-digest', prefKey: 'weeklyDigest' },
  billingReminder: { dbCategory: 'billing_reminder', templateKey: 'memoir-billing-reminder', prefKey: 'billingReminders' },
};
