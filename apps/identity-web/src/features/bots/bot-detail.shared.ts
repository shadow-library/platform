import { type BotItem, type BotKeyItem } from '@/lib/apis';

export type BotTab = 'overview' | 'permissions' | 'keys' | 'activity' | 'settings';

export const BOT_TABS: readonly BotTab[] = ['overview', 'permissions', 'keys', 'activity', 'settings'];
export const MAX_ACTIVE_KEYS = 2;
export const RECENT_ACTIVITY_LIMIT = 3;

export interface KeySummary {
  active: BotKeyItem[];
  usage: string;
}

export function isBotTab(value: unknown): value is BotTab {
  return BOT_TABS.includes(value as BotTab);
}

export function parseBotTab(value: unknown): BotTab | undefined {
  return isBotTab(value) && value !== 'overview' ? value : undefined;
}

export function isManageable(status: BotItem['status']): boolean {
  return status === 'ACTIVE' || status === 'SUSPENDED';
}

export function canGenerateKey(status: BotItem['status'], activeKeyCount: number): boolean {
  return status === 'ACTIVE' && activeKeyCount < MAX_ACTIVE_KEYS;
}

export function summarizeKeys(keys: readonly BotKeyItem[]): KeySummary {
  const active = keys.filter(key => key.status === 'ACTIVE');
  return { active, usage: `${active.length} of ${MAX_ACTIVE_KEYS} in use` };
}
