/**
 * Pinned so server and client render identical text: an omitted locale falls back to the runtime default (server ICU locale vs the
 * user's locale), which breaks hydration.
 */
export const DEFAULT_LOCALE = 'en-US';
