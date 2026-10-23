import { CustomTransformers } from '@shadow-library/fastify';

declare module '@shadow-library/fastify' {
  interface CustomTransformers {
    'date:iso': (value: number) => string;
  }
}

export const CUSTOM_DATA_TRANSFORMERS: CustomTransformers = {
  /** ISO rather than a display format: `Date` reads an unrecognised `DD-MM-YYYY` as US `MM-DD-YYYY` when the day is <= 12, silently transposing day and month. */
  'date:iso': (value: number): string => {
    const day = value % 100;
    const month = Math.floor((value % 10_000) / 100);
    const year = Math.floor(value / 10_000);
    return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
  },
} as const;
