import { afterEach, describe, expect, it, setSystemTime } from 'bun:test';

import { clearSendDraft, consoleSendStepUpUrl, EMPTY_SEND_DRAFT, readSendDraft, stashSendDraft } from '../src/features/send/send-draft';

function memoryStorage(): Storage {
  const entries = new Map<string, string>();
  return {
    getItem: key => entries.get(key) ?? null,
    setItem: (key, value) => void entries.set(key, value),
    removeItem: key => void entries.delete(key),
    clear: () => entries.clear(),
    key: index => [...entries.keys()][index] ?? null,
    get length() {
      return entries.size;
    },
  };
}

const DRAFT = { ...EMPTY_SEND_DRAFT, templateKey: 'sign-up', email: 'ada@example.com', payload: '{ "name": "Ada" }', service: 'memoir' };

describe('send draft', () => {
  afterEach(() => setSystemTime());

  it('should ignore and drop a draft stashed more than ten minutes ago, so an abandoned step-up does not keep recipients in the tab', () => {
    const storage = memoryStorage();
    setSystemTime(new Date('2026-09-28T10:00:00Z'));
    stashSendDraft(DRAFT, storage);

    setSystemTime(new Date('2026-09-28T10:09:59Z'));
    expect(readSendDraft(storage)).toEqual(DRAFT);

    setSystemTime(new Date('2026-09-28T10:10:01Z'));
    expect(readSendDraft(storage)).toBeNull();
    expect(storage.length).toBe(0);
  });

  it('should send the browser through the step-up prompt and back to the send page', () => {
    expect(consoleSendStepUpUrl()).toBe('/api/auth/step-up?return_to=%2Fsend');
  });

  it('should hand a stashed form back until it is cleared, then forget it', () => {
    const storage = memoryStorage();

    stashSendDraft(DRAFT, storage);

    expect(readSendDraft(storage)).toEqual(DRAFT);
    expect(readSendDraft(storage)).toEqual(DRAFT);
    clearSendDraft(storage);
    expect(readSendDraft(storage)).toBeNull();
    expect(storage.length).toBe(0);
  });

  it('should ignore a stored value that is not a send form', () => {
    const storage = memoryStorage();
    storage.setItem('pulse.send-draft', JSON.stringify({ templateKey: 42 }));

    expect(readSendDraft(storage)).toBeNull();
  });

  it('should ignore unreadable storage', () => {
    const storage = memoryStorage();
    storage.setItem('pulse.send-draft', '{not json');

    expect(readSendDraft(storage)).toBeNull();

    const blocked = {
      ...memoryStorage(),
      getItem: () => {
        throw new Error('storage blocked');
      },
    } as Storage;
    expect(readSendDraft(blocked)).toBeNull();
  });
});
