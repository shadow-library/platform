import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { answersSettled, readAnswers, writeAnswers } from '../src/features/chat/suggestion-store';

class MemoryStorage {
  private readonly items = new Map<string, string>();
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
  removeItem(key: string): void {
    this.items.delete(key);
  }
}

const original = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');

describe('suggestion answers', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'sessionStorage', { value: new MemoryStorage(), configurable: true });
  });

  afterEach(() => {
    if (original) Object.defineProperty(globalThis, 'sessionStorage', original);
    else Reflect.deleteProperty(globalThis, 'sessionStorage');
  });

  it('should keep a card’s answers across a remount until they are cleared', () => {
    writeAnswers('p1', { decisions: [[0, 'add']], scopes: [[1, 'never']] });
    expect(readAnswers('p1')).toEqual({ decisions: [[0, 'add']], scopes: [[1, 'never']] });
    expect(readAnswers('p2')).toEqual({ decisions: [], scopes: [] });
    writeAnswers('p1', { decisions: [], scopes: [] });
    expect(readAnswers('p1')).toEqual({ decisions: [], scopes: [] });
  });

  it('should ignore anything stored that is not a card’s answers', () => {
    globalThis.sessionStorage.setItem('nf.chat-answers.p3', '{"decisions":"nope"}');
    expect(readAnswers('p3')).toEqual({ decisions: [], scopes: [] });
    globalThis.sessionStorage.setItem('nf.chat-answers.p4', 'not json');
    expect(readAnswers('p4')).toEqual({ decisions: [], scopes: [] });
  });
});

describe('answersSettled', () => {
  const changeSet = [
    { op: 'entity.upsert', entityKey: 'council' },
    { op: 'entity.upsert', entityKey: 'maren' },
  ];
  const declined = new Map<number, 'add' | 'decline'>([
    [0, 'add'],
    [1, 'decline'],
  ]);

  it('should keep a pending card’s answers', () => {
    expect(answersSettled('pending', changeSet, declined, new Map())).toBe(false);
  });

  it('should keep a committed card’s answers until every decline has its scope', () => {
    expect(answersSettled('applied', changeSet, declined, new Map())).toBe(false);
    expect(answersSettled('applied', changeSet, declined, new Map([[1, 'never']]))).toBe(true);
    expect(answersSettled('discarded', changeSet, new Map([[0, 'add']]), new Map())).toBe(true);
  });

  it('should drop a replaced card’s answers at once', () => {
    expect(answersSettled('superseded', changeSet, declined, new Map())).toBe(true);
    expect(answersSettled('conflicted', changeSet, declined, new Map())).toBe(true);
  });

  it('should settle a declined action without a scope, since it is run or not rather than remembered', () => {
    const actionChangeSet = [{ op: 'action.organise_notes' }];
    expect(answersSettled('applied', actionChangeSet, new Map([[0, 'decline']]), new Map())).toBe(true);
  });
});
