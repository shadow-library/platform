import { type Effort, EFFORTS, type TaskEffort } from '@/features/catalog/catalog-spec.types';

/** `default: null` is "no effort setting"; a null bound is "no limit" on that side. */
export interface EffortForm {
  default: Effort | null;
  min: Effort | null;
  max: Effort | null;
}

export interface EffortProblems {
  min?: string;
  max?: string;
}

export const effortRank = (effort: Effort): number => EFFORTS.indexOf(effort);

export function effortFormOf(effort: TaskEffort | undefined): EffortForm {
  return { default: effort?.default ?? null, min: effort?.min ?? null, max: effort?.max ?? null };
}

/** Mirrors the server's `effort_unordered` rule: min <= default <= max, in `EFFORTS` order. */
export function effortProblems(form: EffortForm): EffortProblems {
  if (form.default === null) return {};
  const rank = effortRank(form.default);
  return {
    ...(form.min !== null && effortRank(form.min) > rank && { min: "The lowest effort can't be above the default" }),
    ...(form.max !== null && effortRank(form.max) < rank && { max: "The highest effort can't be below the default" }),
  };
}

export function hasEffortProblems(problems: EffortProblems): boolean {
  return problems.min !== undefined || problems.max !== undefined;
}

export function effortOf(form: EffortForm): TaskEffort | null {
  if (form.default === null) return null;
  return { default: form.default, ...(form.min !== null && { min: form.min }), ...(form.max !== null && { max: form.max }) };
}
