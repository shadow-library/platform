import { type BotItem, type BotKeyItem } from '@/lib/apis';
import { daysUntil } from '@/lib/format';

export type BotTab = 'overview' | 'permissions' | 'keys' | 'activity' | 'settings';

export const BOT_TABS: readonly BotTab[] = ['overview', 'permissions', 'keys', 'activity', 'settings'];
export const MAX_ACTIVE_KEYS = 2;
export const RECENT_ACTIVITY_LIMIT = 3;

const KEY_EXPIRY_WARNING_DAYS = 7;

export interface KeySummary {
  active: BotKeyItem[];
  usage: string;
}

export interface FilledKeySlot {
  kind: 'filled';
  label: string;
  key: BotKeyItem;
}

export interface EmptyKeySlot {
  kind: 'empty';
  label: string;
  title: string;
  text: string;
  canGenerate: boolean;
}

export type KeySlot = FilledKeySlot | EmptyKeySlot;

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

export function formatKeyUsage(activeCount: number): string {
  return `${activeCount} of ${MAX_ACTIVE_KEYS} in use`;
}

export function summarizeKeys(keys: readonly BotKeyItem[]): KeySummary {
  const active = keys.filter(key => key.status === 'ACTIVE');
  return { active, usage: formatKeyUsage(active.length) };
}

export function keyExpiryWarning(expiresAt: string, now: number = Date.now()): string | null {
  const remaining = daysUntil(expiresAt, now);
  if (remaining > KEY_EXPIRY_WARNING_DAYS) return null;
  if (remaining <= 0) return 'Expires today';
  return `Expires in ${remaining} day${remaining === 1 ? '' : 's'}`;
}

function blockedSlotCopy(status: BotItem['status']): Pick<EmptyKeySlot, 'title' | 'text'> {
  if (status === 'SUSPENDED') return { title: 'Bot is suspended', text: 'Resume the bot to generate keys.' };
  if (status === 'DELETING') return { title: 'Bot is being deleted', text: 'Keys can’t be added while the bot is being deleted.' };
  return { title: 'Bot is deleted', text: 'Keys can’t be added to a deleted bot.' };
}

function nextSlotCopy(status: BotItem['status'], activeCount: number): Pick<EmptyKeySlot, 'title' | 'text'> {
  if (status !== 'ACTIVE') return blockedSlotCopy(status);
  if (activeCount === 0) return { title: 'No key yet', text: 'Generate this bot’s first key. You’ll see it once, right after you generate it.' };
  return { title: 'Free slot', text: 'Add a second key when it’s time to rotate, then revoke the old one.' };
}

export function keySlots(keys: readonly BotKeyItem[], status: BotItem['status']): KeySlot[] {
  const active = keys.filter(key => key.status === 'ACTIVE').slice(0, MAX_ACTIVE_KEYS);
  return Array.from({ length: MAX_ACTIVE_KEYS }, (_, index): KeySlot => {
    const label = `Slot ${index + 1}`;
    const key = active[index];
    if (key) return { kind: 'filled', label, key };
    if (index > active.length)
      return { kind: 'empty', label, title: 'Rotation slot', text: 'Opens up once Slot 1 holds a key. Use it to roll over to a new key without downtime.', canGenerate: false };
    return { kind: 'empty', label, ...nextSlotCopy(status, active.length), canGenerate: canGenerateKey(status, active.length) };
  });
}
