import { CustomTransformers } from '@shadow-library/fastify';

declare module '@shadow-library/fastify' {
  interface CustomTransformers {
    'date:iso': (value: number) => string;
  }
}

export const CUSTOM_DATA_TRANSFORMERS: CustomTransformers = {
  /**
   * Converts a number in YYYYMMDD format to an ISO 8601 calendar date (YYYY-MM-DD).
   *
   * The wire format is deliberately ISO rather than a display format: `Date`'s parser reads an
   * unrecognised `DD-MM-YYYY` as either an invalid date or — when the day is =< 12 — as US `MM-DD-YYYY`,
   * so half the values would silently transpose day and month in the consumer instead of failing loudly.
   */
  'date:iso': (value: number): string => {
    const day = value % 100;
    const month = Math.floor((value % 10_000) / 100);
    const year = Math.floor(value / 10_000);
    return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
  },
} as const;
