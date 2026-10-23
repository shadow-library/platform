import { type BotItem } from '@/lib/apis';

export const MAX_ACTIVE_KEYS = 2;
export const RECENT_ACTIVITY_LIMIT = 3;

export function isManageable(status: BotItem['status']): boolean {
  return status === 'ACTIVE' || status === 'SUSPENDED';
}
