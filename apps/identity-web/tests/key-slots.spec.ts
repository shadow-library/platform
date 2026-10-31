import { describe, expect, it } from 'bun:test';

import { type EmptyKeySlot, formatKeyUsage, keyExpiryWarning, keySlots } from '../src/features/bots/bot-detail.shared';
import { type BotItem, type BotKeyItem } from '../src/lib/apis';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-06-15T10:00:00.000Z').getTime();

function key(id: string, status: BotKeyItem['status'] = 'ACTIVE'): BotKeyItem {
  return { id, name: `key-${id}`, keyPrefix: `sl_bot_${id}`, status, expiresAt: '2027-01-01T00:00:00.000Z', createdAt: '2026-01-01T00:00:00.000Z' } as BotKeyItem;
}

function empties(slots: ReturnType<typeof keySlots>): EmptyKeySlot[] {
  return slots.filter((slot): slot is EmptyKeySlot => slot.kind === 'empty');
}

function generateActions(slots: ReturnType<typeof keySlots>): number {
  return empties(slots).filter(slot => slot.canGenerate).length;
}

describe('keySlots', () => {
  it('should offer one Generate action on the first slot when an active bot has no keys', () => {
    const slots = keySlots([], 'ACTIVE');
    expect(slots.map(slot => slot.kind)).toEqual(['empty', 'empty']);
    expect(empties(slots)[0]).toMatchObject({ label: 'Slot 1', title: 'No key yet', canGenerate: true });
    expect(empties(slots)[1]).toMatchObject({ label: 'Slot 2', title: 'Rotation slot', canGenerate: false });
  });

  it('should fill slot 1 and offer Generate on slot 2 when an active bot has one key', () => {
    const slots = keySlots([key('a')], 'ACTIVE');
    expect(slots[0]).toMatchObject({ kind: 'filled', label: 'Slot 1' });
    expect(slots[1]).toMatchObject({ kind: 'empty', title: 'Free slot', canGenerate: true });
  });

  it('should offer no Generate action when both slots are filled', () => {
    const slots = keySlots([key('a'), key('b')], 'ACTIVE');
    expect(slots.map(slot => slot.kind)).toEqual(['filled', 'filled']);
    expect(generateActions(slots)).toBe(0);
  });

  it('should ignore revoked and expired keys', () => {
    const slots = keySlots([key('a', 'REVOKED'), key('b', 'EXPIRED'), key('c')], 'ACTIVE');
    expect(slots[0]).toMatchObject({ kind: 'filled', key: { id: 'c' } });
    expect(slots[1]).toMatchObject({ kind: 'empty', title: 'Free slot' });
  });

  it('should never show more than two filled slots', () => {
    expect(keySlots([key('a'), key('b'), key('c')], 'ACTIVE')).toHaveLength(2);
  });

  it.each<[BotItem['status'], string]>([
    ['SUSPENDED', 'Bot is suspended'],
    ['DELETING', 'Bot is being deleted'],
    ['DELETED', 'Bot is deleted'],
  ])('should block generation and explain why for a %s bot with no keys', (status, title) => {
    const slots = keySlots([], status);
    expect(empties(slots)[0]).toMatchObject({ title, canGenerate: false });
    expect(empties(slots)[1]).toMatchObject({ title: 'Rotation slot', canGenerate: false });
  });

  it('should block the next empty slot of a suspended bot that holds one key', () => {
    const slots = keySlots([key('a')], 'SUSPENDED');
    expect(slots[0]?.kind).toBe('filled');
    expect(slots[1]).toMatchObject({ kind: 'empty', title: 'Bot is suspended', text: 'Resume the bot to generate keys.', canGenerate: false });
  });

  it.each<[BotItem['status']]>([['ACTIVE'], ['SUSPENDED'], ['DELETING'], ['DELETED']])('should expose at most one Generate action for a %s bot', status => {
    for (const keys of [[], [key('a')], [key('a'), key('b')]]) expect(generateActions(keySlots(keys, status))).toBeLessThanOrEqual(1);
  });

  it('should never offer Generate on the second slot while the first is empty', () => {
    expect(empties(keySlots([], 'ACTIVE'))[1]?.canGenerate).toBe(false);
  });
});

describe('keyExpiryWarning', () => {
  const at = (days: number, extraMs = 0): string => new Date(NOW + days * DAY_MS + extraMs).toISOString();

  it('should stay silent beyond seven days', () => {
    expect(keyExpiryWarning(at(8), NOW)).toBeNull();
    expect(keyExpiryWarning(at(7, 1), NOW)).toBeNull();
  });

  it('should warn in days within seven days', () => {
    expect(keyExpiryWarning(at(7), NOW)).toBe('Expires in 7 days');
    expect(keyExpiryWarning(at(6, 1), NOW)).toBe('Expires in 7 days');
    expect(keyExpiryWarning(at(2), NOW)).toBe('Expires in 2 days');
  });

  it('should use the singular on the last day', () => {
    expect(keyExpiryWarning(at(1), NOW)).toBe('Expires in 1 day');
  });

  it('should say today once the expiry is within the current day or past', () => {
    expect(keyExpiryWarning(at(0), NOW)).toBe('Expires today');
    expect(keyExpiryWarning(at(-3), NOW)).toBe('Expires today');
  });
});

describe('formatKeyUsage', () => {
  it.each([0, 1, 2])('should read %d of 2 in use', count => {
    expect(formatKeyUsage(count)).toBe(`${count} of 2 in use`);
  });
});
