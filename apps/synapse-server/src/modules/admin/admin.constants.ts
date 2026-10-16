export const USAGE_GROUPS = ['app', 'task', 'alias', 'model', 'provider', 'day'] as const;

export type UsageGroup = (typeof USAGE_GROUPS)[number];

export const DAY_MS = 86_400_000;
export const HOUR_MS = 3_600_000;

export const IMPACT_WINDOW_DAYS = 30;
export const ERROR_RATE_WINDOW_HOURS = 24;
export const DEFAULT_USAGE_RANGE_DAYS = 30;
export const MAX_USAGE_RANGE_DAYS = 400;

export const MAX_SELECTOR_PAIRS = 16;
export const SELECTOR_TOKEN = /^[A-Za-z0-9_.-]{1,64}$/;
