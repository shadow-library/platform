/** The signed fraction `Statistic` reads as its delta; a zero baseline has no ratio, so the delta is left out rather than divided by zero. */
export function relativeChange(change: number, baseline: number): number | undefined {
  return baseline > 0 ? change / baseline : undefined;
}
