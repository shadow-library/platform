import { type BibleReadinessDimension, type BibleReadinessDimensionResponse, type BibleReadinessResponse, type BibleReadinessVerdict } from '@/lib/apis';

export type ReadinessIntent = 'success' | 'warning' | 'danger';

export const DIMENSION_ORDER: BibleReadinessDimension[] = ['coverage', 'records', 'substance', 'integrity', 'reveal'];

export const DIMENSION_LABEL: Record<BibleReadinessDimension, string> = {
  coverage: 'Chapters present',
  records: 'Canon as records',
  substance: 'Enough detail',
  integrity: 'References resolve',
  reveal: 'Reveal schedule',
};

export const DIMENSION_HINT: Record<BibleReadinessDimension, string> = {
  coverage: 'Every document a serial needs exists and has been written.',
  records: 'Cast, factions, locations and power rules exist as records, not only as prose — this screen reads records.',
  substance: 'Each document is long enough, and free of placeholder text, to write a scene from.',
  integrity: 'Every canon fact names a real entity, and every major entity has a card body.',
  reveal: 'Withheld truths carry the chapter they are revealed in, so the mystery has a pace.',
};

const VERDICT_INTENT: Record<BibleReadinessVerdict, ReadinessIntent> = { strong: 'success', thin: 'warning', empty: 'danger' };

/** Coverage and records are the two the server gates `readyToDraft` on; the rest are advisory. */
const BLOCKING: BibleReadinessDimension[] = ['coverage', 'records'];

export function verdictIntent(verdict: BibleReadinessVerdict): ReadinessIntent {
  return VERDICT_INTENT[verdict];
}

export function isBlocking(dimension: BibleReadinessDimension): boolean {
  return BLOCKING.includes(dimension);
}

export function dimensionRatio(dimension: BibleReadinessDimensionResponse): string {
  return dimension.total === 0 ? 'n/a' : `${dimension.satisfied}/${dimension.total}`;
}

export function orderedDimensions(report: BibleReadinessResponse): BibleReadinessDimensionResponse[] {
  return [...report.dimensions].sort((a, b) => DIMENSION_ORDER.indexOf(a.dimension) - DIMENSION_ORDER.indexOf(b.dimension));
}

export function readinessHeadline(report: BibleReadinessResponse): string {
  if (report.readyToDraft) {
    const advisory = report.dimensions.filter(dimension => !isBlocking(dimension.dimension) && dimension.verdict !== 'strong').length;
    return advisory === 0 ? 'This bible is ready to draft from' : `Ready to draft, with ${advisory} thing${advisory === 1 ? '' : 's'} worth tightening`;
  }
  return `Not ready to draft — ${report.blockingGaps.length} gap${report.blockingGaps.length === 1 ? '' : 's'} to close first`;
}

export function readinessIntent(report: BibleReadinessResponse): ReadinessIntent {
  if (!report.readyToDraft) return 'danger';
  return report.dimensions.every(dimension => dimension.verdict === 'strong') ? 'success' : 'warning';
}

export function advisoryGaps(report: BibleReadinessResponse): string[] {
  return orderedDimensions(report)
    .filter(dimension => !isBlocking(dimension.dimension))
    .flatMap(dimension => dimension.gaps);
}
