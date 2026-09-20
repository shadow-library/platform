import { BUILT_IN_CATEGORIES, type ExpenseCategoryId } from '@/lib/data';

export interface FinanceSearch {
  category?: ExpenseCategoryId;
}

const CATEGORY_IDS: readonly ExpenseCategoryId[] = BUILT_IN_CATEGORIES.map(category => category.id);

function memberOf<T extends string>(value: unknown, members: readonly T[]): T | undefined {
  return typeof value === 'string' && (members as readonly string[]).includes(value) ? (value as T) : undefined;
}

export function validateFinanceSearch(search: Record<string, unknown>): FinanceSearch {
  return { category: memberOf<ExpenseCategoryId>(search.category, CATEGORY_IDS) };
}
