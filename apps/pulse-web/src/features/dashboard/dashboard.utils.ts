/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

export interface SuccessProgress {
  rate: number;
  status: 'success' | 'normal' | 'exception';
  strokeColor?: string;
}

/**
 * Declaring the constants
 */

export function getSuccessProgress(total: number, succeeded: number): SuccessProgress {
  const rate = total === 0 ? 0 : Math.round((succeeded / total) * 100);
  const status = rate === 100 ? 'success' : rate > 0 || total === 0 ? 'normal' : 'exception';

  let strokeColor: string | undefined;
  if (rate >= 60 && rate < 80) strokeColor = 'var(--color-warning)';
  else if (rate < 60) strokeColor = 'var(--color-error)';

  return { rate, status, strokeColor };
}
