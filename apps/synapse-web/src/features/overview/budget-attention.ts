import { type LimitLevel, statusCards } from '@/features/budgets/budget-view';
import { type BudgetStatusResponse } from '@/lib/apis/api-types.gen';

export interface BudgetAttention {
  index: number;
  title: string;
  level: Exclude<LimitLevel, 'clear'>;
  detail: string;
}

export interface BudgetAttentionSummary {
  total: number;
  items: BudgetAttention[];
}

export function budgetAttentionOf(status: BudgetStatusResponse): BudgetAttentionSummary {
  const cards = statusCards(status);
  const items = cards.flatMap((card): BudgetAttention[] => {
    if (card.level === 'clear') return [];
    if (card.usage.kind === 'unavailable') return [];
    const detail =
      card.usage.kind === 'subject'
        ? card.usage.summary
        : card.usage.meters
            .filter(meter => meter.level !== 'clear')
            .map(meter => (meter.measure === 'cost' ? `API-price cost ${meter.text}` : meter.text))
            .join(' · ');
    return [{ index: card.index, title: card.title, level: card.level, detail }];
  });
  items.sort((left, right) => Number(right.level === 'at') - Number(left.level === 'at') || left.index - right.index);
  return { total: cards.length, items };
}
