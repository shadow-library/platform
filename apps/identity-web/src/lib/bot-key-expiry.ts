const DAY_MS = 24 * 60 * 60 * 1000;
const EXPIRY_SAFETY_MARGIN_MS = 60_000;

export const MAX_KEY_LIFETIME_DAYS = 365;

export function expiryCeiling(now: Date): number {
  return now.getTime() + MAX_KEY_LIFETIME_DAYS * DAY_MS - EXPIRY_SAFETY_MARGIN_MS;
}

export function presetExpiry(days: number, now: Date): Date {
  return new Date(Math.min(now.getTime() + days * DAY_MS, expiryCeiling(now)));
}

export function customExpiry(date: Date, now: Date): Date {
  const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
  return new Date(Math.min(endOfDay.getTime(), expiryCeiling(now)));
}
