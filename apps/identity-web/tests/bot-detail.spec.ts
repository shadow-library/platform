import { describe, expect, it } from 'bun:test';

import { canGenerateKey, isBotTab, isManageable, MAX_ACTIVE_KEYS, parseBotTab, summarizeKeys } from '../src/features/bots/bot-detail.shared';
import { type BotKeyItem } from '../src/lib/apis';

function key(id: string, status: BotKeyItem['status']): BotKeyItem {
  return { id, name: `key-${id}`, keyPrefix: `sl_bot_${id}`, status, expiresAt: '2027-01-01T00:00:00.000Z', createdAt: '2026-01-01T00:00:00.000Z' } as BotKeyItem;
}

describe('parseBotTab', () => {
  it.each(['permissions', 'keys', 'activity', 'settings'])('should keep the %s tab', tab => {
    expect(parseBotTab(tab)).toBe(tab);
  });

  it('should drop overview so the default tab carries no search param', () => {
    expect(parseBotTab('overview')).toBeUndefined();
  });

  it.each([undefined, null, '', 'KEYS', 'danger', 3, { tab: 'keys' }])('should drop the invalid value %p', value => {
    expect(parseBotTab(value)).toBeUndefined();
  });
});

describe('isBotTab', () => {
  it('should accept every tab including overview and reject anything else', () => {
    expect(isBotTab('overview')).toBe(true);
    expect(isBotTab('settings')).toBe(true);
    expect(isBotTab('history')).toBe(false);
  });
});

describe('isManageable', () => {
  it('should allow suspend, resume and delete only for active and suspended bots', () => {
    expect(isManageable('ACTIVE')).toBe(true);
    expect(isManageable('SUSPENDED')).toBe(true);
    expect(isManageable('DELETING')).toBe(false);
    expect(isManageable('DELETED')).toBe(false);
  });
});

describe('canGenerateKey', () => {
  it('should allow a key while an active bot has a free slot', () => {
    expect(canGenerateKey('ACTIVE', 0)).toBe(true);
    expect(canGenerateKey('ACTIVE', MAX_ACTIVE_KEYS - 1)).toBe(true);
  });

  it('should refuse once every slot is taken', () => {
    expect(canGenerateKey('ACTIVE', MAX_ACTIVE_KEYS)).toBe(false);
  });

  it.each(['SUSPENDED', 'DELETING', 'DELETED'] as const)('should refuse for a %s bot even with free slots', status => {
    expect(canGenerateKey(status, 0)).toBe(false);
  });
});

describe('summarizeKeys', () => {
  it('should keep only active keys in their server order', () => {
    const summary = summarizeKeys([key('a', 'REVOKED'), key('b', 'ACTIVE'), key('c', 'EXPIRED'), key('d', 'ACTIVE')]);
    expect(summary.active.map(item => item.id)).toEqual(['b', 'd']);
    expect(summary.usage).toBe(`2 of ${MAX_ACTIVE_KEYS} in use`);
  });

  it('should report an empty bot as zero in use', () => {
    expect(summarizeKeys([key('a', 'REVOKED')])).toEqual({ active: [], usage: `0 of ${MAX_ACTIVE_KEYS} in use` });
  });
});
