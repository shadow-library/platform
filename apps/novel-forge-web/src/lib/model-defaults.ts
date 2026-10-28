import { type AiModelsAdminResponse } from './apis/api-types.gen';

type ModelNames = Pick<AiModelsAdminResponse, 'models' | 'modelLabels'>;

/**
 * The admin-facing name for a recorded model: a catalog option first, then the catalog's names for the model keys calls, replies and reviews record.
 * Anything neither names — an old run's model — falls back to its key, the only thing left that identifies it.
 */
export function modelLabel(names: ModelNames | undefined, model: string | null | undefined, provider?: string | null): string | undefined {
  if (!model) return undefined;
  const option = names?.models.find(entry => entry.id === model && (!provider || entry.provider === provider));
  return option?.label ?? names?.modelLabels.find(entry => entry.model === model)?.label ?? model;
}
