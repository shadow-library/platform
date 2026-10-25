import { type ModelCapabilities } from '@/features/catalog/catalog-spec.types';

/** The signed fraction `Statistic` reads as its delta; a zero baseline has no ratio, so the delta is left out rather than divided by zero. */
export function relativeChange(change: number, baseline: number): number | undefined {
  return baseline > 0 ? change / baseline : undefined;
}

/** The impact endpoint prices tokens only, so the caveat matters only when one of the compared models can produce images. */
export function needsImageCaveat(models: readonly ({ capabilities: Pick<ModelCapabilities, 'imageOutput'> } | undefined)[]): boolean {
  return models.some(model => model?.capabilities.imageOutput === true);
}
