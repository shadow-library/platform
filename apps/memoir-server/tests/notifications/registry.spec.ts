import { describe, expect, it } from 'bun:test';

import { NOTIFICATION_CATEGORIES, type NotificationCategory, type NotificationClient } from '@modules/notifications';

/** Compiles only if `NotificationClient.enqueue`'s category parameter is exactly the registry's closed union — a type-level proof that no other category can ever reach the call site, checked by `tsc` rather than at runtime. */
type EnqueueCategoryParam = Parameters<NotificationClient['enqueue']>[1];
const typeLevelProof: EnqueueCategoryParam extends NotificationCategory ? (NotificationCategory extends EnqueueCategoryParam ? true : false) : false = true;

/**
 * T-34's structural test: the sender module's category registry is the complete allow-list, and
 * exactly the three T-05 template keys, so a forbidden category (re-engagement, "we miss you",
 * streak-loss framing) has no code path to attach to — it is unrepresentable, not merely undocumented.
 */
describe('Notification category registry (T-34, structural)', () => {
  it('should contain exactly the three PRD-allowed categories, no more, no fewer', () => {
    expect(Object.keys(NOTIFICATION_CATEGORIES).sort()).toEqual(['aiResultReady', 'billingReminder', 'weeklyDigest']);
  });

  it("should map each category to exactly one of T-05's real pulse template keys", () => {
    const templateKeys = Object.values(NOTIFICATION_CATEGORIES).map(definition => definition.templateKey);
    expect(templateKeys.sort()).toEqual(['memoir-ai-result-ready', 'memoir-billing-reminder', 'memoir-weekly-digest']);
  });

  it('should map each category to exactly one of the three account notification_prefs keys', () => {
    const prefKeys = Object.values(NOTIFICATION_CATEGORIES).map(definition => definition.prefKey);
    expect(prefKeys.sort()).toEqual(['aiReadiness', 'billingReminders', 'weeklyDigest']);
  });

  it("should be frozen at the type level: NotificationClient.enqueue's category parameter is exactly the registry's union", () => {
    expect(typeLevelProof).toBe(true);
  });
});
